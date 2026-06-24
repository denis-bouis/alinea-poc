import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TableauClient from './TableauClient'
import type { Theme, LifeEvent, Person, PersonRelation, UserMemory } from '@/types/domain'

export default async function TableauPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const [
    { data: themes },
    { data: events },
    { data: people },
    { data: relations },
    { data: memory },
  ] = await Promise.all([
    supabase.from('themes').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('life_events').select('*').eq('user_id', user.id).order('year'),
    supabase.from('people').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('people_relations').select('*').eq('user_id', user.id),
    supabase.from('user_memory').select('*').eq('user_id', user.id).single(),
  ])

  // Redirige vers l'onboarding seulement si aucune donnée
  const hasData = (events?.length ?? 0) > 0 || (people?.length ?? 0) > 0
  if (!hasData) redirect('/onboarding')

  return (
    <TableauClient
      userName={profile?.display_name ?? 'Moi'}
      themes={(themes ?? []) as Theme[]}
      events={(events ?? []) as LifeEvent[]}
      people={(people ?? []) as Person[]}
      relations={(relations ?? []) as PersonRelation[]}
      birthYear={(memory as UserMemory | null)?.birth_year ?? 1960}
      portrait={(memory as UserMemory | null)}
    />
  )
}
