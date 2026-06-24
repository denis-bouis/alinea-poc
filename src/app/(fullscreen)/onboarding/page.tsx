'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import MobileNav from '@/components/MobileNav'
import type { Theme, LifeEvent, Person, PersonRelation } from '@/types/domain'
import { nextThemeColor } from '@/types/domain'

const RelationsGraph = dynamic(() => import('@/components/RelationsGraph'), { ssr: false })
const FriseSVG       = dynamic(() => import('@/components/FriseSVG'),       { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────

type Message    = { role: 'ai' | 'user'; text: string }
type ApiMessage = { role: 'user' | 'assistant'; content: string }

type CollectedPerson = {
  name:         string
  relation:     string
  relationType: 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre'
}

type CollectedRelation    = { aName: string; bName: string; label: string }
type CollectedEvent       = { year: number; title: string; themeNames: string[]; isPivot?: boolean; emotionalIntensity?: number }
type CollectedKeyPlace    = { name: string; role: string }
type CollectedEmotion     = { value: string; context: string }

type OnboardingState = {
  displayName:      string
  birthYear:        number
  people:           CollectedPerson[]
  relations:        CollectedRelation[]
  events:           CollectedEvent[]
  keyPlaces:        CollectedKeyPlace[]
  dominantEmotions: CollectedEmotion[]
}

type DbIds = {
  people:    Map<string, string>  // name → uuid
  themes:    Map<string, string>  // name → uuid
  events:    Map<string, string>  // `${year}:${title}` → uuid
  relations: Set<string>          // `${aPersonId}:${bPersonId}` pour dédoublonnage
}

type MobileView = 'chat' | 'frise' | 'personnes' | 'themes'

// ── Parsing helpers ────────────────────────────────────────────────────────

const EXTRACT_RE  = /```onboarding-extract\n([\s\S]*?)\n```/g
const COMPLETE_RE = /```onboarding-complete[\s\S]*?"ready"\s*:\s*true/

function parseAndMerge(text: string, current: OnboardingState): OnboardingState {
  const next = { ...current }

  for (const match of text.matchAll(EXTRACT_RE)) {
    try {
      const d = JSON.parse(match[1])
      switch (d.type) {
        case 'profile':
          if (d.displayName) next.displayName = d.displayName
          if (d.birthYear)   next.birthYear   = Number(d.birthYear)
          break
        case 'person':
          if (d.name && !next.people.some(p => p.name.toLowerCase() === d.name.toLowerCase())) {
            next.people = [...next.people, { name: d.name, relation: d.relation ?? '', relationType: d.relationType ?? 'autre' }]
          }
          break
        case 'relation':
          if (d.aName && d.bName && !next.relations.some(r => r.aName === d.aName && r.bName === d.bName)) {
            next.relations = [...next.relations, { aName: d.aName, bName: d.bName, label: d.label ?? '' }]
          }
          break
        case 'event':
          if (d.year && d.title && !next.events.some(e => e.year === Number(d.year) && e.title === d.title)) {
            next.events = [...next.events, { year: Number(d.year), title: d.title, themeNames: d.themeNames ?? [], isPivot: d.isPivot ?? false, emotionalIntensity: d.emotionalIntensity ?? 1 }]
          }
          break
        case 'key_place':
          if (d.name && !next.keyPlaces.some(p => p.name.toLowerCase() === d.name.toLowerCase())) {
            next.keyPlaces = [...next.keyPlaces, { name: d.name, role: d.role ?? '' }]
          }
          break
        case 'dominant_emotion':
          if (d.value && !next.dominantEmotions.some(e => e.value === d.value && e.context === d.context)) {
            next.dominantEmotions = [...next.dominantEmotions, { value: d.value, context: d.context ?? '' }]
          }
          break
      }
    } catch {}
  }

  return next
}

function stripBlocks(text: string): string {
  return text
    .replace(/```onboarding-extract\n[\s\S]*?\n```/g, '')
    .replace(/```onboarding-complete[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Preview builders ────────────────────────────────────────────────────────

function buildThemes(state: OnboardingState): Theme[] {
  const names  = [...new Set(state.events.flatMap(e => e.themeNames))]
  const colors: string[] = []
  return names.map(name => {
    const color = nextThemeColor(colors)
    colors.push(color)
    return { id: name, user_id: '', name, color, maturity: 'emerging' as const, ai_summary: null, created_at: '', updated_at: '' }
  })
}

function buildEvents(state: OnboardingState, themes: Theme[]): LifeEvent[] {
  return state.events.map((ev, i) => ({
    id: `e-${i}`, user_id: '', year: ev.year, title: ev.title,
    status: 'undocumented' as const,
    theme_ids: ev.themeNames.map(n => themes.find(t => t.name === n)?.id ?? '').filter(Boolean),
    is_pivot: ev.isPivot ?? false,
    emotional_intensity: ev.emotionalIntensity ?? 1,
    created_at: '', updated_at: '',
  }))
}

function buildPeople(state: OnboardingState): Person[] {
  return state.people.map((p, i) => ({
    id: `p-${i}`, user_id: '', name: p.name, nickname: null,
    relation: p.relation, relation_type: p.relationType,
    birth_year: null, is_deceased: false, death_year: null,
    first_mention: 'onboarding' as const, ai_summary: null,
    alinea_count: 0, pending_qualification: false, created_at: '', updated_at: '',
  }))
}

function buildRelations(state: OnboardingState, people: Person[]): PersonRelation[] {
  return state.relations
    .map((r, i) => ({
      id: `r-${i}`, user_id: '',
      person_a_id: people.find(p => p.name === r.aName)?.id ?? '',
      person_b_id: people.find(p => p.name === r.bName)?.id ?? '',
      relation_label: r.label, confirmed: true, declared_in: 'dialogue' as const, created_at: '',
    }))
    .filter(r => r.person_a_id !== '' && r.person_b_id !== '')
}

// ── Helpers résumé contexte ────────────────────────────────────────────────

function buildExistingContext(data: {
  displayName: string; birthYear: number | null
  people:  Array<{ name: string; relation: string | null }>
  themes:  Array<{ name: string }>
  events:  Array<{ year: number; title: string }>
}): string {
  const peopleList = data.people.length
    ? data.people.map(p => `${p.name}${p.relation ? ` (${p.relation})` : ''}`).join(', ')
    : 'aucun'
  const themesList = data.themes.length
    ? data.themes.map(t => `"${t.name}"`).join(', ')
    : 'aucune'
  const eventsList = data.events.length
    ? data.events.map(e => `${e.title} — ${e.year}`).join(', ')
    : 'aucun'

  return [
    `Prénom : ${data.displayName || 'non renseigné'}${data.birthYear ? ` (né en ${data.birthYear})` : ''}`,
    `Proches : ${peopleList}`,
    `Thématiques déjà créées (réutilise ces libellés EXACTEMENT) : ${themesList}`,
    `Événements : ${eventsList}`,
  ].join('\n')
}

// ── Composant principal ────────────────────────────────────────────────────

const INIT: OnboardingState = { displayName: '', birthYear: 1960, people: [], relations: [], events: [], keyPlaces: [], dominantEmotions: [] }

export default function OnboardingPage() {
  const router = useRouter()

  const [messages,         setMessages]         = useState<Message[]>([])
  const [apiMessages,      setApiMessages]       = useState<ApiMessage[]>([])
  const [inputVal,         setInputVal]          = useState('')
  const [streaming,        setStreaming]          = useState(false)
  const [state,            setState]             = useState<OnboardingState>(INIT)
  const [phase,            setPhase]             = useState<1 | 2>(1)
  const [saving,           setSaving]            = useState(false)
  const [mobileView,       setMobileView]        = useState<MobileView>('chat')
  const [isLoaded,         setIsLoaded]          = useState(false)
  const [savingIndicator,  setSavingIndicator]   = useState(false)
  const [hiddenThemeIds,   setHiddenThemeIds]    = useState<Set<string>>(new Set())

  const stateRef          = useRef<OnboardingState>(INIT)
  const dbIds             = useRef<DbIds>({ people: new Map(), themes: new Map(), events: new Map(), relations: new Set() })
  const existingContextRef = useRef<string | undefined>(undefined)
  const msgsRef           = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  useEffect(() => { stateRef.current = state }, [state])

  const themes    = useMemo(() => buildThemes(state),              [state])
  const events    = useMemo(() => buildEvents(state, themes),      [state, themes])
  const people    = useMemo(() => buildPeople(state),              [state])
  const relations = useMemo(() => buildRelations(state, people),   [state, people])

  const scrollDown = useCallback(() => {
    setTimeout(() => msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }, [])

  // ── Sauvegarde incrémentale ────────────────────────────────────────────

  const saveExtracts = useCallback(async (prev: OnboardingState, next: OnboardingState) => {
    const ids = dbIds.current
    const saves: Promise<void>[] = []

    // Profil
    if (
      (next.displayName && next.displayName !== prev.displayName) ||
      (next.birthYear   && next.birthYear   !== prev.birthYear)
    ) {
      saves.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'profile', displayName: next.displayName, birthYear: next.birthYear }),
        }).then(() => {})
      )
    }

    // Nouvelles personnes
    const newPeople = next.people.filter(p => !ids.people.has(p.name.toLowerCase()))
    for (const person of newPeople) {
      saves.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'person', name: person.name, relation: person.relation, relationType: person.relationType }),
        })
          .then(r => r.json())
          .then(data => { if (data.id) ids.people.set(person.name.toLowerCase(), data.id) })
      )
    }

    // Attendre les personnes avant les relations et les événements
    await Promise.all(saves)

    const saves2: Promise<void>[] = []

    // Nouvelles relations (seulement si les deux personnes ont un ID)
    const newRelations = next.relations.filter(r => {
      const aId = ids.people.get(r.aName.toLowerCase())
      const bId = ids.people.get(r.bName.toLowerCase())
      return aId && bId && !ids.relations.has(`${aId}:${bId}`)
    })
    for (const rel of newRelations) {
      const aId = ids.people.get(rel.aName.toLowerCase())!
      const bId = ids.people.get(rel.bName.toLowerCase())!
      saves2.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'relation', aPersonId: aId, bPersonId: bId, label: rel.label }),
        })
          .then(r => r.json())
          .then(data => { if (data.id) ids.relations.add(`${aId}:${bId}`) })
      )
    }

    // Nouveaux événements
    const newEvents = next.events.filter(e => !ids.events.has(`${e.year}:${e.title}`))
    for (const ev of newEvents) {
      saves2.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'event', year: ev.year, title: ev.title, themeNames: ev.themeNames, isPivot: ev.isPivot, emotionalIntensity: ev.emotionalIntensity }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.id) ids.events.set(`${ev.year}:${ev.title}`, data.id)
            if (data.themeIds) {
              for (const [name, id] of Object.entries(data.themeIds)) {
                ids.themes.set(name, id as string)
              }
            }
          })
      )
    }

    // Nouveaux lieux marquants
    const newPlaces = next.keyPlaces.filter(p => !prev.keyPlaces.some(pp => pp.name === p.name))
    for (const place of newPlaces) {
      saves2.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'key_place', name: place.name, role: place.role }),
        }).then(() => {})
      )
    }

    // Nouvelles émotions dominantes
    const newEmotions = next.dominantEmotions.filter(e => !prev.dominantEmotions.some(pe => pe.value === e.value && pe.context === e.context))
    for (const emotion of newEmotions) {
      saves2.push(
        fetch('/api/onboarding/save-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dominant_emotion', value: emotion.value, context: emotion.context }),
        }).then(() => {})
      )
    }

    if (saves2.length > 0) {
      setSavingIndicator(true)
      await Promise.all(saves2)
      setSavingIndicator(false)
    }
  }, [])

  // ── Chargement de l'état existant ─────────────────────────────────────

  useEffect(() => {
    fetch('/api/onboarding/state')
      .then(r => r.json())
      .then(data => {
        const hasData = (data.people?.length ?? 0) > 0 || (data.events?.length ?? 0) > 0

        if (hasData) {
          // Pré-remplir le state local
          const loaded: OnboardingState = {
            displayName:      data.displayName ?? '',
            birthYear:        data.birthYear   ?? 1960,
            keyPlaces:        [],
            dominantEmotions: [],
            people: (data.people ?? []).map((p: { name: string; relation: string | null; relation_type: string | null }) => ({
              name:         p.name,
              relation:     p.relation     ?? '',
              relationType: (p.relation_type ?? 'autre') as CollectedPerson['relationType'],
            })),
            relations: (data.relations ?? []).map((r: { person_a_id: string; person_b_id: string; relation_label: string | null }) => {
              const a = data.people.find((p: { id: string; name: string }) => p.id === r.person_a_id)
              const b = data.people.find((p: { id: string; name: string }) => p.id === r.person_b_id)
              return { aName: a?.name ?? '', bName: b?.name ?? '', label: r.relation_label ?? '' }
            }).filter((r: CollectedRelation) => r.aName && r.bName),
            events: (data.events ?? []).map((e: { year: number; title: string; theme_ids: string[]; is_pivot?: boolean; emotional_intensity?: number }) => ({
              year:               e.year,
              title:              e.title,
              isPivot:            e.is_pivot ?? false,
              emotionalIntensity: e.emotional_intensity ?? 1,
              themeNames: (e.theme_ids ?? [])
                .map((id: string) => data.themes?.find((t: { id: string; name: string }) => t.id === id)?.name)
                .filter(Boolean) as string[],
            })),
          }
          setState(loaded)
          stateRef.current = loaded

          // Peupler dbIds avec les vrais UUIDs
          data.people.forEach((p: { id: string; name: string }) => dbIds.current.people.set(p.name.toLowerCase(), p.id))
          data.themes.forEach((t: { id: string; name: string }) => dbIds.current.themes.set(t.name, t.id))
          data.events.forEach((e: { id: string; year: number; title: string }) => dbIds.current.events.set(`${e.year}:${e.title}`, e.id))
          data.relations.forEach((r: { person_a_id: string; person_b_id: string }) => dbIds.current.relations.add(`${r.person_a_id}:${r.person_b_id}`))

          if (data.events.length > 0) setPhase(2)

          existingContextRef.current = buildExistingContext(data)
        }

        setIsLoaded(true)
      })
      .catch(() => setIsLoaded(true))
  }, [])

  // Démarrer la conversation une fois le state chargé
  useEffect(() => {
    if (isLoaded) sendToAI([])
  }, [isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Finalisation ──────────────────────────────────────────────────────

  const saveOnboarding = useCallback(async (s: OnboardingState) => {
    setSaving(true)
    try {
      // Marquer l'onboarding terminé + sync état final
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName:     s.displayName,
          birthYear:       s.birthYear,
          people:          s.people,
          personRelations: s.relations,
          events:          s.events,
        }),
      })
      router.push('/tableau')
    } catch {
      setSaving(false)
    }
  }, [router])

  // ── Dialogue IA ───────────────────────────────────────────────────────

  const sendToAI = useCallback(async (msgs: ApiMessage[]) => {
    setStreaming(true)
    let buffer = ''

    setMessages(prev => [...prev, { role: 'ai', text: '' }])

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:        msgs,
          existingContext: msgs.length === 0 ? existingContextRef.current : undefined,
        }),
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
          copy[copy.length - 1] = { role: 'ai', text: stripBlocks(buffer) }
          return copy
        })
        scrollDown()
      }

      // Merger et sauvegarder les extraits
      const prevState = stateRef.current
      const merged    = parseAndMerge(buffer, prevState)
      setState(merged)
      stateRef.current = merged
      if (merged.events.length > 0) setPhase(2)

      await saveExtracts(prevState, merged)

      // Signal de fin ?
      if (COMPLETE_RE.test(buffer)) {
        await saveOnboarding(merged)
        return
      }

      setApiMessages(prev => [...prev, { role: 'assistant', content: buffer }])

    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [scrollDown, saveExtracts, saveOnboarding])

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

  function toggleTheme(id: string) {
    setHiddenThemeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleThemes = useMemo(
    () => themes.filter(t => !hiddenThemeIds.has(t.id)),
    [themes, hiddenThemeIds]
  )

  const showFrise = phase === 2 && events.length > 0
  const friseH    = Math.max(196, 90 + visibleThemes.length * 42)

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF6F0]">
        <span className="text-[#9B5E3A] text-[22px]">¶</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#FAF6F0] overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[#E6DAC8] bg-white flex-shrink-0">
        <span className="text-[22px] text-[#9B5E3A]">¶</span>
        <span className="font-bold text-[15px] tracking-tight text-[#3D2B1A]">Alinéa</span>
        <span className="ml-auto flex items-center gap-3">
          {savingIndicator && (
            <span className="text-[11px] text-[#8C7565] italic">Sauvegarde…</span>
          )}
          {existingContextRef.current && (
            <a href="/tableau" className="text-[11px] text-[#8C7565] hover:text-[#3D2B1A] transition-colors">
              ← Mon tableau
            </a>
          )}
          <span className="text-[11px] text-[#8C7565] bg-[#FAF6F0] border border-[#E6DAC8] rounded-full px-3 py-1">
            Phase {phase} — {phase === 1 ? 'Portrait' : 'Frise de vie'}
          </span>
        </span>
      </header>

      {/* ── Frise — EN HAUT, Phase 2 seulement ──────────────────────────── */}
      {showFrise && (
        <div
          className={[
            'bg-white border-b border-[#E6DAC8] flex-shrink-0 flex flex-col',
            mobileView === 'frise' ? 'block' : 'hidden md:flex',
          ].join(' ')}
          style={{ height: friseH, maxHeight: '50vh' }}
        >
          {/* Chips de filtrage — affichés si > 1 thème */}
          {themes.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 overflow-x-auto border-b border-[#F0E8DC]">
              {themes.map(t => {
                const hidden = hiddenThemeIds.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTheme(t.id)}
                    className={[
                      'flex items-center gap-1.5 text-[11px] border rounded-full px-2 py-0.5 flex-shrink-0 transition-opacity',
                      hidden ? 'opacity-30 border-[#E6DAC8] text-[#8C7565]' : 'border-[#E6DAC8] text-[#3D2B1A] bg-white',
                    ].join(' ')}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <FriseSVG themes={visibleThemes} events={events} birthYear={state.birthYear} />
          </div>
        </div>
      )}

      {/* ── Zone principale ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 w-full">

        {/* Chat */}
        <div className={[
          'flex flex-col bg-white border-r border-[#E6DAC8]',
          phase === 1 ? 'md:w-[62%]' : 'md:w-[55%]',
          mobileView === 'chat' ? 'flex w-full' : 'hidden md:flex',
        ].join(' ')}>

          <div ref={msgsRef} className="flex-1 overflow-y-auto px-5 pt-6 pb-3 flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <div key={i} className={[
                'max-w-[88%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap',
                m.role === 'ai'
                  ? 'bg-[#F0E8DC] self-start rounded-bl-sm text-[#3D2B1A]'
                  : 'bg-[#9B5E3A] self-end rounded-br-sm text-white text-[13.5px]',
              ].join(' ')}>
                {m.text || <span className="opacity-40 italic">…</span>}
              </div>
            ))}
            {saving && (
              <div className="bg-[#EEF4EE] border-l-2 border-[#4A7A5A] px-4 py-2.5 rounded-xl text-[13.5px] text-[#2A5A3C] self-start max-w-[92%]">
                ✓ Sauvegarde en cours…
              </div>
            )}
          </div>

          <div className="px-4 py-3 flex-shrink-0 border-t border-[#E6DAC8]">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={inputVal}
                disabled={streaming || saving}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={streaming ? 'Alinéa écrit…' : 'Ta réponse…'}
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

        {/* ── Panneau latéral ────────────────────────────────────────────── */}
        <div className={[
          'flex flex-col flex-1 min-w-0 bg-[#FAF6F0]',
          mobileView === 'personnes' || mobileView === 'themes' ? 'flex w-full' : 'hidden md:flex',
        ].join(' ')}>

          {phase === 2 && themes.length > 0 && (
            <div className={[
              'px-3 pt-3 pb-2 border-b border-[#E6DAC8] flex-shrink-0 bg-white',
              mobileView === 'themes' ? 'block' : 'hidden md:block',
            ].join(' ')}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">Thématiques</p>
              <div className="flex flex-wrap gap-1.5">
                {themes.map(t => {
                  const hidden = hiddenThemeIds.has(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTheme(t.id)}
                      title={hidden ? 'Afficher dans la frise' : 'Masquer dans la frise'}
                      className={[
                        'flex items-center gap-1.5 text-[12px] border rounded-full px-2.5 py-0.5 transition-opacity',
                        hidden
                          ? 'opacity-30 text-[#8C7565] border-[#E6DAC8] bg-[#FAF6F0]'
                          : 'text-[#3D2B1A] border-[#E6DAC8] bg-[#FAF6F0] hover:border-[#9B5E3A]',
                      ].join(' ')}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className={[
            'flex flex-col flex-1 min-h-0',
            mobileView === 'themes' ? 'hidden md:flex' : 'flex',
          ].join(' ')}>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] px-4 pt-3 pb-0 flex-shrink-0">
              {phase === 1 ? 'Tes proches' : 'Ta toile'}
            </p>
            <div className="flex-1">
              <RelationsGraph people={people} relations={relations} userName={state.displayName || 'Moi'} />
            </div>
          </div>
        </div>
      </div>

      <MobileNav active={mobileView} phase={phase} onChange={setMobileView} />
    </div>
  )
}
