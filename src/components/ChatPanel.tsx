'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseFrenchDate } from '@/lib/parse-date'
import type { Theme, LifeEvent } from '@/types/domain'
import type { EmotionTag, ThematicCategory } from '@/types/database'
import type { PendingWrite } from '@/app/api/memory/confirm/route'
import type { EntityRef } from '@/components/DetailPanel'

const VOICE_MAX_SECONDS = 120

// Une proposition d'écriture différée — même appel qui produit la réponse,
// via le tool-use natif (cf. /api/chat) — label/icon dérivés côté serveur.
type PendingItem = PendingWrite & { label: string; icon: string }

export type ChatContext =
  | { type: 'event'; event: LifeEvent }
  | { type: 'theme'; theme: Theme }
  | { type: 'free' }

type Message    = { role: 'ai' | 'user'; text: string }
type ApiMessage = { role: 'user' | 'assistant'; content: string }
type AlineaDraft = {
  title:            string
  content:          string
  emotion:          string | null
  category:         string | null
  approximate_date: string | null
}

function parseDraft(text: string): AlineaDraft | null {
  const m = text.match(/```alinea-draft\n([\s\S]*?)\n```/)
  if (!m) return null
  try { return JSON.parse(m[1]) as AlineaDraft } catch { return null }
}

function parsePending(text: string): PendingItem[] {
  const m = text.match(/```memory-pending\n([\s\S]*?)\n```/)
  if (!m) return []
  try {
    const parsed = JSON.parse(m[1])
    return Array.isArray(parsed) ? parsed as PendingItem[] : []
  } catch { return [] }
}

function stripSignals(text: string): string {
  return text
    .replace(/```alinea-draft[\s\S]*?```/, '')
    .replace(/```memory-pending[\s\S]*?```/, '')
    .trim()
}

function contextToSeed(ctx: ChatContext): string {
  if (ctx.type === 'event') return `Je veux raconter l'événement : ${ctx.event.title} (${ctx.event.year})`
  if (ctx.type === 'theme') return `Je veux explorer la thématique : ${ctx.theme.name}`
  return 'Commence'
}

type Props = {
  context:        ChatContext | null
  onboardingStep?: number
  onLastMessage:  (msg: string) => void
  onAlineaSaved:  () => void
  focus?:         EntityRef | null
  onClearFocus?:  () => void
}

export default function ChatPanel({ context, onboardingStep = 10, onLastMessage, onAlineaSaved, focus, onClearFocus }: Props) {
  const [messages,       setMessages]       = useState<Message[]>([])
  const [apiMessages,    setApiMessages]    = useState<ApiMessage[]>([])
  const [inputVal,       setInputVal]       = useState('')
  const [streaming,      setStreaming]       = useState(false)
  const [draft,          setDraft]          = useState<AlineaDraft | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [pendingItems,   setPendingItems]   = useState<PendingItem[]>([])
  const [savingMemory,   setSavingMemory]   = useState(false)
  const [memorySaved,    setMemorySaved]    = useState(false)
  const [memoryError,    setMemoryError]    = useState<string | null>(null)
  const [debugOpen,      setDebugOpen]      = useState(false)
  const [panelOpen,      setPanelOpen]      = useState(true)
  const [focusFlash,     setFocusFlash]     = useState(false)
  const [recording,      setRecording]      = useState(false)
  const [recordSeconds,  setRecordSeconds]  = useState(VOICE_MAX_SECONDS)
  const [transcribing,   setTranscribing]   = useState(false)

  const msgsRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)

  // Flash bref du bandeau de focus à chaque changement
  useEffect(() => {
    if (!focus) return
    setFocusFlash(true)
    const t = setTimeout(() => setFocusFlash(false), 900)
    return () => clearTimeout(t)
  }, [focus])

  // Coupe micro/minuteur si le composant démonte pendant un enregistrement
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
  }, [])

  const scrollDown = useCallback(() => {
    setTimeout(() => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }, [])

  const sendToAI = useCallback(async (msgs: ApiMessage[]) => {
    setStreaming(true)
    let buffer = ''
    setMessages(prev => [...prev, { role: 'ai', text: '' }])

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: msgs }),
      })
      if (!res.body) return

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'ai', text: stripSignals(buffer) }
          return copy
        })
        scrollDown()
      }

      const foundDraft = parseDraft(buffer)
      if (foundDraft) setDraft(foundDraft)

      const displayText = stripSignals(buffer)
      if (displayText) onLastMessage(displayText)

      const updatedApiMsgs = [...msgs, { role: 'assistant' as const, content: buffer }]
      setApiMessages(updatedApiMsgs)

      // Propositions d'écriture du tour courant (tool-use réel, cf. /api/chat) —
      // accumulées avec celles des tours précédents tant qu'elles ne sont pas
      // confirmées ou retirées (une même entité rediscutée remplace l'ancienne).
      const newItems = parsePending(buffer)
      if (newItems.length > 0) {
        setPendingItems(prev => {
          const merged = [...prev]
          for (const item of newItems) {
            const idx = merged.findIndex(m => m.tool === item.tool && m.label === item.label)
            if (idx >= 0) merged[idx] = item
            else merged.push(item)
          }
          return merged
        })
        setMemorySaved(false)
      }
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [scrollDown, onLastMessage])

  // Démarrage de la conversation au montage du composant
  useEffect(() => {
    let seed: string
    if (onboardingStep < 4) {
      seed = '__onboarding_mode1__'
    } else if (context) {
      seed = contextToSeed(context)
    } else {
      seed = 'Commence'
    }
    sendToAI([{ role: 'user', content: seed }])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputVal.trim()
    if (!text || streaming || saving) return
    setInputVal('')
    const userMsg: ApiMessage = { role: 'user', content: text }
    const newMsgs = [...apiMessages, userMsg]
    setMessages(prev => [...prev, { role: 'user', text }])
    setApiMessages(newMsgs)
    scrollDown()
    await sendToAI(newMsgs)
  }, [inputVal, streaming, saving, apiMessages, sendToAI, scrollDown])

  const sendVoiceMessage = useCallback(async (blob: Blob) => {
    setTranscribing(true)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({})) as { text?: string }
      const text = body.text?.trim()
      if (!text) return
      const userMsg: ApiMessage = { role: 'user', content: text }
      const newMsgs = [...apiMessages, userMsg]
      setMessages(prev => [...prev, { role: 'user', text }])
      setApiMessages(newMsgs)
      scrollDown()
      await sendToAI(newMsgs)
    } finally {
      setTranscribing(false)
    }
  }, [apiMessages, sendToAI, scrollDown])

  const stopRecording = useCallback((send: boolean) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (send) {
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        sendVoiceMessage(blob)
      }, { once: true })
      recorder.stop()
    } else {
      recorder.stop()
    }
    recorder.stream.getTracks().forEach(t => t.stop())
    mediaRecorderRef.current = null
    setRecording(false)
  }, [sendVoiceMessage])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordSeconds(VOICE_MAX_SECONDS)
      setRecording(true)
      timerRef.current = setInterval(() => {
        setRecordSeconds(s => {
          if (s <= 1) { stopRecording(true); return VOICE_MAX_SECONDS }
          return s - 1
        })
      }, 1000)
    } catch {
      // micro refusé/indisponible — silencieux, l'utilisateur peut toujours écrire
    }
  }

  async function handleSaveMemory() {
    if (pendingItems.length === 0) return
    setSavingMemory(true)
    setMemoryError(null)
    const res = await fetch('/api/memory/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ writes: pendingItems.map(({ tool, input }) => ({ tool, input })) }),
    })
    const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    setSavingMemory(false)
    // 207 reste dans la plage 2xx : on s'appuie sur le champ `ok` du corps.
    if (res.ok && body.ok) {
      setPendingItems([])
      setMemorySaved(true)
      setDebugOpen(false)
      onAlineaSaved() // rafraîchit la grille
    } else {
      setMemoryError(body.error ?? 'Échec de la mémorisation.')
    }
  }

  function removePendingItem(index: number) {
    setPendingItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSaveDraft() {
    if (!draft) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { year, month, day } = parseFrenchDate(draft.approximate_date)
    const { error } = await supabase.from('alineas').insert({
      user_id:          user.id,
      title:            draft.title            || null,
      content:          draft.content,
      format:           'text',
      visibility:       'private',
      emotion:          (draft.emotion  as EmotionTag | null)          || null,
      category:         (draft.category as ThematicCategory | null)   || null,
      approximate_date: draft.approximate_date  || null,
      event_year:       year  ?? null,
      event_month:      month ?? null,
      event_day:        day   ?? null,
      ai_memory:        null,
    })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setDraft(null)
      onAlineaSaved()
    }
  }

  const ctxLabel = context?.type === 'event'
    ? `${context.event.title} · ${context.event.year}`
    : context?.type === 'theme'
    ? context.theme.name
    : null

  return (
    <div className="flex flex-col h-full">

      {/* Bandeau de focus */}
      {focus && (
        <div className={[
          'flex items-center gap-2 px-4 py-1.5 border-b flex-shrink-0 transition-colors duration-300',
          focusFlash ? 'bg-[#FAF0E4] border-[#E8C9A8]' : 'bg-[#FAF6F0] border-[#F0E8DC]',
        ].join(' ')}>
          <span className="text-[11px] text-[#9B5E3A]">🎯</span>
          <span className="text-[11px] text-[#9B5E3A] font-medium truncate">{focus.label}</span>
          {onClearFocus && (
            <button onClick={onClearFocus} className="ml-auto text-[11px] text-[#8C8278] hover:text-[#2C2825] transition-colors">
              Effacer
            </button>
          )}
        </div>
      )}

      {/* Contexte actif */}
      {ctxLabel && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#F0E8DC] bg-[#FAF6F0] flex-shrink-0">
          <span className="text-[11px] text-[#9B5E3A] font-medium truncate">{ctxLabel}</span>
        </div>
      )}

      {/* Panneau « Ce que je retiens » — propositions du moteur agentique, en attente de confirmation */}
      {pendingItems.length > 0 && (
        <div className="flex-shrink-0 border-b border-[#E8E2D9] bg-[#FAF8F4]">
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2"
          >
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#8C8278] flex items-center gap-2">
              Ce que je retiens · {pendingItems.length}
            </span>
            <span className="text-[#C4BDB6] text-[11px]">{panelOpen ? '▾' : '▸'}</span>
          </button>

          {panelOpen && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <ul className="flex flex-col gap-1.5">
                {pendingItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px] text-[#2C2825]">
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    <button
                      onClick={() => removePendingItem(i)}
                      disabled={savingMemory}
                      className="flex-shrink-0 text-[#C4BDB6] hover:text-[#B0504A] transition-colors px-1"
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleSaveMemory}
                  disabled={savingMemory}
                  className="px-4 py-2 rounded-xl text-[12px] font-medium bg-[#9B5E3A] text-white transition-opacity hover:opacity-85 disabled:opacity-40"
                >
                  {savingMemory ? 'Mémorisation…' : 'Mémoriser'}
                </button>
                <button
                  onClick={() => setPendingItems([])}
                  disabled={savingMemory}
                  className="px-3 py-2 text-[#8C8278] rounded-xl text-[12px] hover:text-[#2C2825] transition-colors"
                >
                  Oublier
                </button>
                {/* Debug — JSON brut */}
                <button
                  onClick={() => setDebugOpen(v => !v)}
                  className="ml-auto text-[10px] text-[#C4BDB6] hover:text-[#8C8278] transition-colors font-mono"
                >
                  {debugOpen ? '▾' : '▸'} JSON
                </button>
              </div>

              {memoryError && (
                <p className="text-[11px] text-[#B0504A] bg-[#F8EDEC] border border-[#E4C4C0] rounded-lg px-3 py-2">
                  {memoryError}
                </p>
              )}

              {debugOpen && (
                <pre className="text-[10px] leading-relaxed text-[#8C8278] bg-[#F2EDE5] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {JSON.stringify(pendingItems, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={msgsRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-3 flex flex-col gap-2.5">
        {messages.map((m, i) => (
          <div
            key={i}
            className={[
              'max-w-[88%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap',
              m.role === 'ai'
                ? 'bg-[#F0E8DC] self-start rounded-bl-sm text-[#3D2B1A]'
                : 'bg-[#9B5E3A] self-end rounded-br-sm text-white text-[13.5px]',
            ].join(' ')}
          >
            {m.text || <span className="opacity-40 italic">…</span>}
          </div>
        ))}

        {memorySaved && (
          <div className="self-start text-[12px] text-[#4A7A5A] bg-[#EEF4EE] border border-[#C4DCC4] rounded-xl px-4 py-2">
            Noté ✓
          </div>
        )}

        {/* Carte brouillon d'alinéa */}
        {draft && !saved && (
          <div className="self-start max-w-[92%] bg-[#F5F0E8] border border-[#D4C4A8] rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9B5E3A]">Brouillon d&apos;alinéa</p>
            <p className="text-[13.5px] text-[#2C2825] leading-relaxed italic">{draft.content}</p>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="self-start px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[12px] font-medium hover:bg-[#7A4A2C] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Sauvegarde…' : 'Valider et sauvegarder'}
            </button>
          </div>
        )}

        {saved && (
          <div className="self-start text-[12px] text-[#4A7A5A] bg-[#EEF4EE] border border-[#C4DCC4] rounded-xl px-4 py-2">
            ✓ Alinéa sauvegardé
          </div>
        )}
      </div>

      {/* Saisie */}
      <div className="px-4 py-3 border-t border-[#E6DAC8] flex-shrink-0 bg-white">
        {recording ? (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#E6DAC8] bg-[#FAF6F0]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#CC4444] animate-pulse flex-shrink-0" />
            <span className="text-[13px] text-[#3D2B1A] max-[640px]:hidden">Enregistrement…</span>
            <span className="text-[12px] text-[#8C7565] font-mono flex-shrink-0">
              {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
            </span>
            <button onClick={() => stopRecording(false)} className="ml-auto text-[12px] text-[#8C7565] hover:text-[#3D2B1A]">Annuler</button>
            <button onClick={() => stopRecording(true)} className="text-[12px] font-semibold text-[#9B5E3A]">Arrêter</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={startRecording}
              disabled={streaming || saving || transcribing}
              title="Message vocal"
              className="px-3 py-2.5 rounded-xl border border-[#E6DAC8] text-[#8C7565] hover:text-[#9B5E3A] hover:border-[#9B5E3A] disabled:opacity-40 transition-colors"
            >
              🎙
            </button>
            <input
              ref={inputRef}
              value={inputVal}
              disabled={streaming || saving || transcribing}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={
                transcribing ? 'Transcription…' :
                streaming    ? 'Alinéa écrit…' :
                draft        ? 'Tu veux ajuster quelque chose ?' :
                               'Ta réponse…'
              }
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#E6DAC8] bg-white text-[14px] text-[#3D2B1A] placeholder-[#8C7565] outline-none focus:border-[#9B5E3A] disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={streaming || saving || transcribing || !inputVal.trim()}
              className="px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
