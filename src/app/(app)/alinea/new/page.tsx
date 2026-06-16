'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EmotionTag, ThematicCategory, VisibilityLevel } from '@/types/database'
import type Anthropic from '@anthropic-ai/sdk'

type Mode = 'guided' | 'free'
type Message = { role: 'user' | 'assistant'; content: string }
type AlineaDraft = {
  title: string
  content: string
  emotion: EmotionTag | null
  category: ThematicCategory | null
  approximate_date: string | null
}

const EMOTIONS: { value: EmotionTag; label: string }[] = [
  { value: 'joy', label: 'Joie' },
  { value: 'pride', label: 'Fierté' },
  { value: 'nostalgia', label: 'Nostalgie' },
  { value: 'sadness', label: 'Tristesse' },
  { value: 'gratitude', label: 'Gratitude' },
]

const CATEGORIES: { value: ThematicCategory; label: string }[] = [
  { value: 'places', label: 'Lieu' },
  { value: 'people', label: 'Personne' },
  { value: 'moments', label: 'Moment' },
  { value: 'transitions', label: 'Transition' },
  { value: 'objects', label: 'Objet' },
  { value: 'values', label: 'Valeur' },
]

const VISIBILITIES: { value: VisibilityLevel; label: string; desc: string }[] = [
  { value: 'private', label: 'Privé', desc: 'Toi seul' },
  { value: 'family', label: 'Famille', desc: 'Ton cercle famille' },
  { value: 'circle', label: 'Cercle', desc: 'Cercles choisis' },
  { value: 'public', label: 'Public', desc: 'Tout le monde' },
  { value: 'confidential', label: 'Confidentiel à jamais', desc: 'Jamais partagé' },
]

function parseDraft(text: string): AlineaDraft | null {
  const match = text.match(/```alinea-draft\n([\s\S]*?)\n```/)
  if (!match) return null
  try { return JSON.parse(match[1]) as AlineaDraft } catch { return null }
}

function stripDraftBlock(text: string): string {
  return text.replace(/```alinea-draft[\s\S]*?```/, '').trim()
}

export default function NewAlineaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('guided')
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState<AlineaDraft | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [approximateDate, setApproximateDate] = useState('')
  const [eventYear,  setEventYear]  = useState<number | ''>('')
  const [eventMonth, setEventMonth] = useState<number | ''>('')
  const [eventDay,   setEventDay]   = useState<number | ''>(``)
  const [emotion, setEmotion] = useState<EmotionTag | ''>('')
  const [category, setCategory] = useState<ThematicCategory | ''>('')
  const [visibility, setVisibility] = useState<VisibilityLevel>('private')
  const [saving, setSaving] = useState(false)

  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (mode === 'guided' && messages.length === 0) sendToAI([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendToAI(history: Message[]) {
    setStreaming(true)
    const apiMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const messagesForAPI = apiMessages.length === 0
      ? [{ role: 'user' as const, content: 'Commence' }]
      : apiMessages

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesForAPI }),
    })

    if (!response.body) { setStreaming(false); return }

    let accumulated = ''
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      accumulated += decoder.decode(value, { stream: true })
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: accumulated }
        return updated
      })
    }

    const extractedDraft = parseDraft(accumulated)
    if (extractedDraft) {
      setDraft(extractedDraft)
      setTitle(extractedDraft.title)
      setContent(extractedDraft.content)
      setEmotion(extractedDraft.emotion ?? '')
      setCategory(extractedDraft.category ?? '')
      setApproximateDate(extractedDraft.approximate_date ?? '')
      // Tenter d'extraire une année du champ approximate_date généré par Claude
      const yearMatch = extractedDraft.approximate_date?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)
      if (yearMatch) setEventYear(parseInt(yearMatch[1]))
      setEventMonth('')
      setEventDay('')
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: stripDraftBlock(accumulated) }
        return updated
      })
    }

    setStreaming(false)
  }

  async function handleUserSend() {
    if (!userInput.trim() || streaming) return
    const newMessage: Message = { role: 'user', content: userInput.trim() }
    const newHistory = [...messages, newMessage]
    setMessages(newHistory)
    setUserInput('')
    await sendToAI(newHistory)
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      await transcribeAudio(new Blob(chunksRef.current, { type: 'audio/webm' }))
    }
    mediaRecorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function transcribeAudio(blob: Blob) {
    setTranscribing(true)
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    const res = await fetch('/api/transcribe', { method: 'POST', body: form })
    const { text } = await res.json() as { text: string }
    if (text) {
      if (mode === 'guided') setUserInput((p) => p + (p ? ' ' : '') + text)
      else setContent((p) => p + (p ? '\n\n' : '') + text)
    }
    setTranscribing(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { error } = await supabase.from('alineas').insert({
      user_id: user.id,
      title: title || null,
      content,
      format: 'text',
      visibility,
      emotion: emotion || null,
      category: category || null,
      approximate_date: approximateDate || null,
      event_year:  eventYear  !== '' ? eventYear  : null,
      event_month: eventMonth !== '' ? eventMonth : null,
      event_day:   eventDay   !== '' ? eventDay   : null,
    })
    if (!error) router.push('/timeline')
    setSaving(false)
  }

  return (
    <div>
      {/* En-tête + toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl font-bold text-ink">Nouvel alinéa</h1>
        <div className="flex gap-1 bg-surface border border-border rounded-full p-1">
          {(['guided', 'free'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); if (m === 'guided' && messages.length === 0) setDraft(null) }}
              className={`text-xs font-medium px-4 py-1.5 rounded-full transition-all ${
                mode === m
                  ? 'bg-accent text-cream shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {m === 'guided' ? 'Guidé par l\'IA' : 'Écriture libre'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mode guidé ── */}
      {mode === 'guided' && (
        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 min-h-48 max-h-96 overflow-y-auto">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent text-cream'
                    : 'bg-cream border border-border text-ink'
                }`}>
                  {m.content || <span className="opacity-40 italic">…</span>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {draft && (
            <div className="bg-accent-lt border border-accent/20 rounded-2xl p-5">
              <p className="text-xs text-accent font-semibold uppercase tracking-widest mb-2">Brouillon d&apos;alinéa</p>
              <p className="font-serif text-base text-ink leading-relaxed italic">{draft.content}</p>
              <p className="text-xs text-muted mt-3">Tu peux ajuster le texte dans le formulaire ci-dessous.</p>
            </div>
          )}

          {!draft && (
            <div className="flex gap-2">
              <div className="flex-1 flex items-end gap-2 bg-surface border border-border rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserSend() }
                  }}
                  placeholder={transcribing ? 'Transcription en cours…' : 'Réponds ici…'}
                  rows={1}
                  disabled={streaming || transcribing}
                  className="flex-1 text-sm text-ink placeholder:text-muted/50 resize-none focus:outline-none bg-transparent"
                />
                <VoiceButton recording={recording} transcribing={transcribing} onStart={startRecording} onStop={stopRecording} />
              </div>
              <button
                onClick={handleUserSend}
                disabled={streaming || !userInput.trim()}
                className="bg-accent text-cream rounded-full px-5 text-sm font-semibold hover:bg-accent-dk disabled:opacity-40 transition-colors shrink-0"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Formulaire ── */}
      {(mode === 'free' || draft) && (
        <form onSubmit={handleSave} className={`space-y-5 ${mode === 'guided' ? 'mt-8 pt-6 border-t border-border' : ''}`}>
          {mode === 'guided' && (
            <p className="text-sm text-muted">Valide ou ajuste le brouillon avant de sauvegarder.</p>
          )}

          <Field label="Titre (optionnel)">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="L'été à Saint-Malo, mes 12 ans…"
              className={inputCls}
            />
          </Field>

          <Field
            label="Ton souvenir *"
            action={mode === 'free' ? <VoiceButton recording={recording} transcribing={transcribing} onStart={startRecording} onStop={stopRecording} inline /> : undefined}
          >
            <textarea
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Raconte ce moment comme tu le ferais à un proche…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          <Field label="Quand ? (optionnel)">
            <input
              type="text"
              value={approximateDate}
              onChange={(e) => setApproximateDate(e.target.value)}
              placeholder="vers 1985 · été de mes 20 ans · 12 juin 1992…"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Année">
              <input
                type="number"
                value={eventYear}
                onChange={(e) => setEventYear(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="1985"
                min={1900}
                max={new Date().getFullYear()}
                className={inputCls}
              />
            </Field>
            <Field label="Mois">
              <select
                value={eventMonth}
                onChange={(e) => setEventMonth(e.target.value === '' ? '' : parseInt(e.target.value))}
                className={inputCls}
              >
                <option value="">—</option>
                {['Janvier','Février','Mars','Avril','Mai','Juin',
                  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
                ].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Jour">
              <input
                type="number"
                value={eventDay}
                onChange={(e) => setEventDay(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="15"
                min={1}
                max={31}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Émotion">
              <select value={emotion} onChange={(e) => setEmotion(e.target.value as EmotionTag | '')} className={inputCls}>
                <option value="">—</option>
                {EMOTIONS.map((em) => <option key={em.value} value={em.value}>{em.label}</option>)}
              </select>
            </Field>
            <Field label="Thème">
              <select value={category} onChange={(e) => setCategory(e.target.value as ThematicCategory | '')} className={inputCls}>
                <option value="">—</option>
                {CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Visibilité">
            <div className="space-y-2.5">
              {VISIBILITIES.map((v) => (
                <label key={v.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="visibility"
                    value={v.value}
                    checked={visibility === v.value}
                    onChange={() => setVisibility(v.value)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-ink group-hover:text-accent transition-colors">{v.label}</span>
                  <span className="text-xs text-muted">{v.desc}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 border border-border text-muted rounded-full px-4 py-3 text-sm font-medium hover:border-accent/40 hover:text-ink transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !content.trim()}
              className="flex-1 bg-accent text-cream rounded-full px-4 py-3 text-sm font-semibold hover:bg-accent-dk disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement…' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-cream border border-border rounded-xl px-4 py-2.5 text-ink placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-colors text-sm'

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-ink">{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}

function VoiceButton({
  recording, transcribing, onStart, onStop, inline = false,
}: {
  recording: boolean; transcribing: boolean
  onStart: () => void; onStop: () => void; inline?: boolean
}) {
  const cls = inline
    ? 'text-xs text-muted hover:text-accent transition-colors'
    : 'p-1.5 rounded-full hover:bg-surface2 transition-colors text-muted hover:text-accent'

  if (transcribing) return <span className={`${cls} opacity-60`}>{inline ? '⏳' : '⏳'}</span>
  if (recording) return (
    <button type="button" onClick={onStop} className={`${cls} text-red-500 animate-pulse`} title="Arrêter">
      {inline ? '⏹ stop' : '⏹'}
    </button>
  )
  return (
    <button type="button" onClick={onStart} className={cls} title="Enregistrement vocal">
      {inline ? '🎙 vocal' : '🎙'}
    </button>
  )
}
