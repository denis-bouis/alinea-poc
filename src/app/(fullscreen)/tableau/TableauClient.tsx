'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import ThemesPanel from '@/components/ThemesPanel'
import MiniChat from '@/components/MiniChat'
import MobileNav from '@/components/MobileNav'
import MemoryPanel from '@/components/MemoryPanel'
import EventDrawer from '@/components/EventDrawer'
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
  const [mobileView,      setMobileView]      = useState<MobileView>('frise')
  const [graphHidden,     setGraphHidden]      = useState(false)
  const [resetting,       setResetting]        = useState(false)
  const [hiddenThemeIds,  setHiddenThemeIds]   = useState<Set<string>>(new Set())
  const [showMemory,      setShowMemory]        = useState(false)
  const [selectedEvent,   setSelectedEvent]     = useState<LifeEvent | null>(null)

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

  const visibleThemes = themes.filter(t => !hiddenThemeIds.has(t.id))
  const friseH        = Math.max(196, 90 + visibleThemes.length * 42)

  const eventCountsByTheme = Object.fromEntries(
    themes.map(t => [t.id, events.filter(e => e.theme_ids.includes(t.id)).length])
  )

  return (
    <div className="flex flex-col h-screen bg-[#FAF6F0] overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-5 h-12 border-b border-[#E6DAC8] bg-white flex-shrink-0">
        <span className="text-[22px] text-[#9B5E3A]">¶</span>
        <span className="font-bold text-[15px] tracking-tight text-[#3D2B1A]">Alinéa</span>
        <nav className="hidden md:flex items-center gap-4 ml-6">
          <a href="/timeline" className="text-[13px] text-[#8C7565] hover:text-[#3D2B1A] transition-colors">
            Mes alinéas
          </a>
          <a href="/alinea/new" className="text-[13px] text-[#8C7565] hover:text-[#3D2B1A] transition-colors">
            + Nouvel alinéa
          </a>
        </nav>
        <span className="ml-auto text-[12px] text-[#8C7565]">{userName}</span>
        <button
          onClick={() => setShowMemory(v => !v)}
          className="ml-3 text-[11px] text-[#8C7565] border border-[#E6DAC8] rounded-lg px-2.5 py-1 hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
        >
          Mémoire IA
        </button>
        <a
          href="/onboarding"
          className="ml-1 text-[11px] text-[#8C7565] border border-[#E6DAC8] rounded-lg px-2.5 py-1 hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
        >
          + Enrichir
        </a>
        <button
          onClick={handleReset}
          disabled={resetting}
          title="Debug — purge toutes les données"
          className="ml-1 text-[11px] text-[#CC4444] border border-[#EECECE] rounded-lg px-2.5 py-1 hover:bg-[#FFF0F0] transition-colors disabled:opacity-40"
        >
          {resetting ? '…' : '⟳ reset'}
        </button>
      </header>

      {/* ── Frise — permanente en haut (desktop) ────────────────────────── */}
      <div
        className={[
          'bg-white border-b border-[#E6DAC8] flex-shrink-0',
          mobileView === 'frise' ? 'flex flex-1 h-auto' : 'hidden md:block',
        ].join(' ')}
        style={mobileView !== 'frise' ? { height: friseH, maxHeight: '50vh' } : { maxHeight: '50vh' }}
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
            Ta frise apparaîtra ici après l'onboarding.
          </div>
        )}
      </div>

      {/* ── Zone principale : Thèmes | Toile ─────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Panel Thématiques — desktop permanent, mobile vue themes */}
        <div className={[
          'border-r border-[#E6DAC8] bg-[#FAF6F0] flex-shrink-0',
          'hidden md:flex md:flex-col md:w-[220px]',
          mobileView === 'themes' ? '!flex flex-col w-full' : '',
        ].join(' ')}>
          <div className="flex items-center gap-2 px-3 pt-3 pb-1 flex-shrink-0">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
              Mes thématiques
            </span>
          </div>
          <ThemesPanel
            themes={themes}
            eventCountsByTheme={eventCountsByTheme}
            hiddenThemeIds={hiddenThemeIds}
            onThemeClick={t => toggleTheme(t.id)}
          />
        </div>

        {/* Toile des relations — desktop masquable, mobile vue personnes */}
        {!graphHidden && (
          <div className={[
            'flex flex-col flex-1 min-w-0',
            mobileView === 'personnes' ? 'flex' : 'hidden md:flex',
          ].join(' ')}>
            <div className="flex items-center justify-between px-4 pt-3 pb-0 flex-shrink-0">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
                Ma toile des relations
              </span>
              <button
                onClick={() => setGraphHidden(true)}
                className="hidden md:block text-[11px] text-[#8C7565] hover:text-[#3D2B1A] transition-colors"
              >
                × masquer
              </button>
            </div>
            <div className="flex-1">
              <RelationsGraph
                people={people}
                relations={relations}
                userName={userName}
              />
            </div>
          </div>
        )}

        {/* Bouton réafficher la toile si masquée */}
        {graphHidden && (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <button
              onClick={() => setGraphHidden(false)}
              className="text-[13px] text-[#8C7565] border border-[#E6DAC8] rounded-xl px-4 py-2 hover:border-[#9B5E3A] transition-colors"
            >
              Afficher la toile des relations
            </button>
          </div>
        )}
      </div>

      {/* ── Mini-chat mobile ─────────────────────────────────────────────── */}
      <MiniChat
        lastMessage=""
        onClick={() => setMobileView('chat')}
      />

      {/* ── Navigation mobile ─────────────────────────────────────────────── */}
      <MobileNav
        active={mobileView}
        phase={2}
        onChange={setMobileView}
      />

      {/* ── Panneaux latéraux ─────────────────────────────────────────────── */}
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
        />
      )}
    </div>
  )
}
