import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nextThemeColor } from '@/types/domain'

type SaveRequest =
  | { type: 'profile';          displayName: string; birthYear: number }
  | { type: 'person';           name: string; relation: string; relationType: string }
  | { type: 'relation';         aPersonId: string; bPersonId: string; label: string }
  | { type: 'theme';            name: string }
  | { type: 'event';            year: number; title: string; themeNames: string[]; isPivot?: boolean; emotionalIntensity?: number }
  | { type: 'key_place';        name: string; role: string }
  | { type: 'dominant_emotion'; value: string; context: string }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const uid  = user.id
    const body = await request.json() as SaveRequest

    switch (body.type) {

      // ── Profil ─────────────────────────────────────────────────────────────
      case 'profile': {
        await Promise.all([
          supabase.from('profiles').update({ display_name: body.displayName }).eq('id', uid),
          supabase.from('user_memory').upsert(
            { user_id: uid, birth_year: body.birthYear },
            { onConflict: 'user_id' }
          ),
        ])
        return NextResponse.json({ type: 'profile', ok: true })
      }

      // ── Personne ───────────────────────────────────────────────────────────
      case 'person': {
        const { data: existing } = await supabase
          .from('people').select('id').eq('user_id', uid).ilike('name', body.name).maybeSingle()
        if (existing) return NextResponse.json({ type: 'person', id: existing.id })

        const { data: created } = await supabase
          .from('people')
          .insert({ user_id: uid, name: body.name, relation: body.relation, relation_type: body.relationType, first_mention: 'onboarding' })
          .select('id').single()
        return NextResponse.json({ type: 'person', id: created?.id ?? null })
      }

      // ── Relation inter-personnes ───────────────────────────────────────────
      case 'relation': {
        const { data: existing } = await supabase
          .from('people_relations').select('id')
          .eq('user_id', uid).eq('person_a_id', body.aPersonId).eq('person_b_id', body.bPersonId)
          .maybeSingle()
        if (existing) return NextResponse.json({ type: 'relation', id: existing.id })

        const { data: created } = await supabase
          .from('people_relations')
          .insert({ user_id: uid, person_a_id: body.aPersonId, person_b_id: body.bPersonId, relation_label: body.label, confirmed: true, declared_in: 'dialogue' })
          .select('id').single()
        return NextResponse.json({ type: 'relation', id: created?.id ?? null })
      }

      // ── Thématique standalone ─────────────────────────────────────────────
      case 'theme': {
        const { data: existingThemes } = await supabase
          .from('themes').select('id, color').eq('user_id', uid)
        const existing = await supabase
          .from('themes').select('id').eq('user_id', uid).ilike('name', body.name).maybeSingle()
        if (existing.data) return NextResponse.json({ type: 'theme', id: existing.data.id })

        const color = nextThemeColor((existingThemes ?? []).map(t => t.color))
        const { data: created } = await supabase
          .from('themes')
          .upsert({ user_id: uid, name: body.name, color, maturity: 'emerging' }, { onConflict: 'user_id,name' })
          .select('id').single()
        return NextResponse.json({ type: 'theme', id: created?.id ?? null })
      }

      // ── Événement (+ thématiques via life_event_themes) ───────────────────
      case 'event': {
        // Trouver ou créer les thématiques
        const { data: existingThemes } = await supabase
          .from('themes').select('id, name, color').eq('user_id', uid)
        const themeMap: Record<string, string> = {}
        const existingColors = (existingThemes ?? []).map(t => t.color)

        for (const name of (body.themeNames ?? [])) {
          const found = existingThemes?.find(t => t.name.toLowerCase() === name.toLowerCase())
          if (found) {
            themeMap[name] = found.id
          } else {
            const color = nextThemeColor(existingColors)
            existingColors.push(color)
            const { data: created } = await supabase
              .from('themes')
              .upsert({ user_id: uid, name, color, maturity: 'emerging' }, { onConflict: 'user_id,name' })
              .select('id').single()
            if (created) themeMap[name] = created.id
          }
        }

        const themeIds = Object.values(themeMap).filter(Boolean)

        // Vérifier si l'événement existe déjà
        const { data: existingEvent } = await supabase
          .from('life_events').select('id')
          .eq('user_id', uid).eq('year', body.year).eq('title', body.title)
          .maybeSingle()

        if (existingEvent) {
          // Ajouter les nouvelles associations thématiques sans doublon
          if (themeIds.length > 0) {
            await supabase.from('life_event_themes')
              .upsert(
                themeIds.map(themeId => ({ life_event_id: existingEvent.id, theme_id: themeId, validated: false })),
                { onConflict: 'life_event_id,theme_id', ignoreDuplicates: true }
              )
          }
          return NextResponse.json({ type: 'event', id: existingEvent.id, themeIds: themeMap })
        }

        // Créer l'événement
        const { data: created } = await supabase
          .from('life_events')
          .insert({
            user_id: uid,
            year: body.year,
            title: body.title,
            status: 'undocumented',
            is_pivot: body.isPivot ?? false,
            emotional_intensity: body.emotionalIntensity ?? 1,
          })
          .select('id').single()

        // Créer les associations thématiques
        if (created && themeIds.length > 0) {
          await supabase.from('life_event_themes')
            .insert(themeIds.map(themeId => ({ life_event_id: created.id, theme_id: themeId, validated: false })))
        }

        return NextResponse.json({ type: 'event', id: created?.id ?? null, themeIds: themeMap })
      }

      // ── Lieu marquant (user_memory.key_places) ────────────────────────────
      case 'key_place': {
        const { data: mem } = await supabase
          .from('user_memory').select('key_places').eq('user_id', uid).single()
        const places = (mem?.key_places as Array<{ name: string; role: string }> | null) ?? []
        if (!places.some(p => p.name.toLowerCase() === body.name.toLowerCase())) {
          places.push({ name: body.name, role: body.role })
          await supabase.from('user_memory')
            .upsert({ user_id: uid, key_places: places }, { onConflict: 'user_id' })
        }
        return NextResponse.json({ type: 'key_place', ok: true })
      }

      // ── Émotion dominante (user_memory.dominant_emotions) ─────────────────
      case 'dominant_emotion': {
        const { data: mem } = await supabase
          .from('user_memory').select('dominant_emotions').eq('user_id', uid).single()
        const emotions = (mem?.dominant_emotions as Array<{ value: string; context: string }> | null) ?? []
        if (!emotions.some(e => e.value === body.value && e.context === body.context)) {
          emotions.push({ value: body.value, context: body.context })
          await supabase.from('user_memory')
            .upsert({ user_id: uid, dominant_emotions: emotions }, { onConflict: 'user_id' })
        }
        return NextResponse.json({ type: 'dominant_emotion', ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }

  } catch (err) {
    console.error('[save-item]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
