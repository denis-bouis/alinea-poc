import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nextThemeColor } from '@/types/domain'

export type PendingEntity = {
  type: 'person' | 'life_event' | 'theme' | 'place' | 'life_phase' | 'profile'
  icon: string
  label: string
  data: Record<string, unknown>
}

type SaveResult = { label: string; saved: boolean; error?: string }

// Mappe une valeur libre de l'extracteur vers l'enum people.relation_type
// ('famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre') — null si indéterminé.
function normalizeRelationType(raw?: string): string | null {
  if (!raw) return null
  const v = raw.toLowerCase().trim()
  if (['famille', 'family'].includes(v)) return 'famille'
  if (['amitié', 'amitie', 'ami', 'amie', 'amis', 'amitiés', 'friend', 'friendship'].includes(v)) return 'amitié'
  if (['professionnel', 'professionnelle', 'travail', 'collègue', 'collegue', 'pro', 'work', 'colleague'].includes(v)) return 'professionnel'
  if (['romantique', 'amour', 'amoureux', 'amoureuse', 'conjoint', 'conjointe', 'partenaire', 'romantic', 'love'].includes(v)) return 'romantique'
  // Liens familiaux exprimés en clair → 'famille'
  if (/(père|pere|mère|mere|frère|frere|sœur|soeur|fils|fille|parent|grand-|oncle|tante|cousin|cousine|neveu|nièce|niece|époux|epoux|épouse|epouse|mari|femme|enfant)/.test(v)) return 'famille'
  return 'autre'
}

export async function POST(request: NextRequest) {
  const { entities } = await request.json() as { entities: PendingEntity[] }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const results: SaveResult[] = []

  for (const entity of entities) {
    try {
      switch (entity.type) {

        case 'profile': {
          const d = entity.data as { display_name?: string; birth_year?: number }
          if (!d.display_name && !d.birth_year) { results.push({ label: entity.label, saved: true }); break }
          const { error } = await supabase.from('profiles').update({
            ...(d.display_name ? { display_name: d.display_name } : {}),
          }).eq('id', user.id)
          // Si birth_year → mettre aussi à jour user_memory
          if (!error && d.birth_year) {
            await supabase.from('user_memory').upsert({ user_id: user.id, birth_year: d.birth_year }, { onConflict: 'user_id' })
          }
          // Marquer onboarding_step au minimum à 1 si on mémorise le profil
          if (!error) {
            await supabase.from('profiles')
              .update({ onboarding_step: 4 })
              .eq('id', user.id)
              .lt('onboarding_step', 4)
          }
          results.push({ label: entity.label, saved: !error, error: error?.message })
          break
        }

        case 'person': {
          const d = entity.data as { name: string; relation?: string; relation_type?: string }
          // L'extracteur peut renvoyer un relation_type hors enum ('sœur', 'ami'…)
          // → on le mappe sur les valeurs autorisées par la contrainte, sinon null.
          const relType = normalizeRelationType(d.relation_type)
          const { error } = await supabase.from('people').insert({
            user_id:              user.id,
            name:                 d.name,
            relation:             d.relation ?? d.relation_type ?? null,
            relation_type:        relType,
            first_mention:        'dialogue',
            pending_qualification: false,
          })
          results.push({ label: entity.label, saved: !error, error: error?.message })
          break
        }

        case 'life_event': {
          const d = entity.data as { title: string; year?: number; theme_name?: string }
          const { data: ev, error } = await supabase.from('life_events').insert({
            user_id:   user.id,
            title:     d.title,
            year:      d.year ?? new Date().getFullYear(),
            status:    'undocumented',
            is_pivot:  false,
            emotional_intensity: 1,
          }).select('id').single()

          if (!error && ev && d.theme_name) {
            // Tenter d'associer une thématique existante
            const { data: theme } = await supabase
              .from('themes')
              .select('id')
              .eq('user_id', user.id)
              .ilike('name', d.theme_name)
              .single()
            if (theme) {
              await supabase.from('life_event_themes').insert({
                life_event_id: ev.id,
                theme_id:      theme.id,
                validated:     true,
              })
            }
          }
          results.push({ label: entity.label, saved: !error, error: error?.message })
          break
        }

        case 'theme': {
          const d = entity.data as { name: string }
          // Récupérer les couleurs déjà utilisées pour éviter les doublons visuels
          const { data: existing } = await supabase
            .from('themes')
            .select('color')
            .eq('user_id', user.id)
          const usedColors = (existing ?? []).map(t => t.color)
          const color = nextThemeColor(usedColors)
          const { error } = await supabase.from('themes').insert({
            user_id:  user.id,
            name:     d.name,
            color,
            maturity: 'emerging',
          })
          results.push({ label: entity.label, saved: !error, error: error?.message })
          break
        }

        case 'place': {
          const d = entity.data as { name: string; role?: string }
          // Stocker dans user_memory.key_places (jsonb array)
          const { data: mem } = await supabase
            .from('user_memory')
            .select('key_places')
            .eq('user_id', user.id)
            .single()

          const places = (mem?.key_places ?? []) as Array<{ name: string; role: string }>
          if (!places.find(p => p.name.toLowerCase() === d.name.toLowerCase())) {
            places.push({ name: d.name, role: d.role ?? '' })
            const { error } = await supabase
              .from('user_memory')
              .update({ key_places: places })
              .eq('user_id', user.id)
            results.push({ label: entity.label, saved: !error, error: error?.message })
          } else {
            results.push({ label: entity.label, saved: true }) // déjà présent
          }
          break
        }

        case 'life_phase': {
          const d = entity.data as { name: string; year_start?: number | null; year_end?: number | null }
          // Calculer sort_order : nombre de phases existantes
          const { count } = await supabase
            .from('life_phases')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
          const { error } = await supabase.from('life_phases').insert({
            user_id:    user.id,
            name:       d.name,
            year_start: d.year_start ?? null,
            year_end:   d.year_end ?? null,
            sort_order: count ?? 0,
          })
          results.push({ label: entity.label, saved: !error, error: error?.message })
          break
        }

        default:
          results.push({ label: entity.label, saved: false, error: 'Type inconnu' })
      }
    } catch (e) {
      results.push({ label: entity.label, saved: false, error: String(e) })
    }
  }

  const failed = results.filter(r => !r.saved)
  // Si au moins une entité a échoué, on le signale (statut 207) pour ne pas
  // masquer un échec côté client — l'IHM doit pouvoir l'afficher.
  if (failed.length > 0) {
    return NextResponse.json(
      { results, ok: false, error: failed.map(f => `${f.label}: ${f.error ?? 'échec'}`).join(' · ') },
      { status: 207 },
    )
  }
  return NextResponse.json({ results, ok: true })
}
