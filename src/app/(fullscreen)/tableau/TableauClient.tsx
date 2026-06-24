'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import ThemesPanel from '@/components/ThemesPanel'
import MiniChat from '@/components/MiniChat'
import MobileNav from '@/components/MobileNav'
import MemoryPanel from '@/components/MemoryPanel'
import EventDrawer from '@/components/EventDrawer'
import ThemeDetail from '@/components/ThemeDetail'
import ChatPanel, { type ChatContext } from '@/components/ChatPanel'
import type { Theme, LifeEvent, Person, PersonRelation, UserMemory } from '@/types/domain'

const FriseSVG       = dynamic(() => import('@/components/FriseSVG'),       { ssr: false })
const RelationsGraph = dynamic(() => import('@/components/RelationsGraph'),  { ssr: false })

type MobileView = 'chat' | 'frise' | 'personnes' | 'themes'

type Props = {
  userName:  string
  themes:    Theme[]
  events:    LifeEvent[]
  people:    Person[]
  relations: PersonRelation[]
  birthYear: number
  portrait:  UserMemory | null
}

export default function TableauClient({ userName, themes, events, people, relations, birthYear, portrait }: Props) {
  const router = useRouter()

  const [mobileView,     setMobileView]     = useState<MobileView>('chat')
  const [graphHidden,    setGraphHidden]     = useState(false)
  const [resetting,      setResetting]       = useState(false)
  const [hiddenThemeIds, setHiddenThemeIds]  = useState<Set<string>>(new Set())
  const [showMemory,     setShowMemory]      = useState(false)
  const [selectedEvent,  setSelectedEvent]   = useState<LifeEvent | null>(null)
  const [selectedTheme,  setSelectedTheme]   = useState<Theme | null>(null)
  const [chatContext,    setChatContext]      = useState<ChatContext | null>(null)
  const [chatContextKey, setChatContextKey]  = useState('free-0')
  const [lastAiMessage,  setLastAiMessage]   = useState('')

  async function handleReset() {
    if (!confirm('Supprimer toutes tes données et recommencer l\'onboarding ?')) return
    setResetting(true)
    await fetch('/api/debug/reset', { method: 'POST' })
    router.push('/onboarding')
  }

  function toggleTheme(id: string) {
    setHiddenThemeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startChat = useCallback((ctx: ChatContext, key: string) => {
    setChatContext(ctx)
    setChatContextKey(key)
    setMobileView('chat')
  }, [])

  function startChatWithEvent(event: LifeEvent) {
    startChat({ type: 'event', event }, `event-${event.id}`)
  }

  function startChatWithTheme(theme: Theme) {
    startChat({ type: 'theme', theme }, `theme-${theme.id}`)
    setSelectedTheme(null)
  }

  function startFreeChat() {
    const key = `free-${Date.now()}`
    startChat({ type: 'free' }, key)
  }

  const visibleThemes = themes.filter(t => !hiddenThemeIds.has(t.id))
  const friseH        = Math.max(160, 70 + visibleThemes.length * 42)

  const eventCountsByTheme = Object.fromEntries(
    themes.map(t => [t.id, events.filter(e => e.theme_ids.includes(t.id)).length])
  )

  return (
    <div className="flex flex-col h-screen bg-[#FAF6F0] overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-5 h-12 border-b border-[#E6DAC8] bg-white flex-shrink-0">
        <span className="text-[22px] text-[#9B5E3A]">¶</span>
        <span className="font-bold text-[15px] tracking-tight text-[#3D2B1A]">Alinéa</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#8C7565]">{userName}</span>
          <button
            onClick={() => setShowMemory(v => !v)}
            className="text-[11px] text-[#8C7565] border border-[#E6DAC8] rounded-lg px-2.5 py-1 hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
          >
            Mémoire IA
          </button>
          <a
            href="/onboarding"
            className="text-[11px] text-[#8C7565] border border-[#E6DAC8] rounded-lg px-2.5 py-1 hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
          >
            + Enrichir
          </a>
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Debug — purge toutes les données"
            className="text-[11px] text-[#CC4444] border border-[#EECECE] rounded-lg px-2.5 py-1 hover:bg-[#FFF0F0] transition-colors disabled:opacity-40"
          >
            {resetting ? '…' : '⟳'}
          </button>
        </span>
      </header>

      {/* ── Frise — permanente en haut (desktop + mobile vue frise) ────────── */}
      <div
        className={[
          'bg-white border-b border-[#E6DAC8] flex-shrink-0',
          mobileView === 'frise' ? 'flex flex-1 flex-col' : 'hidden md:block',
        ].join(' ')}
        style={mobileView !== 'frise' ? { height: friseH, maxHeight: '45vh' } : { maxHeight: '100%' }}
      >
        {themes.length > 0 ? (
          <FriseSVG
            themes={visibleThemes}
            events={events}
            birthYear={birthYear}
            onEventClick={ev => setSelectedEvent(ev)}
          />
        ) : (
          <div className="flex items-center justify-center flex-1 text-[13px] text-[#8C7565] italic p-4">
            Ta frise apparaîtra ici après l&apos;onboarding.
          </div>
        )}
      </div>

      {/* ── Zone principale : Thèmes | Chat | Toile ───────────────────────── */}
      <div className={[
        'flex flex-1 min-h-0',
        mobileView === 'frise' ? 'hidden' : 'flex',
      ].join(' ')}>

        {/* ── Thématiques ─────────────────────────────────────────────────── */}
        <div className={[
          'border-r border-[#E6DAC8] bg-[#FAF6F0] flex-shrink-0 flex flex-col',
          mobileView === 'themes' ? 'w-full' : 'hidden md:flex md:w-[200px]',
        ].join(' ')}>
          <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
              Mes thématiques
            </span>
          </div>
          <ThemesPanel
            themes={themes}
            eventCountsByTheme={eventCountsByTheme}
            hiddenThemeIds={hiddenThemeIds}
            onThemeClick={t => setSelectedTheme(t)}
          />
        </div>

        {/* ── Chat ────────────────────────────────────────────────────────── */}
        <div className={[
          'flex flex-col border-r border-[#E6DAC8] bg-white',
          mobileView === 'chat' ? 'flex flex-col flex-1 w-full' : 'hidden md:flex md:flex-1',
        ].join(' ')}>
          {/* Barre chat */}
          <div className="flex items-center gap-2 px-4 h-9 border-b border-[#E6DAC8] flex-shrink-0 bg-white">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
              Dialogue
            </span>
            <button
              onClick={startFreeChat}
              className="ml-auto text-[11px] text-[#8C7565] hover:text-[#9B5E3A] transition-colors"
            >
              + Nouveau sujet
            </button>
          </div>
          <ChatPanel
            key={chatContextKey}
            context={chatContext}
            onLastMessage={setLastAiMessage}
            onAlineaSaved={() => router.refresh()}
          />
        </div>

        {/* ── Toile des relations ─────────────────────────────────────────── */}
        {!graphHidden && (
          <div className={[
            'flex flex-col flex-shrink-0',
            mobileView === 'personnes' ? 'flex flex-col flex-1 w-full' : 'hidden md:flex md:w-[280px]',
          ].join(' ')}>
            <div className="flex items-center justify-between px-4 h-9 border-b border-[#E6DAC8] flex-shrink-0">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
                Ma toile
              </span>
              <button
                onClick={() => setGraphHidden(true)}
                className="hidden md:block text-[11px] text-[#8C7565] hover:text-[#3D2B1A] transition-colors"
              >
                × masquer
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <RelationsGraph
                people={people}
                relations={relations}
                userName={userName}
              />
            </div>
          </div>
        )}

        {/* Bouton réafficher la toile */}
        {graphHidden && (
          <div className="hidden md:flex w-[48px] items-center justify-center border-l border-[#E6DAC8]">
            <button
              onClick={() => setGraphHidden(false)}
              title="Afficher la toile"
              className="writing-mode-vertical text-[10px] text-[#8C7565] hover:text-[#9B5E3A] transition-colors rotate-90 whitespace-nowrap"
            >
              Ma toile ▸
            </button>
          </div>
        )}
      </div>

      {/* ── Mini-chat mobile ─────────────────────────────────────────────── */}
      <MiniChat
        lastMessage={lastAiMessage}
        onClick={() => setMobileView('chat')}
      />

      {/* ── Navigation mobile ────────────────────────────────────────────── */}
      <MobileNav
        active={mobileView}
        phase={2}
        onChange={setMobileView}
      />

      {/* ── Panneaux superposés ──────────────────────────────────────────── */}
      {showMemory && (
        <MemoryPanel
          portrait={portrait}
          themes={themes}
          people={people}
          userName={userName}
          onClose={() => setShowMemory(false)}
        />
      )}

      {selectedEvent && (
        <EventDrawer
          event={selectedEvent}
          themes={themes}
          onClose={() => setSelectedEvent(null)}
          onStartChat={() => startChatWithEvent(selectedEvent)}
        />
      )}

      {selectedTheme && (
        <ThemeDetail
          theme={selectedTheme}
          eventCount={eventCountsByTheme[selectedTheme.id] ?? 0}
          isHidden={hiddenThemeIds.has(selectedTheme.id)}
          onToggleVisibility={() => toggleTheme(selectedTheme.id)}
          onStartChat={() => startChatWithTheme(selectedTheme)}
          onClose={() => setSelectedTheme(null)}
        />
      )}
    </div>
  )
}
