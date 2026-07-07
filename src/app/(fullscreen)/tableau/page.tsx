import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TableauClient from './TableauClient'
import type { Theme, LifeEvent, LifePhase, Person, PersonRelation, UserMemory } from '@/types/domain'

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
  ] = await Promise.all([
    supabase.from('themes').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('life_events').select('*').eq('user_id', user.id).order('year'),
    supabase.from('life_phases').select('*').eq('user_id', user.id).order('sort_order').order('year_start'),
    supabase.from('life_event_themes').select('life_event_id, theme_id'),
    supabase.from('alineas').select('id, life_event_id').eq('user_id', user.id),
    supabase.from('people').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('people_relations').select('*').eq('user_id', user.id),
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
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

  // Compter les alinéas par life_event
  const alineaCounts: Record<string, number> = {}
  for (const a of (alineaRows ?? []) as { life_event_id: string | null }[]) {
    if (a.life_event_id) alineaCounts[a.life_event_id] = (alineaCounts[a.life_event_id] ?? 0) + 1
  }

  const onboardingStep = (profile as { onboarding_step?: number } | null)?.onboarding_step ?? 0

  return (
    <TableauClient
      userName={profile?.display_name ?? null}
      onboardingStep={onboardingStep}
      themes={(themes ?? []) as Theme[]}
      events={enrichedEvents}
      phases={(phases ?? []) as LifePhase[]}
      alineaCounts={alineaCounts}
      people={(people ?? []) as Person[]}
      relations={(relations ?? []) as PersonRelation[]}
      birthYear={(memory as UserMemory | null)?.birth_year ?? null}
      portrait={(memory as UserMemory | null)}
    />
  )
}
