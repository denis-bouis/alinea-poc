import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supprime toutes les données de l'utilisateur courant — debug uniquement
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id

  // Les tables de jonction (alinea_themes, alinea_people, life_event_people)
  // n'ont pas de user_id — elles sont supprimées par CASCADE.
  // Ordre : supprimer les enfants avant les parents pour éviter les FK errors.
  const tables = [
    'people_relations',
    'alineas',
    'life_events',
    'people',
    'themes',
    'user_memory',
  ] as const

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', uid)
    if (error) console.warn(`[reset] ${table}:`, error.message)
  }

  // Remettre l'onboarding à zéro
  await supabase.from('profiles').update({ onboarding_step: 0 }).eq('id', uid)

  return NextResponse.json({ ok: true })
}
