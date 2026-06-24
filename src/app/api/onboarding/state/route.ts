import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id

  const [
    { data: profile },
    { data: memory },
    { data: people },
    { data: relations },
    { data: rawEvents },
    { data: themes },
    { data: eventThemes },
  ] = await Promise.all([
    supabase.from('profiles').select('display_name, onboarding_step').eq('id', uid).single(),
    supabase.from('user_memory').select('birth_year, portrait, key_places').eq('user_id', uid).single(),
    supabase.from('people').select('*').eq('user_id', uid).order('created_at'),
    supabase.from('people_relations').select('*').eq('user_id', uid),
    supabase.from('life_events')
      .select('id, year, title, status, is_pivot, emotional_intensity, created_at, updated_at')
      .eq('user_id', uid).order('year'),
    supabase.from('themes').select('*').eq('user_id', uid).order('created_at'),
    supabase.from('life_event_themes').select('life_event_id, theme_id'),
  ])

  // Reconstruire theme_ids depuis la table de jonction
  const themesByEvent = new Map<string, string[]>()
  for (const lt of (eventThemes ?? [])) {
    const arr = themesByEvent.get(lt.life_event_id) ?? []
    arr.push(lt.theme_id)
    themesByEvent.set(lt.life_event_id, arr)
  }

  const events = (rawEvents ?? []).map(e => ({
    ...e,
    theme_ids: themesByEvent.get(e.id) ?? [],
  }))

  return NextResponse.json({
    displayName:      profile?.display_name     ?? '',
    birthYear:        memory?.birth_year         ?? null,
    portrait:         memory?.portrait           ?? null,
    keyPlaces:        memory?.key_places         ?? [],
    onboardingStep:   profile?.onboarding_step   ?? 0,
    people:           people    ?? [],
    relations:        relations ?? [],
    events,
    themes:           themes    ?? [],
  })
}
