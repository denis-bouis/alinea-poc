import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TableauClient from './TableauClient'
import type { Theme, LifeEvent, LifePhase, Person, PersonRelation, UserMemory, Place } from '@/types/domain'
import type { AlineaListItem } from '@/components/cards/AlineasCard'

export default async function TableauPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_step')
    .eq('id', user.id)
    .single()

  const [
    { data: themes },
    { data: events },
    { data: phases },
    { data: eventThemes },
    { data: alineaRows },
    { data: people },
    { data: relations },
    { data: memory },
    { data: places },
    { data: alineaPeople },
    { data: lifeEventPeople },
    { data: alineaThemes },
    { data: alineaPlaces },
    { data: lifeEventPlaces },
  ] = await Promise.all([
    supabase.from('themes').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('life_events').select('*').eq('user_id', user.id).order('year'),
    supabase.from('life_phases').select('*').eq('user_id', user.id).order('sort_order').order('year_start'),
    supabase.from('life_event_themes').select('life_event_id, theme_id'),
    supabase.from('alineas').select('id, title, status, approximate_date, life_event_id').eq('user_id', user.id),
    supabase.from('people').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('people_relations').select('*').eq('user_id', user.id),
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
    // Tables de la migration 016 — tolérées absentes tant qu'elle n'est pas appliquée (Promise.all ne rejette pas, `data` est simplement null)
    supabase.from('places').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('alinea_people').select('alinea_id, person_id'),
    supabase.from('life_event_people').select('life_event_id, person_id'),
    supabase.from('alinea_themes').select('alinea_id, theme_id'),
    supabase.from('alinea_places').select('alinea_id, place_id'),
    supabase.from('life_event_places').select('life_event_id, place_id'),
  ])

  // Reconstruire theme_ids par event depuis la table de jonction
  const themesByEvent = new Map<string, string[]>()
  for (const row of (eventThemes ?? []) as { life_event_id: string; theme_id: string }[]) {
    const arr = themesByEvent.get(row.life_event_id) ?? []
    arr.push(row.theme_id)
    themesByEvent.set(row.life_event_id, arr)
  }

  const enrichedEvents: LifeEvent[] = (events ?? []).map((e) => ({
    ...(e as LifeEvent),
    theme_ids: themesByEvent.get((e as LifeEvent).id) ?? [],
  }))

  const themesByAlinea = new Map<string, string[]>()
  for (const row of (alineaThemes ?? []) as { alinea_id: string; theme_id: string }[]) {
    const arr = themesByAlinea.get(row.alinea_id) ?? []
    arr.push(row.theme_id)
    themesByAlinea.set(row.alinea_id, arr)
  }

  const alineaItems: AlineaListItem[] = (alineaRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    approximate_date: a.approximate_date,
    theme_ids: themesByAlinea.get(a.id) ?? [],
    life_event_id: a.life_event_id,
  }))

  const onboardingStep = (profile as { onboarding_step?: number } | null)?.onboarding_step ?? 0

  return (
    <TableauClient
      userName={profile?.display_name ?? null}
      onboardingStep={onboardingStep}
      themes={(themes ?? []) as Theme[]}
      events={enrichedEvents}
      phases={(phases ?? []) as LifePhase[]}
      people={(people ?? []) as Person[]}
      relations={(relations ?? []) as PersonRelation[]}
      birthYear={(memory as UserMemory | null)?.birth_year ?? null}
      portrait={(memory as UserMemory | null)}
      places={(places ?? []) as Place[]}
      alineas={alineaItems}
      alineaPeople={(alineaPeople ?? []) as { alinea_id: string; person_id: string }[]}
      lifeEventPeople={(lifeEventPeople ?? []) as { life_event_id: string; person_id: string }[]}
      alineaPlaces={(alineaPlaces ?? []) as { alinea_id: string; place_id: string }[]}
      lifeEventPlaces={(lifeEventPlaces ?? []) as { life_event_id: string; place_id: string }[]}
    />
  )
}
