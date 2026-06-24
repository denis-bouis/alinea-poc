'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseFrenchDate } from '@/lib/parse-date'
import type { Theme, LifeEvent } from '@/types/domain'
import type { EmotionTag, ThematicCategory } from '@/types/database'

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

function stripDraft(text: string): string {
  return text.replace(/```alinea-draft[\s\S]*?```/, '').trim()
}

function contextToSeed(ctx: ChatContext): string {
  if (ctx.type === 'event') return `Je veux raconter l'événement : ${ctx.event.title} (${ctx.event.year})`
  if (ctx.type === 'theme') return `Je veux explorer la thématique : ${ctx.theme.name}`
  return 'Commence'
}

type Props = {
  context:       ChatContext | null
  onLastMessage: (msg: string) => void
  onAlineaSaved: () => void
}

export default function ChatPanel({ context, onLastMessage, onAlineaSaved }: Props) {
  const [messages,    setMessages]    = useState<Message[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [inputVal,    setInputVal]    = useState('')
  const [streaming,   setStreaming]   = useState(false)
  const [draft,       setDraft]       = useState<AlineaDraft | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  const msgsRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
          copy[copy.length - 1] = { role: 'ai', text: stripDraft(buffer) }
          return copy
        })
        scrollDown()
      }

      const foundDraft = parseDraft(buffer)
      if (foundDraft) setDraft(foundDraft)

      const displayText = stripDraft(buffer)
      if (displayText) onLastMessage(displayText)

      setApiMessages(prev => [...prev, { role: 'assistant', content: buffer }])
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [scrollDown, onLastMessage])

  // Démarrage de la conversation au montage du composant
  useEffect(() => {
    const seed = context ? contextToSeed(context) : 'Commence'
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

        {draft && !saved && (
          <div className="self-start max-w-[92%] bg-[#F5F0E8] border border-[#D4C4A8] rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#9B5E3A]">Brouillon d&apos;alinéa</p>
            <p className="text-[13.5px] text-[#3D2B1A] leading-relaxed italic">{draft.content}</p>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="self-start px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[12px] font-semibold hover:bg-[#7A4A2C] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Sauvegarde…' : 'Valider et sauvegarder'}
            </button>
          </div>
        )}

        {saved && (
          <div className="self-start text-[13px] text-[#4A7A5A] bg-[#EEF4EE] border border-[#C4DCC4] rounded-xl px-4 py-2.5">
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
