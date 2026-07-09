import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// chat_language est du texte libre (v. migration 020, ex. "italien" ou
// "italiano") — Whisper attend un code ISO-639-1. Couvre les langues
// probables des premiers testeurs bêta, en français et en natif/anglais.
const LANGUAGE_TO_ISO: Record<string, string> = {
  français: 'fr', french: 'fr', francese: 'fr',
  anglais: 'en', english: 'en', inglese: 'en',
  italien: 'it', italiano: 'it', italian: 'it',
  espagnol: 'es', español: 'es', spanish: 'es', espagnolo: 'es',
  allemand: 'de', deutsch: 'de', german: 'de', tedesco: 'de',
  portugais: 'pt', português: 'pt', portuguese: 'pt',
  néerlandais: 'nl', nederlands: 'nl', dutch: 'nl',
}

async function resolveLanguage(): Promise<string | undefined> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'fr'

    const { data: profile } = await supabase
      .from('profiles')
      .select('chat_language')
      .eq('id', user.id)
      .single()

    const chatLanguage = profile?.chat_language?.trim().toLowerCase()
    if (!chatLanguage) return 'fr'

    // Langue connue → code ISO transmis à Whisper. Langue non reconnue →
    // pas de paramètre plutôt qu'un mauvais code, Whisper détecte seul.
    return LANGUAGE_TO_ISO[chatLanguage]
  } catch {
    return 'fr'
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const audio = formData.get('audio') as File | null

  if (!audio) {
    return NextResponse.json({ error: 'No audio file' }, { status: 400 })
  }

  const language = await resolveLanguage()

  const groqForm = new FormData()
  groqForm.append('file', audio, 'recording.webm')
  groqForm.append('model', 'whisper-large-v3-turbo')
  if (language) groqForm.append('language', language)
  groqForm.append('response_format', 'json')

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: groqForm,
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error }, { status: response.status })
  }

  const { text } = await response.json() as { text: string }
  return NextResponse.json({ text })
}
