'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import GrilleVie from '@/components/GrilleVie'
import MemoryPanel from '@/components/MemoryPanel'
import EventDrawer from '@/components/EventDrawer'
import ThemeDetail from '@/components/ThemeDetail'
import PersonPanel from '@/components/PersonPanel'
import LinkEditor from '@/components/LinkEditor'
import FamilyUnitEditor from '@/components/FamilyUnitEditor'
import ChatPanel, { type ChatContext } from '@/components/ChatPanel'
import type { Theme, LifeEvent, LifePhase, Person, PersonRelation, UserMemory } from '@/types/domain'
import { phaseColor } from '@/types/domain'

const RelationsGraph = dynamic(() => import('@/components/RelationsGraph'), { ssr: false })
const FamilyTree     = dynamic(() => import('@/components/FamilyTree'),     { ssr: false })

type View       = 'tableau' | 'chat' | 'recit'
type ToileView  = 'relations' | 'famille'

type Props = {
  userName:      string | null
  onboardingStep: number
  themes:        Theme[]
  events:        LifeEvent[]
  phases:        LifePhase[]
  alineaCounts:  Record<string, number>
  people:        Person[]
  relations:     PersonRelation[]
  birthYear:     number | null
  portrait:      UserMemory | null
}

export default function TableauClient({
  userName, onboardingStep, themes, events, phases, alineaCounts, people, relations, birthYear, portrait,
}: Props) {
  const router = useRouter()

  // Si l'onboarding n'est pas terminé, on ouvre directement le chat
  const [view,            setView]            = useState<View>(onboardingStep < 4 ? 'chat' : 'tableau')
  const [resetting,       setResetting]       = useState(false)
  const [menuOpen,        setMenuOpen]        = useState(false)
  const [hiddenThemeIds,  setHiddenThemeIds]  = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [showMemory,      setShowMemory]      = useState(false)
  const [selectedEvent,   setSelectedEvent]   = useState<LifeEvent | null>(null)
  const [selectedTheme,   setSelectedTheme]   = useState<Theme | null>(null)
  const [selectedPerson,  setSelectedPerson]  = useState<Person | null>(null)
  const [toileOpen,       setToileOpen]       = useState(false)
  const [toileView,       setToileView]       = useState<ToileView>('relations')
  const [linkEditorOpen,  setLinkEditorOpen]  = useState(false)
  const [familyEditorOpen, setFamilyEditorOpen] = useState(false)
  const [chatContext,     setChatContext]     = useState<ChatContext | null>(null)
  const [chatContextKey,  setChatContextKey]  = useState('free-0')

  // ── Résolution de la phase d'un event (couleur + nom) ────────────────────
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sort_order - b.sort_order || (a.year_start ?? 0) - (b.year_start ?? 0)),
    [phases],
  )
  const resolvePhase = useCallback((e: LifeEvent): { color: string; name: string | null } => {
    let p = e.life_phase_id ? sortedPhases.find(x => x.id === e.life_phase_id) ?? null : null
    if (!p) p = sortedPhases.find(x => x.year_start != null && e.year >= x.year_start && e.year <= (x.year_end ?? 9999)) ?? null
    if (!p) return { color: '#9B5E3A', name: null }
    const idx = sortedPhases.indexOf(p)
    return { color: phaseColor(idx), name: p.name }
  }, [sortedPhases])

  async function handleReset() {
    if (!confirm('Supprimer toutes tes données et recommencer l\'onboarding ?')) return
    setResetting(true)
    await fetch('/api/debug/reset', { method: 'POST' })
    router.push('/onboarding')
  }

  function toggleTheme(id: string) {
    setHiddenThemeIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function togglePhase(id: string) {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startChat = useCallback((ctx: ChatContext, key: string) => {
    setChatContext(ctx)
    setChatContextKey(key)
    setView('chat')
  }, [])

  function startChatWithEvent(event: LifeEvent) {
    startChat({ type: 'event', event }, `event-${event.id}`)
  }
  function startChatWithTheme(theme: Theme) {
    startChat({ type: 'theme', theme }, `theme-${theme.id}`)
    setSelectedTheme(null)
  }
  function startFreeChat() {
    startChat({ type: 'free' }, `free-${Date.now()}`)
  }

  const visibleThemes = themes.filter(t => !hiddenThemeIds.has(t.id))
  const eventCountsByTheme = Object.fromEntries(
    themes.map(t => [t.id, events.filter(e => (e.theme_ids ?? []).includes(t.id)).length]),
  )

  const Tab = ({ id, label }: { id: View; label: string }) => (
    <button
      onClick={() => setView(id)}
      className={[
        'px-3 py-1 rounded-full text-[13px] transition-colors',
        view === id ? 'bg-[#2C2825] text-[#FAF8F4]' : 'text-[#8C8278] hover:text-[#2C2825]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-screen bg-[#FAF8F4] overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-5 h-12 border-b border-[#E8E2D9] flex-shrink-0 relative">
        <span className="font-serif text-[16px] text-[#2C2825]">◈ Alinéa</span>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <Tab id="tableau" label="Tableau" />
          <Tab id="chat"    label="Chat" />
          <Tab id="recit"   label="Récit" />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#8C8278]">{userName}</span>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#8C8278] hover:text-[#2C2825] hover:bg-[#F2EDE5] transition-colors"
            title="Menu"
          >
            ⚙
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute top-11 right-4 z-50 w-48 bg-white rounded-xl shadow-lg border border-[#E8E2D9] py-1.5 text-[13px]">
                <button onClick={() => { setShowMemory(true); setMenuOpen(false) }}
                        className="w-full text-left px-4 py-2 text-[#2C2825] hover:bg-[#F2EDE5]">Mémoire IA</button>
                <button onClick={() => { setToileOpen(true); setMenuOpen(false) }}
                        className="w-full text-left px-4 py-2 text-[#2C2825] hover:bg-[#F2EDE5]">Personnes & toile</button>
                <a href="/onboarding"
                   className="block px-4 py-2 text-[#2C2825] hover:bg-[#F2EDE5]">Enrichir mon récit</a>
                <div className="border-t border-[#E8E2D9] my-1" />
                <button onClick={handleReset} disabled={resetting}
                        className="w-full text-left px-4 py-2 text-[#CC4444] hover:bg-[#FFF0F0] disabled:opacity-40">
                  {resetting ? 'Réinitialisation…' : 'Réinitialiser (debug)'}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Vue Tableau ──────────────────────────────────────────────────── */}
      {view === 'tableau' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Barre de filtres thématiques */}
          {themes.length > 0 && (
            <div className="flex items-center gap-2 px-5 h-10 border-b border-[#E8E2D9] flex-shrink-0 overflow-x-auto">
              {themes.map(t => {
                const hidden = hiddenThemeIds.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTheme(t.id)}
                    onDoubleClick={() => setSelectedTheme(t)}
                    title={hidden ? 'Afficher la colonne' : 'Masquer la colonne'}
                    className={[
                      'flex items-center gap-1.5 text-[12px] rounded-full border px-2.5 py-0.5 whitespace-nowrap transition-colors',
                      hidden
                        ? 'border-[#E8E2D9] text-[#C4BDB6] line-through'
                        : 'border-[#D4CEC6] text-[#2C2825] hover:border-[#9B5E3A]',
                    ].join(' ')}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color, opacity: hidden ? 0.4 : 1 }} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Grille */}
          {events.length > 0 || phases.length > 0 ? (
            <GrilleVie
              phases={phases}
              themes={visibleThemes}
              events={events}
              alineaCounts={alineaCounts}
              birthYear={birthYear ?? 1960}
              collapsedPhaseIds={collapsedPhases}
              onTogglePhase={togglePhase}
              onEventClick={ev => setSelectedEvent(ev)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-[#8C8278] italic p-6 text-center">
              Ta grille se remplira au fil de tes échanges.<br />Commence par le Chat pour te raconter.
            </div>
          )}
        </div>
      )}

      {/* ── Vue Chat ─────────────────────────────────────────────────────── */}
      {view === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-5 h-10 border-b border-[#E8E2D9] flex-shrink-0">
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#8C8278]">
              {onboardingStep < 4
                ? 'Première rencontre'
                : chatContext?.type === 'event' ? 'Focus · événement'
                : chatContext?.type === 'theme' ? 'Focus · thématique'
                : 'Dialogue libre'}
            </span>
            {onboardingStep >= 4 && (
              <button onClick={startFreeChat} className="ml-auto text-[12px] text-[#8C8278] hover:text-[#9B5E3A] transition-colors">
                + Nouveau sujet
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 bg-white">
            <ChatPanel
              key={chatContextKey}
              context={chatContext}
              onboardingStep={onboardingStep}
              onLastMessage={() => {}}
              onAlineaSaved={() => router.refresh()}
            />
          </div>
        </div>
      )}

      {/* ── Vue Récit (à venir) ──────────────────────────────────────────── */}
      {view === 'recit' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
          <span className="font-serif text-[22px] text-[#2C2825]">Mon récit</span>
          <p className="text-[13px] text-[#8C8278] max-w-md leading-relaxed">
            Bientôt — assemble tes alinéas en un récit : par événement, par année,
            par phase de vie ou par thématique. Ce mode s&apos;ouvre une fois ta trame étoffée.
          </p>
        </div>
      )}

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {showMemory && (
        <MemoryPanel
          portrait={portrait}
          themes={themes}
          userName={userName ?? ''}
          onClose={() => setShowMemory(false)}
        />
      )}

      {selectedEvent && (() => {
        const { color, name } = resolvePhase(selectedEvent)
        return (
          <EventDrawer
            event={selectedEvent}
            themes={themes}
            color={color}
            phaseName={name}
            onClose={() => setSelectedEvent(null)}
            onStartChat={() => startChatWithEvent(selectedEvent)}
          />
        )
      })()}

      {selectedPerson && (
        <PersonPanel
          person={selectedPerson}
          allPeople={people}
          relations={relations}
          onClose={() => setSelectedPerson(null)}
          onSaved={() => { setSelectedPerson(null); router.refresh() }}
          onAddLink={() => setLinkEditorOpen(true)}
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

      {linkEditorOpen && (
        <LinkEditor
          people={people}
          personA={selectedPerson ?? undefined}
          onClose={() => setLinkEditorOpen(false)}
          onSaved={() => { setLinkEditorOpen(false); router.refresh() }}
        />
      )}

      {familyEditorOpen && (
        <FamilyUnitEditor
          people={people}
          onClose={() => setFamilyEditorOpen(false)}
          onSaved={() => { setFamilyEditorOpen(false); router.refresh() }}
        />
      )}

      {/* ── Toile / Arbre — overlay plein écran ──────────────────────────── */}
      {toileOpen && (
        <div className="fixed inset-0 z-50 bg-[#FAF8F4] flex flex-col">
          <div className="flex items-center gap-2 px-5 h-12 border-b border-[#E8E2D9] flex-shrink-0">
            <span className="font-serif text-[15px] text-[#2C2825]">Personnes</span>
            <div className="flex items-center gap-0.5 bg-[#F2EDE5] rounded-lg p-0.5 ml-2">
              {(['relations', 'famille'] as ToileView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setToileView(v)}
                  className={[
                    'text-[12px] px-2.5 py-0.5 rounded-md transition-colors',
                    toileView === v ? 'bg-white text-[#2C2825] shadow-sm font-medium' : 'text-[#8C8278] hover:text-[#2C2825]',
                  ].join(' ')}
                >
                  {v === 'relations' ? 'Toile' : 'Famille'}
                </button>
              ))}
            </div>
            <button onClick={() => setLinkEditorOpen(true)} className="text-[12px] text-[#8C8278] hover:text-[#9B5E3A] px-1.5">+ Lien</button>
            <button onClick={() => setFamilyEditorOpen(true)} className="text-[12px] text-[#8C8278] hover:text-[#9B5E3A] px-1.5">Famille +</button>
            <button onClick={() => setToileOpen(false)} className="ml-auto text-[15px] text-[#8C8278] hover:text-[#2C2825]">✕</button>
          </div>
          <div className="flex-1 min-h-0">
            {toileView === 'relations' ? (
              <RelationsGraph
                people={people}
                relations={relations}
                userName={userName ?? ''}
                onPersonClick={p => setSelectedPerson(p)}
                onUserClick={() => setShowMemory(true)}
              />
            ) : (
              <FamilyTree
                people={people}
                relations={relations}
                userName={userName ?? ''}
                onPersonClick={p => setSelectedPerson(p)}
                onUserClick={() => setShowMemory(true)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
