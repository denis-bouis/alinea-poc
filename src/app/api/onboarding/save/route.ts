import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { nextThemeColor } from '@/types/domain'

type PersonInput = {
  name: string
  relation: string
  relationType: 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre'
}

type EventInput = {
  year: number
  title: string
  themeNames: string[]
  isPivot?: boolean
  emotionalIntensity?: number
}

type OnboardingPayload = {
  displayName: string
  birthYear: number
  people: PersonInput[]
  personRelations: Array<{ aName: string; bName: string; label: string }>
  events: EventInput[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload: OnboardingPayload = await req.json()
  const userId = user.id

  try {
    // 1. Marquer l'onboarding terminé
    await supabase.from('profiles').update({
      display_name:     payload.displayName,
      onboarding_step:  10,
    }).eq('id', userId)

    // 2. user_memory
    await supabase.from('user_memory').upsert({
      user_id:    userId,
      birth_year: payload.birthYear,
    }, { onConflict: 'user_id' })

    // 3. Thématiques — trouver les existantes, créer seulement les nouvelles
    const { data: existingThemes } = await supabase
      .from('themes').select('id, name, color').eq('user_id', userId)
    const themeMap: Record<string, string> = {}
    const existingColors = (existingThemes ?? []).map(t => t.color)

    const allThemeNames = [...new Set(payload.events.flatMap(e => e.themeNames))]
    for (const name of allThemeNames) {
      const found = existingThemes?.find(t => t.name.toLowerCase() === name.toLowerCase())
      if (found) {
        themeMap[name] = found.id
      } else {
        const color = nextThemeColor(existingColors)
        existingColors.push(color)
        const { data } = await supabase
          .from('themes').insert({ user_id: userId, name, color, maturity: 'emerging' }).select('id').single()
        if (data) themeMap[name] = data.id
      }
    }

    // 4. Événements de frise — créer seulement les nouveaux
    for (const ev of payload.events) {
      const { data: existing } = await supabase
        .from('life_events').select('id')
        .eq('user_id', userId).eq('year', ev.year).eq('title', ev.title)
        .maybeSingle()

      let eventId = existing?.id
      if (!eventId) {
        const { data: created } = await supabase
          .from('life_events')
          .insert({
            user_id: userId,
            year: ev.year,
            title: ev.title,
            status: 'undocumented',
            is_pivot: ev.isPivot ?? false,
            emotional_intensity: ev.emotionalIntensity ?? 1,
          })
          .select('id').single()
        eventId = created?.id
      }

      // Associations thématiques via life_event_themes
      if (eventId) {
        const themeIds = ev.themeNames.map(n => themeMap[n]).filter(Boolean)
        if (themeIds.length > 0) {
          await supabase.from('life_event_themes')
            .upsert(
              themeIds.map(themeId => ({ life_event_id: eventId, theme_id: themeId, validated: false })),
              { onConflict: 'life_event_id,theme_id', ignoreDuplicates: true }
            )
        }
      }
    }

    // 5. Personnes — créer seulement les nouvelles
    const personMap: Record<string, string> = {}
    for (const p of payload.people) {
      const { data: existing } = await supabase
        .from('people').select('id').eq('user_id', userId).ilike('name', p.name).maybeSingle()
      if (existing) {
        personMap[p.name] = existing.id
      } else {
        const { data } = await supabase
          .from('people')
          .insert({ user_id: userId, name: p.name, relation: p.relation, relation_type: p.relationType, first_mention: 'onboarding' })
          .select('id').single()
        if (data) personMap[p.name] = data.id
      }
    }

    // 6. Relations inter-personnes
    for (const rel of payload.personRelations) {
      const aId = personMap[rel.aName]
      const bId = personMap[rel.bName]
      if (aId && bId) {
        const { data: existing } = await supabase
          .from('people_relations').select('id')
          .eq('user_id', userId).eq('person_a_id', aId).eq('person_b_id', bId)
          .maybeSingle()
        if (!existing) {
          await supabase.from('people_relations').insert({
            user_id: userId, person_a_id: aId, person_b_id: bId,
            relation_label: rel.label, confirmed: true, declared_in: 'dialogue',
          })
        }
      }
    }

    // 7. Portrait narratif — généré par l'IA à partir des données collectées
    try {
      const anthropic = new Anthropic()
      const peopleDesc = payload.people.map(p => `${p.name} (${p.relation})`).join(', ')
      const eventsDesc = [...payload.events]
        .sort((a, b) => a.year - b.year)
        .map(e => `${e.year} — ${e.title}`)
        .join('; ')

      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 350,
        messages: [{
          role:    'user',
          content: `Tu es le compagnon de mémoire Alinéa. Génère un portrait narratif court (2-3 phrases) décrivant qui est cette personne. Ton chaleureux, synthétique, à la troisième personne. Pas de liste — uniquement du texte fluide.

Données :
- Prénom : ${payload.displayName || 'non renseigné'}
- Né(e) en : ${payload.birthYear}
- Proches : ${peopleDesc || 'non renseignés'}
- Moments clés : ${eventsDesc || 'non renseignés'}`,
        }],
      })

      const portrait = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
      if (portrait) {
        await supabase.from('user_memory').upsert(
          { user_id: userId, birth_year: payload.birthYear, portrait },
          { onConflict: 'user_id' }
        )
      }
    } catch (portraitErr) {
      console.error('[onboarding/save] portrait generation failed (non-blocking):', portraitErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[onboarding/save]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
