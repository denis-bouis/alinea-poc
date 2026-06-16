import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const audio = formData.get('audio') as File | null

  if (!audio) {
    return NextResponse.json({ error: 'No audio file' }, { status: 400 })
  }

  const groqForm = new FormData()
  groqForm.append('file', audio, 'recording.webm')
  groqForm.append('model', 'whisper-large-v3-turbo')
  groqForm.append('language', 'fr')
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
