'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseFrenchDate } from '@/lib/parse-date'
import type { Theme, LifeEvent } from '@/types/domain'
import type { EmotionTag, ThematicCategory } from '@/types/database'
import type { PendingEntity } from '@/app/api/memory/confirm/route'

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

function parsePending(text: string): { entities: PendingEntity[]; raw: string } | null {
  const m = text.match(/```memory-pending\n([\s\S]*?)\n```/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1])
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return { entities: parsed as PendingEntity[], raw: m[1] }
  } catch { return null }
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
}

export default function ChatPanel({ context, onboardingStep = 10, onLastMessage, onAlineaSaved }: Props) {
  const [messages,       setMessages]       = useState<Message[]>([])
  const [apiMessages,    setApiMessages]    = useState<ApiMessage[]>([])
  const [inputVal,       setInputVal]       = useState('')
  const [streaming,      setStreaming]       = useState(false)
  const [draft,          setDraft]          = useState<AlineaDraft | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [accumulated,    setAccumulated]    = useState<PendingEntity[]>([])
  const [extracting,     setExtracting]     = useState(false)
  const [aiReady,        setAiReady]        = useState(false)
  const [savingMemory,   setSavingMemory]   = useState(false)
  const [memorySaved,    setMemorySaved]    = useState(false)
  const [memoryError,    setMemoryError]    = useState<string | null>(null)
  const [debugOpen,      setDebugOpen]      = useState(false)
  const [panelOpen,      setPanelOpen]      = useState(true)

  const msgsRef        = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLInputElement>(null)
  const accumulatedRef = useRef<PendingEntity[]>([])

  // Garder le ref synchrone pour éviter les closures périmées dans sendToAI
  useEffect(() => { accumulatedRef.current = accumulated }, [accumulated])

  const scrollDown = useCallback(() => {
    setTimeout(() => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }, [])

  const sendToAI = useCallback(async (msgs: ApiMessage[], opts?: { isSeed?: boolean }) => {
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

      // Capture progressive — jamais sur le message initial de l'IA (seed),
      // ni sur un brouillon d'alinéa. On accumule et affine au fil des échanges.
      if (!foundDraft && !opts?.isSeed) {
        const lastUserMsg = msgs[msgs.length - 1]?.content ?? ''
        setExtracting(true)
        fetch('/api/memory/extract', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            accumulated:     accumulatedRef.current,
            lastUserMessage: lastUserMsg,
            lastAiMessage:   displayText,
          }),
        })
          .then(r => r.json())
          .then(({ entities, ready }: { entities: PendingEntity[]; ready: boolean }) => {
            if (Array.isArray(entities)) {
              setAccumulated(entities)
              if (entities.length > 0) setMemorySaved(false)
            }
            setAiReady(Boolean(ready))
          })
          .catch(() => {/* silencieux */})
          .finally(() => setExtracting(false))
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
    sendToAI([{ role: 'user', content: seed }], { isSeed: true })
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

  async function handleSaveMemory() {
    if (accumulated.length === 0) return
    setSavingMemory(true)
    setMemoryError(null)
    const res = await fetch('/api/memory/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ entities: accumulated }),
    })
    const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    setSavingMemory(false)
    // 207 reste dans la plage 2xx : on s'appuie sur le champ `ok` du corps.
    if (res.ok && body.ok) {
      setAccumulated([])
      setAiReady(false)
      setMemorySaved(true)
      setDebugOpen(false)
      onAlineaSaved() // rafraîchit la grille
    } else {
      setMemoryError(body.error ?? 'Échec de la mémorisation.')
    }
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

      {/* Contexte actif */}
      {ctxLabel && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#F0E8DC] bg-[#FAF6F0] flex-shrink-0">
          <span className="text-[11px] text-[#9B5E3A] font-medium truncate">{ctxLabel}</span>
        </div>
      )}

      {/* Panneau « Ce que je retiens » — en parallèle, mis à jour au fil des échanges */}
      {accumulated.length > 0 && (
        <div className="flex-shrink-0 border-b border-[#E8E2D9] bg-[#FAF8F4]">
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2"
          >
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#8C8278] flex items-center gap-2">
              Ce que je retiens · {accumulated.length}
              {extracting && <span className="text-[#C4BDB6] normal-case tracking-normal italic">mise à jour…</span>}
            </span>
            <span className="text-[#C4BDB6] text-[11px]">{panelOpen ? '▾' : '▸'}</span>
          </button>

          {panelOpen && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <ul className="flex flex-col gap-1.5">
                {accumulated.map((e, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[13px] text-[#2C2825]">
                    <span className="flex-shrink-0">{e.icon}</span>
                    <span>{e.label}</span>
                  </li>
                ))}
              </ul>

              {aiReady && (
                <p className="text-[11px] text-[#9B5E3A] italic">
                  Je crois avoir de quoi mémoriser — quand tu veux.
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleSaveMemory}
                  disabled={savingMemory}
                  className={[
                    'px-4 py-2 rounded-xl text-[12px] font-medium transition-opacity hover:opacity-85 disabled:opacity-40',
                    aiReady ? 'bg-[#9B5E3A] text-white' : 'bg-[#2C2825] text-[#FAF8F4]',
                  ].join(' ')}
                >
                  {savingMemory ? 'Mémorisation…' : 'Mémoriser'}
                </button>
                <button
                  onClick={() => { setAccumulated([]); setAiReady(false) }}
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
                  {JSON.stringify(accumulated, null, 2)}
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
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={inputVal}
            disabled={streaming || saving}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={
              streaming ? 'Alinéa écrit…' :
              draft     ? 'Tu veux ajuster quelque chose ?' :
                          'Ta réponse…'
            }
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#E6DAC8] bg-white text-[14px] text-[#3D2B1A] placeholder-[#8C7565] outline-none focus:border-[#9B5E3A] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={streaming || saving || !inputVal.trim()}
            className="px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
