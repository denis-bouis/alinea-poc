'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import FriseVerticale from '@/components/FriseVerticale'
import FichesColumn, { type FullscreenPanel } from '@/components/FichesColumn'
import FilterBar from '@/components/FilterBar'
import MobileTabs, { type MobileColumn } from '@/components/MobileTabs'
import DetailPanel, { type EntityRef } from '@/components/DetailPanel'
import MemoryPanel from '@/components/MemoryPanel'
import LinkEditor from '@/components/LinkEditor'
import FamilyUnitEditor from '@/components/FamilyUnitEditor'
import ChatPanel, { type ChatContext } from '@/components/ChatPanel'
import type { AlineaListItem } from '@/components/cards/AlineasCard'
import type { Theme, LifeEvent, LifePhase, Person, PersonRelation, UserMemory, Place } from '@/types/domain'

type Junction = { alinea_id?: string; life_event_id?: string; person_id?: string; place_id?: string }

type Props = {
  userName:      string | null
  onboardingStep: number
  themes:        Theme[]
  events:        LifeEvent[]
  phases:        LifePhase[]
  people:        Person[]
  relations:     PersonRelation[]
  selfId:        string | null
  birthYear:     number | null
  portrait:      UserMemory | null
  places:        Place[]
  alineas:       AlineaListItem[]
  alineaPeople:      Junction[]
  lifeEventPeople:   Junction[]
  alineaPlaces:      Junction[]
  lifeEventPlaces:   Junction[]
}

export default function TableauClient({
  userName, onboardingStep, themes, events, phases, people, relations, selfId, birthYear, portrait,
  places, alineas, alineaPeople, lifeEventPeople, alineaPlaces, lifeEventPlaces,
}: Props) {
  const router = useRouter()

  const [screen,          setScreen]          = useState<'3col' | 'recit'>('3col')
  const [mobileCol,       setMobileCol]       = useState<MobileColumn>(onboardingStep < 4 ? 'chat' : 'frise')
  const [resetting,       setResetting]       = useState(false)
  const [menuOpen,        setMenuOpen]        = useState(false)
  const [showMemory,      setShowMemory]      = useState(false)
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set())
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [friseFullscreen, setFriseFullscreen] = useState(false)
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null)
  const [detailStack,     setDetailStack]     = useState<EntityRef[]>([])
  const [focus,           setFocusState]      = useState<EntityRef | null>(null)
  const [linkEditorOpen,  setLinkEditorOpen]  = useState(false)
  const [familyEditorOpen, setFamilyEditorOpen] = useState(false)
  const [chatContext,     setChatContext]     = useState<ChatContext | null>(null)
  const [chatContextKey,  setChatContextKey]  = useState('free-0')

  const birthYearOrDefault = birthYear ?? 1960

  // ── Focus : entités directement liées (jonctions déjà en base) ──────────
  const personRelatedIds = useCallback((personId: string) => {
    const s = new Set(relations.filter(r => r.person_a_id === personId).map(r => r.person_b_id))
    s.add(personId)
    return s
  }, [relations])

  const visiblePersonIds = useMemo(() => {
    if (!focus) return null
    if (focus.type === 'person') return personRelatedIds(focus.id)
    if (focus.type === 'life_event') return new Set(lifeEventPeople.filter(r => r.life_event_id === focus.id).map(r => r.person_id!))
    if (focus.type === 'alinea') return new Set(alineaPeople.filter(r => r.alinea_id === focus.id).map(r => r.person_id!))
    return null // place → pas de jonction directe personne↔lieu, simplification assumée
  }, [focus, personRelatedIds, lifeEventPeople, alineaPeople])

  const visiblePlaceIds = useMemo(() => {
    if (!focus) return null
    if (focus.type === 'place') return new Set([focus.id])
    if (focus.type === 'life_event') return new Set(lifeEventPlaces.filter(r => r.life_event_id === focus.id).map(r => r.place_id!))
    if (focus.type === 'alinea') return new Set(alineaPlaces.filter(r => r.alinea_id === focus.id).map(r => r.place_id!))
    return null // person → pas de jonction directe personne↔lieu, simplification assumée
  }, [focus, lifeEventPlaces, alineaPlaces])

  const eventPhaseMap = useMemo(() => new Map(events.map(e => [e.id, e.life_phase_id])), [events])

  const alineaVisibleIds = useMemo(() => {
    const filtersActive = selectedThemeIds.size > 0 || selectedPhaseIds.size > 0 || focus !== null
    if (!filtersActive) return null
    return new Set(alineas.filter(a => {
      if (selectedThemeIds.size > 0 && !a.theme_ids.some(id => selectedThemeIds.has(id))) return false
      if (selectedPhaseIds.size > 0) {
        const phaseId = a.life_event_id ? eventPhaseMap.get(a.life_event_id) : null
        if (!phaseId || !selectedPhaseIds.has(phaseId)) return false
      }
      if (focus) {
        if (focus.type === 'alinea') return a.id === focus.id
        if (focus.type === 'life_event') return a.life_event_id === focus.id
        if (focus.type === 'person') return alineaPeople.some(r => r.alinea_id === a.id && r.person_id === focus.id)
        if (focus.type === 'place') return alineaPlaces.some(r => r.alinea_id === a.id && r.place_id === focus.id)
      }
      return true
    }).map(a => a.id))
  }, [alineas, selectedThemeIds, selectedPhaseIds, focus, eventPhaseMap, alineaPeople, alineaPlaces])

  const visibleEvents = useMemo(() => events.filter(e => {
    if (selectedThemeIds.size > 0 && !e.theme_ids.some(id => selectedThemeIds.has(id))) return false
    if (selectedPhaseIds.size > 0 && (!e.life_phase_id || !selectedPhaseIds.has(e.life_phase_id))) return false
    if (focus) {
      if (focus.type === 'life_event') return e.id === focus.id
      if (focus.type === 'person') return lifeEventPeople.some(r => r.life_event_id === e.id && r.person_id === focus.id)
      if (focus.type === 'place') return lifeEventPlaces.some(r => r.life_event_id === e.id && r.place_id === focus.id)
      if (focus.type === 'alinea') return alineas.find(a => a.id === focus.id)?.life_event_id === e.id
    }
    return true
  }), [events, selectedThemeIds, selectedPhaseIds, focus, lifeEventPeople, lifeEventPlaces, alineas])

  const effectiveCollapsedPhaseIds = useMemo(() => {
    if (selectedPhaseIds.size === 0) return collapsedPhases
    return new Set(phases.filter(p => !selectedPhaseIds.has(p.id)).map(p => p.id))
  }, [selectedPhaseIds, collapsedPhases, phases])

  function toggleThemeFilter(id: string) {
    setSelectedThemeIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function togglePhaseFilter(id: string) {
    setSelectedPhaseIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function togglePhaseCollapse(id: string) {
    setCollapsedPhases(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function handleReset() {
    if (!confirm('Supprimer toutes tes données et recommencer l\'onboarding ?')) return
    setResetting(true)
    await fetch('/api/debug/reset', { method: 'POST' })
    // Il n'existe pas de route /onboarding — l'onboarding est piloté par
    // onboarding_step, refetché côté serveur sur /tableau. Un router.push
    // vers la même route ne remonterait pas les états locaux déjà initialisés
    // (mobileCol, etc.) : rechargement complet nécessaire.
    window.location.href = '/tableau'
  }

  const openDetail   = useCallback((ref: EntityRef) => setDetailStack(prev => [...prev, ref]), [])
  const closeDetail  = useCallback(() => setDetailStack([]), [])
  const backDetail   = useCallback(() => setDetailStack(prev => prev.slice(0, -1)), [])
  const setFocus     = useCallback((ref: EntityRef) => setFocusState(ref), [])
  const clearFocus   = useCallback(() => setFocusState(null), [])

  const startChat = useCallback((ctx: ChatContext, key: string) => {
    setChatContext(ctx)
    setChatContextKey(key)
    setMobileCol('chat')
  }, [])
  function startFreeChat() { startChat({ type: 'free' }, `free-${Date.now()}`) }

  function refresh() { router.refresh() }

  const currentDetail = detailStack[detailStack.length - 1] ?? null

  const columns = (
    <>
      <div className="flex flex-col min-h-0 h-full bg-white border-r border-[#E8E2D9]">
        <ChatPanel
          key={chatContextKey}
          context={chatContext}
          onboardingStep={onboardingStep}
          onLastMessage={() => {}}
          onAlineaSaved={refresh}
          focus={focus}
          onSetFocus={setFocus}
          onClearFocus={clearFocus}
        />
      </div>

      <div className="relative min-h-0 h-full border-r border-[#E8E2D9]">
        <div className="flex items-center gap-2 px-3 h-9 border-b border-[#E8E2D9] flex-shrink-0">
          <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#2C2825]">Frise</span>
          <button onClick={() => setFriseFullscreen(v => !v)} className="ml-auto text-[#8C8278] hover:text-[#2C2825] text-[13px]">⛶</button>
        </div>
        <div className={friseFullscreen ? 'fixed inset-6 max-[640px]:inset-2 z-[70] bg-[#FAF8F4] rounded-2xl border border-[#E8E2D9] shadow-2xl flex flex-col overflow-hidden' : 'h-[calc(100%-2.25rem)]'}>
          {friseFullscreen && (
            <div className="flex items-center gap-2 px-4 h-10 border-b border-[#E8E2D9] flex-shrink-0">
              <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#2C2825]">Frise</span>
              <button onClick={() => setFriseFullscreen(false)} className="ml-auto text-[#8C8278] hover:text-[#2C2825] text-[13px]">✕ Réduire</button>
            </div>
          )}
          {visibleEvents.length > 0 || phases.length > 0 ? (
            <FriseVerticale
              phases={phases}
              themes={themes}
              events={visibleEvents}
              birthYear={birthYearOrDefault}
              collapsedPhaseIds={effectiveCollapsedPhaseIds}
              onTogglePhase={togglePhaseCollapse}
              onEventClick={ev => openDetail({ type: 'life_event', id: ev.id, label: ev.title })}
              onEventFocus={ev => setFocus({ type: 'life_event', id: ev.id, label: ev.title })}
              fullscreen={friseFullscreen}
            />
          ) : (
            <div className="flex-1 h-full flex items-center justify-center text-[13px] text-[#8C8278] italic p-6 text-center">
              Ta frise se remplira au fil de tes échanges.
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 h-full overflow-hidden">
        <FichesColumn
          people={people} relations={relations} places={places} alineas={alineas} themes={themes}
          userName={userName ?? ''} selfId={selfId}
          visiblePersonIds={visiblePersonIds} visiblePlaceIds={visiblePlaceIds} visibleAlineaIds={alineaVisibleIds}
          fullscreenPanel={fullscreenPanel} onSetFullscreen={setFullscreenPanel}
          onOpen={openDetail}
          onFocus={setFocus}
          onAddLink={() => setLinkEditorOpen(true)}
          onAddFamily={() => setFamilyEditorOpen(true)}
        />
      </div>
    </>
  )

  return (
    <div className="flex flex-col h-screen bg-[#FAF8F4] overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-5 h-12 border-b border-[#E8E2D9] flex-shrink-0 relative">
        <span className="font-serif text-[16px] text-[#2C2825]">◈ Alinéa</span>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <button
            onClick={() => setScreen('3col')}
            className={['px-3 py-1 rounded-full text-[13px] transition-colors', screen === '3col' ? 'bg-[#2C2825] text-[#FAF8F4]' : 'text-[#8C8278] hover:text-[#2C2825]'].join(' ')}
          >
            Tableau
          </button>
          <button
            onClick={() => setScreen('recit')}
            className={['px-3 py-1 rounded-full text-[13px] transition-colors', screen === 'recit' ? 'bg-[#2C2825] text-[#FAF8F4]' : 'text-[#8C8278] hover:text-[#2C2825]'].join(' ')}
          >
            Récit
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#8C8278]">{userName}</span>
          <button
            onClick={() => setShowMemory(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#8C8278] hover:text-[#2C2825] hover:bg-[#F2EDE5] transition-colors"
            title="Ce qu'Alinéa sait de moi"
          >
            👤
          </button>
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
                <button onClick={startFreeChat} className="w-full text-left px-4 py-2 text-[#2C2825] hover:bg-[#F2EDE5]">+ Nouveau sujet</button>
                <a href="/onboarding" className="block px-4 py-2 text-[#2C2825] hover:bg-[#F2EDE5]">Enrichir mon récit</a>
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

      {screen === 'recit' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
          <span className="font-serif text-[22px] text-[#2C2825]">Mon récit</span>
          <p className="text-[13px] text-[#8C8278] max-w-md leading-relaxed">
            Bientôt — assemble tes alinéas en un récit : par événement, par année,
            par phase de vie ou par thématique. Ce mode s&apos;ouvre une fois ta trame étoffée.
          </p>
        </div>
      ) : (
        <>
          <FilterBar
            themes={themes} phases={phases}
            selectedThemeIds={selectedThemeIds} selectedPhaseIds={selectedPhaseIds}
            onToggleTheme={toggleThemeFilter} onTogglePhase={togglePhaseFilter}
            onReset={() => { setSelectedThemeIds(new Set()); setSelectedPhaseIds(new Set()) }}
          />

          {/* ≥1180px : 3 colonnes simultanées — <1180px : onglets */}
          <div className="hidden min-[1180px]:grid flex-1 min-h-0" style={{ gridTemplateColumns: '1fr 440px 360px' }}>
            {columns}
          </div>

          <div className="flex min-[1180px]:hidden flex-col flex-1 min-h-0">
            <MobileTabs active={mobileCol} onChange={setMobileCol} />
            <div className="flex-1 min-h-0">
              {mobileCol === 'chat' && (
                <ChatPanel
                  key={chatContextKey}
                  context={chatContext}
                  onboardingStep={onboardingStep}
                  onLastMessage={() => {}}
                  onAlineaSaved={refresh}
                  focus={focus}
                  onSetFocus={setFocus}
                  onClearFocus={clearFocus}
                />
              )}
              {mobileCol === 'frise' && (
                visibleEvents.length > 0 || phases.length > 0 ? (
                  <FriseVerticale
                    phases={phases} themes={themes} events={visibleEvents} birthYear={birthYearOrDefault}
                    collapsedPhaseIds={effectiveCollapsedPhaseIds} onTogglePhase={togglePhaseCollapse}
                    onEventClick={ev => openDetail({ type: 'life_event', id: ev.id, label: ev.title })}
                    onEventFocus={ev => setFocus({ type: 'life_event', id: ev.id, label: ev.title })}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[13px] text-[#8C8278] italic p-6 text-center">
                    Ta frise se remplira au fil de tes échanges.
                  </div>
                )
              )}
              {mobileCol === 'fiches' && (
                <FichesColumn
                  people={people} relations={relations} places={places} alineas={alineas} themes={themes}
                  userName={userName ?? ''} selfId={selfId}
                  visiblePersonIds={visiblePersonIds} visiblePlaceIds={visiblePlaceIds} visibleAlineaIds={alineaVisibleIds}
                  fullscreenPanel={fullscreenPanel} onSetFullscreen={setFullscreenPanel}
                  onOpen={openDetail}
                  onFocus={setFocus}
                  onAddLink={() => setLinkEditorOpen(true)}
                  onAddFamily={() => setFamilyEditorOpen(true)}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {showMemory && (
        <MemoryPanel portrait={portrait} themes={themes} userName={userName ?? ''} onClose={() => setShowMemory(false)} />
      )}

      {currentDetail && (
        <DetailPanel
          entity={currentDetail}
          people={people}
          relations={relations}
          selfId={selfId}
          userName={userName ?? ''}
          themes={themes}
          phases={phases}
          events={events}
          onClose={closeDetail}
          onNavigate={openDetail}
          onBack={detailStack.length > 1 ? backDetail : undefined}
          onFocus={ref => setFocus(ref)}
          onSaved={refresh}
          onAddLink={() => setLinkEditorOpen(true)}
        />
      )}

      {linkEditorOpen && (
        <LinkEditor
          people={people}
          personA={currentDetail?.type === 'person' ? people.find(p => p.id === currentDetail.id) : undefined}
          onClose={() => setLinkEditorOpen(false)}
          onSaved={() => { setLinkEditorOpen(false); refresh() }}
        />
      )}
      {familyEditorOpen && (
        <FamilyUnitEditor people={people} onClose={() => setFamilyEditorOpen(false)} onSaved={() => { setFamilyEditorOpen(false); refresh() }} />
      )}
    </div>
  )
}
