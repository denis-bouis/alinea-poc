'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EmotionTag, ThematicCategory, VisibilityLevel } from '@/types/database'
import type Anthropic from '@anthropic-ai/sdk'
import { parseFrenchDate } from '@/lib/parse-date'

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

export default function EditAlineaPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [userInput, setUserInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState<AlineaDraft | null>(null)
  const [existingContent, setExistingContent] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [approximateDate, setApproximateDate] = useState('')
  const [eventYear, setEventYear] = useState<number | ''>('')
  const [eventMonth, setEventMonth] = useState<number | ''>('')
  const [eventDay, setEventDay] = useState<number | ''>('')
  const [emotion, setEmotion] = useState<EmotionTag | ''>('')
  const [category, setCategory] = useState<ThematicCategory | ''>('')
  const [visibility, setVisibility] = useState<VisibilityLevel>('private')
  const [saving, setSaving] = useState(false)

  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('alineas')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) { router.push('/timeline'); return }

      setTitle(data.title ?? '')
      setContent(data.content ?? '')
      setExistingContent(data.content ?? '')
      setApproximateDate(data.approximate_date ?? '')
      setEventYear(data.event_year ?? '')
      setEventMonth(data.event_month ?? '')
      setEventDay(data.event_day ?? '')
      setEmotion(data.emotion ?? '')
      setCategory(data.category ?? '')
      setVisibility(data.visibility)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!loading && existingContent) sendToAI([], existingContent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendToAI(history: Message[], currentExistingContent?: string) {
    setStreaming(true)
    const apiMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const messagesForAPI = apiMessages.length === 0
      ? [{ role: 'user' as const, content: 'Aide-moi à retravailler ce récit' }]
      : apiMessages

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messagesForAPI,
        existingContent: currentExistingContent ?? existingContent,
      }),
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
      const { year, month, day } = parseFrenchDate(extractedDraft.approximate_date)
      setEventYear(year ?? '')
      setEventMonth(month ?? '')
      setEventDay(day ?? '')
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
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
    if (text) setUserInput((p) => p + (p ? ' ' : '') + text)
    setTranscribing(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    const { error } = await supabase.from('alineas').update({
      title: title || null,
      content,
      visibility,
      emotion: emotion || null,
      category: category || null,
      approximate_date: approximateDate || null,
      event_year: eventYear !== '' ? eventYear : null,
      event_month: eventMonth !== '' ? eventMonth : null,
      event_day: eventDay !== '' ? eventDay : null,
    }).eq('id', id)
    if (!error) router.push('/timeline')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <p className="text-muted text-sm">Chargement…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ink">Retravaille cet alinéa</h1>
        <p className="text-muted text-sm mt-1">L&apos;IA repart de ton récit existant.</p>
      </div>

      {/* Dialogue IA */}
      <div className="space-y-3 mb-8">
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
            <p className="text-xs text-accent font-semibold uppercase tracking-widest mb-2">Récit révisé</p>
            <p className="font-serif text-base text-ink leading-relaxed italic">{draft.content}</p>
            <p className="text-xs text-muted mt-3">Tu peux continuer à ajuster ci-dessous ou modifier directement le texte.</p>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 flex items-end gap-2 bg-surface border border-border rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={(e) => { setUserInput(e.target.value); autoResize(e.target) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleUserSend()
                  if (textareaRef.current) textareaRef.current.style.height = 'auto'
                }
              }}
              placeholder={transcribing ? 'Transcription en cours…' : draft ? 'Tu veux encore ajuster ?' : 'Réponds ici…'}
              rows={3}
              disabled={streaming || transcribing}
              className="flex-1 text-sm text-ink placeholder:text-muted/50 resize-none focus:outline-none bg-transparent overflow-hidden"
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
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSave} className="space-y-5 pt-6 border-t border-border">
        <p className="text-sm text-muted">Valide ou ajuste le récit avant de sauvegarder.</p>

        <Field label="Titre (optionnel)">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Ton souvenir *">
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className={`${inputCls} resize-none`}
          />
        </Field>

        <Field label="Quand ? (optionnel)">
          <input
            type="text"
            value={approximateDate}
            onChange={(e) => setApproximateDate(e.target.value)}
            placeholder="vers 1985 · été de mes 20 ans…"
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
    </div>
  )
}

const inputCls = 'w-full bg-cream border border-border rounded-xl px-4 py-2.5 text-ink placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-colors text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function VoiceButton({
  recording, transcribing, onStart, onStop,
}: {
  recording: boolean; transcribing: boolean
  onStart: () => void; onStop: () => void
}) {
  const cls = 'p-1.5 rounded-full hover:bg-surface2 transition-colors text-muted hover:text-accent'
  if (transcribing) return <span className={`${cls} opacity-60`}>⏳</span>
  if (recording) return (
    <button type="button" onClick={onStop} className={`${cls} text-red-500 animate-pulse`} title="Arrêter">⏹</button>
  )
  return (
    <button type="button" onClick={onStart} className={cls} title="Enregistrement vocal">🎙</button>
  )
}
