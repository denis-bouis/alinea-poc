'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Person, PersonRelation, Theme, LifePhase, LifeEvent } from '@/types/domain'
import { RELATION_TYPE_LABEL } from '@/types/domain'
import type { PeopleRelationType } from '@/types/domain'
import PivotIcon from './PivotIcon'
import DeceasedIcon from './DeceasedIcon'

export type EntityRef = { type: 'person' | 'place' | 'life_event' | 'alinea'; id: string; label: string }

type LinkedItem = { ref: EntityRef; sub?: string; pivot?: boolean }

function formatLinkedEventYear(year: number | null, yearEnd: number | null): string {
  if (year == null) return 'à dater'
  if (yearEnd != null && yearEnd !== year) return `${year}–${yearEnd}`
  return String(year)
}

type PlaceData   = { id: string; name: string; region: string | null; country: string | null; ai_summary: string | null }
type AlineaData  = {
  id: string; title: string | null; content: string | null; status: 'seed' | 'draft' | 'validated'
  approximate_date: string | null; ai_memory: string | null; life_event_id: string | null
}

type Props = {
  entity:      EntityRef
  people:      Person[]
  relations:   PersonRelation[]
  themes:      Theme[]
  phases:      LifePhase[]
  events:      LifeEvent[]
  onClose:     () => void
  onNavigate:  (ref: EntityRef) => void
  onBack?:     () => void
  onFocus:     (ref: EntityRef) => void
  onSaved:     () => void
  onAddLink?:  () => void
}

export default function DetailPanel({
  entity, people, relations, themes, phases, events, onClose, onNavigate, onBack, onFocus, onSaved, onAddLink,
}: Props) {
  const [loading, setLoading]   = useState(true)
  const [place,   setPlace]     = useState<PlaceData | null>(null)
  const [event,   setEvent]     = useState<LifeEvent | null>(null)
  const [alinea,  setAlinea]    = useState<AlineaData | null>(null)
  const [linked,  setLinked]    = useState<LinkedItem[]>([])
  const [mode,    setMode]      = useState<'view' | 'edit' | 'merge' | 'delete'>('view')
  const [editName, setEditName] = useState('')
  const [editRelation, setEditRelation] = useState('')
  const [editBirthYear, setEditBirthYear]   = useState('')
  const [editBirthMonth, setEditBirthMonth] = useState('')
  const [editBirthDay, setEditBirthDay]     = useState('')
  const [editIsDeceased, setEditIsDeceased] = useState(false)
  const [editDeathYear, setEditDeathYear]   = useState('')
  const [editDeathMonth, setEditDeathMonth] = useState('')
  const [editDeathDay, setEditDeathDay]     = useState('')
  const [editEmail, setEditEmail]           = useState('')
  const [editPhone, setEditPhone]           = useState('')
  const [editPlaceName, setEditPlaceName]       = useState('')
  const [editPlaceRegion, setEditPlaceRegion]   = useState('')
  const [editPlaceCountry, setEditPlaceCountry] = useState('')
  const [editEventTitle, setEditEventTitle] = useState('')
  const [editEventYear, setEditEventYear]   = useState('')
  const [editEventMonth, setEditEventMonth] = useState('')
  const [editEventDay, setEditEventDay]     = useState('')
  const [editEventIsRange, setEditEventIsRange] = useState(false)
  const [editEventYearEnd, setEditEventYearEnd]   = useState('')
  const [editEventMonthEnd, setEditEventMonthEnd] = useState('')
  const [editEventDayEnd, setEditEventDayEnd]     = useState('')
  const [editEventIsPivot, setEditEventIsPivot]   = useState(false)
  const [editPersonAiSummary, setEditPersonAiSummary] = useState('')
  const [editPlaceAiSummary,  setEditPlaceAiSummary]  = useState('')
  const [editEventAiSummary,  setEditEventAiSummary]  = useState('')
  // Modifier la mémoire IA est sensible : premier clic sur Sauvegarder affiche
  // un avertissement, il faut confirmer une seconde fois pour appliquer.
  const [pendingAiConfirm, setPendingAiConfirm] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null)
  const [keepId, setKeepId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const person = entity.type === 'person' ? people.find(p => p.id === entity.id) ?? null : null

  function resetPersonFields(p: Person) {
    setEditName(p.name)
    setEditRelation(p.relation ?? '')
    setEditBirthYear(p.birth_year?.toString() ?? '')
    setEditBirthMonth(p.birth_month?.toString() ?? '')
    setEditBirthDay(p.birth_day?.toString() ?? '')
    setEditIsDeceased(p.is_deceased)
    setEditDeathYear(p.death_year?.toString() ?? '')
    setEditDeathMonth(p.death_month?.toString() ?? '')
    setEditDeathDay(p.death_day?.toString() ?? '')
    setEditEmail(p.email ?? '')
    setEditPhone(p.phone ?? '')
    setEditPersonAiSummary(p.ai_summary ?? '')
  }

  function resetPlaceFields(p: PlaceData) {
    setEditPlaceName(p.name)
    setEditPlaceRegion(p.region ?? '')
    setEditPlaceCountry(p.country ?? '')
    setEditPlaceAiSummary(p.ai_summary ?? '')
  }

  function resetEventFields(e: LifeEvent) {
    setEditEventTitle(e.title)
    setEditEventYear(e.year?.toString() ?? '')
    setEditEventMonth(e.event_month?.toString() ?? '')
    setEditEventDay(e.event_day?.toString() ?? '')
    setEditEventIsRange(e.year_end != null)
    setEditEventYearEnd(e.year_end?.toString() ?? '')
    setEditEventMonthEnd(e.event_month_end?.toString() ?? '')
    setEditEventDayEnd(e.event_day_end?.toString() ?? '')
    setEditEventAiSummary(e.ai_summary ?? '')
    setEditEventIsPivot(e.is_pivot)
  }

  useEffect(() => {
    setMode('view'); setError(null); setPendingAiConfirm(false)
    if (entity.type === 'person') {
      if (person) resetPersonFields(person)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const supabase = createClient()

    async function run() {
      if (entity.type === 'place') {
        const { data } = await supabase.from('places').select('*').eq('id', entity.id).single()
        if (cancelled) return
        const placeData = (data as PlaceData) ?? null
        setPlace(placeData)
        if (placeData) resetPlaceFields(placeData)
        const [{ data: al }, { data: ev }] = await Promise.all([
          supabase.from('alinea_places').select('alinea_id, alineas(id, title)').eq('place_id', entity.id),
          supabase.from('life_event_places').select('life_event_id, life_events(id, title, year, year_end, is_pivot)').eq('place_id', entity.id),
        ])
        if (cancelled) return
        const items: LinkedItem[] = [
          ...((al ?? []) as unknown as { alineas: { id: string; title: string | null } | null }[])
            .filter(r => r.alineas)
            .map(r => ({ ref: { type: 'alinea' as const, id: r.alineas!.id, label: r.alineas!.title ?? 'Sans titre' } })),
          ...((ev ?? []) as unknown as { life_events: { id: string; title: string; year: number | null; year_end: number | null; is_pivot: boolean } | null }[])
            .filter(r => r.life_events)
            .map(r => ({
              ref: { type: 'life_event' as const, id: r.life_events!.id, label: r.life_events!.title },
              sub: formatLinkedEventYear(r.life_events!.year, r.life_events!.year_end),
              pivot: r.life_events!.is_pivot,
            })),
        ]
        setLinked(items)
      }

      if (entity.type === 'life_event') {
        // theme_ids est un champ dérivé (jointure life_event_themes, reconstruit
        // en amont dans page.tsx) — absent d'un select('*') direct sur life_events.
        // On le prend depuis la liste déjà enrichie plutôt que de le re-fetcher.
        const eventData = events.find(e => e.id === entity.id) ?? null
        setEvent(eventData)
        if (eventData) resetEventFields(eventData)
        const { data: al } = await supabase
          .from('alineas').select('id, title, sort_order').eq('life_event_id', entity.id).order('sort_order')
        if (cancelled) return
        setLinked((al ?? []).map(a => ({ ref: { type: 'alinea' as const, id: a.id, label: a.title ?? 'Sans titre' } })))
      }

      if (entity.type === 'alinea') {
        const { data } = await supabase.from('alineas').select('*').eq('id', entity.id).single()
        if (cancelled) return
        setAlinea(data as AlineaData | null)
        const items: LinkedItem[] = []
        if (data?.life_event_id) {
          const { data: ev } = await supabase.from('life_events').select('id, title, year, year_end, is_pivot').eq('id', data.life_event_id).single()
          if (ev) items.push({ ref: { type: 'life_event', id: ev.id, label: ev.title }, sub: formatLinkedEventYear(ev.year, ev.year_end), pivot: ev.is_pivot })
        }
        const { data: ppl } = await supabase.from('alinea_people').select('people(id, name)').eq('alinea_id', entity.id)
        for (const r of (ppl ?? []) as unknown as { people: { id: string; name: string } | null }[]) {
          if (r.people) items.push({ ref: { type: 'person', id: r.people.id, label: r.people.name } })
        }
        if (!cancelled) setLinked(items)
      }

      if (!cancelled) setLoading(false)
    }
    run().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.type, entity.id])

  const others = person ? people.filter(p => p.id !== person.id) : []

  async function handleSaveEdit() {
    if (!person || !editName.trim()) return
    const aiChanged = editPersonAiSummary !== (person.ai_summary ?? '')
    if (aiChanged && !pendingAiConfirm) { setPendingAiConfirm(true); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName, relation: editRelation,
        birthYear:  editBirthYear.trim()  ? Number(editBirthYear)  : null,
        birthMonth: editBirthMonth.trim() ? Number(editBirthMonth) : null,
        birthDay:   editBirthDay.trim()   ? Number(editBirthDay)   : null,
        isDeceased: editIsDeceased,
        deathYear:  editIsDeceased && editDeathYear.trim()  ? Number(editDeathYear)  : null,
        deathMonth: editIsDeceased && editDeathMonth.trim() ? Number(editDeathMonth) : null,
        deathDay:   editIsDeceased && editDeathDay.trim()   ? Number(editDeathDay)   : null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        aiSummary: editPersonAiSummary || null,
      }),
    })
    setSaving(false); setPendingAiConfirm(false)
    if (res.ok) {
      if (!aiChanged) fetch(`/api/people/${person.id}/refresh-summary`, { method: 'POST' }).catch(() => {})
      onSaved(); onClose()
    } else setError('Erreur lors de la sauvegarde.')
  }

  async function handleSavePlaceEdit() {
    if (!place || !editPlaceName.trim()) return
    const aiChanged = editPlaceAiSummary !== (place.ai_summary ?? '')
    if (aiChanged && !pendingAiConfirm) { setPendingAiConfirm(true); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/places/${place.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editPlaceName, region: editPlaceRegion || null, country: editPlaceCountry || null,
        aiSummary: editPlaceAiSummary || null,
      }),
    })
    setSaving(false); setPendingAiConfirm(false)
    if (res.ok) { onSaved(); onClose() } else setError('Erreur lors de la sauvegarde.')
  }

  async function handleSaveEventEdit() {
    if (!event || !editEventTitle.trim()) return
    const aiChanged = editEventAiSummary !== (event.ai_summary ?? '')
    if (aiChanged && !pendingAiConfirm) { setPendingAiConfirm(true); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/life-events/${event.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editEventTitle,
        year: editEventYear.trim() ? Number(editEventYear) : null,
        month: editEventMonth.trim() ? Number(editEventMonth) : null,
        day: editEventDay.trim() ? Number(editEventDay) : null,
        yearEnd:  editEventIsRange && editEventYearEnd.trim()  ? Number(editEventYearEnd)  : null,
        monthEnd: editEventIsRange && editEventMonthEnd.trim() ? Number(editEventMonthEnd) : null,
        dayEnd:   editEventIsRange && editEventDayEnd.trim()   ? Number(editEventDayEnd)   : null,
        aiSummary: editEventAiSummary || null,
        isPivot: editEventIsPivot,
      }),
    })
    setSaving(false); setPendingAiConfirm(false)
    if (res.ok) { onSaved(); onClose() } else setError('Erreur lors de la sauvegarde.')
  }

  async function handleDelete() {
    if (!person) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() } else setError('Erreur lors de la suppression.')
  }

  async function handleMerge() {
    if (!person || !mergeTarget) return
    setSaving(true); setError(null)
    const deleteId = keepId === person.id ? mergeTarget.id : person.id
    const res = await fetch('/api/people/merge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, deleteId }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() } else setError('Erreur lors de la fusion.')
  }

  const title = entity.type === 'person' ? person?.name ?? entity.label
    : entity.type === 'place' ? place?.name ?? entity.label
    : entity.type === 'life_event' ? event?.title ?? entity.label
    : alinea?.title ?? entity.label

  const typeLabel = { person: 'Personne', place: 'Lieu', life_event: 'Événement', alinea: 'Alinéa' }[entity.type]

  const aiSummary = entity.type === 'person' ? person?.ai_summary
    : entity.type === 'place' ? place?.ai_summary
    : entity.type === 'alinea' ? alinea?.ai_memory
    : entity.type === 'life_event' ? event?.ai_summary
    : null

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-[80]" onClick={onClose} />
      <div className="fixed inset-6 max-[640px]:inset-2 z-[90] bg-[#FAF8F4] rounded-2xl border border-[#E8E2D9] shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#E8E2D9] flex-shrink-0">
          {onBack && (
            <button onClick={onBack} className="text-[#8C8278] hover:text-[#2C2825] text-[13px] mr-1">← Retour</button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9B5E3A]">{typeLabel}</p>
            <p className="font-serif text-[19px] text-[#2C2825] truncate">{title}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[#8C8278] hover:text-[#2C2825] text-[20px] leading-none flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-[34rem] mx-auto flex flex-col gap-5">

            {loading ? (
              <p className="text-[13px] text-[#8C8278] italic">Chargement…</p>
            ) : (
              <>
                {/* Champs structurés */}
                {entity.type === 'person' && person && mode === 'view' && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    {person.relation && <p><span className="text-[#8C8278]">Lien </span>{person.relation}</p>}
                    {person.birth_year && (
                      <p><span className="text-[#8C8278]">Né·e </span>
                        {[person.birth_day, person.birth_month, person.birth_year].filter(Boolean).join('/')}
                      </p>
                    )}
                    {person.is_deceased && (
                      <p className="text-[#8C8278] italic flex items-center gap-1.5">
                        <DeceasedIcon />
                        Décédé·e
                        {person.death_year ? ` · ${[person.death_day, person.death_month, person.death_year].filter(Boolean).join('/')}` : ''}
                      </p>
                    )}
                    {person.email && <p><span className="text-[#8C8278]">Email </span>{person.email}</p>}
                    {person.phone && <p><span className="text-[#8C8278]">Tél. </span>{person.phone}</p>}
                  </section>
                )}
                {entity.type === 'place' && place && mode === 'view' && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    {(place.region || place.country) && (
                      <p className="text-[#8C8278]">{[place.region, place.country].filter(Boolean).join(' · ')}</p>
                    )}
                  </section>
                )}
                {entity.type === 'life_event' && event && mode === 'view' && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    <p className="text-[#8C8278]">
                      {event.year == null ? 'à dater' : (
                        <>
                          {event.year}{event.event_month ? `/${event.event_month}` : ''}{event.event_day ? `/${event.event_day}` : ''}
                          {event.year_end != null && event.year_end !== event.year && (
                            <> → {event.year_end}{event.event_month_end ? `/${event.event_month_end}` : ''}{event.event_day_end ? `/${event.event_day_end}` : ''}</>
                          )}
                        </>
                      )}
                      {' · '}{{ undocumented: 'non documenté', draft: 'brouillon', validated: 'validé' }[event.status]}
                      {event.is_pivot && <PivotIcon className="ml-1.5" />}
                    </p>
                    {event.life_phase_id && (
                      <p className="text-[#8C8278]">{phases.find(p => p.id === event.life_phase_id)?.name}</p>
                    )}
                    {themes.filter(t => event.theme_ids?.includes(t.id)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {themes.filter(t => event.theme_ids?.includes(t.id)).map(t => (
                          <span key={t.id} className="flex items-center gap-1 text-[11px] text-[#8C8278]">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />{t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {entity.type === 'alinea' && alinea && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    <p className="text-[#8C8278]">
                      {alinea.approximate_date ?? 'date non précisée'}
                      {' · '}{{ seed: 'amorce', draft: 'brouillon', validated: 'validé' }[alinea.status]}
                    </p>
                  </section>
                )}

                {/* Mémoire IA */}
                {aiSummary && mode === 'view' && (
                  <section className="bg-[#F2EDE5] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8C8278] mb-1.5">Mémoire IA</p>
                    <p className="text-[13px] text-[#2C2825] leading-relaxed italic">{aiSummary}</p>
                  </section>
                )}

                {/* Récit — alinéas uniquement */}
                {entity.type === 'alinea' && alinea && (
                  <section>
                    <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8C8278] mb-1.5">Récit</p>
                    {alinea.content ? (
                      <p className="text-[14px] text-[#2C2825] leading-relaxed whitespace-pre-wrap font-serif">{alinea.content}</p>
                    ) : (
                      <p className="text-[13px] text-[#8C8278] italic">Pas encore rédigé.</p>
                    )}
                    <a href={`/alinea/${alinea.id}/edit`} className="inline-block mt-2 text-[12px] text-[#9B5E3A]">
                      {alinea.content ? 'Ouvrir / réviser' : 'Écrire'} →
                    </a>
                  </section>
                )}

                {/* Relations déclarées — personne */}
                {entity.type === 'person' && person && mode === 'view' && (
                  <section>
                    <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8C8278] mb-2">Relations déclarées</p>
                    {(() => {
                      const own = relations.filter(r => r.person_a_id === person.id && (!r.is_symmetric || r.person_a_id < r.person_b_id))
                      if (own.length === 0) return <p className="text-[12px] text-[#8C8278] italic">Aucun lien déclaré.</p>
                      return (
                        <div className="flex flex-col gap-1.5">
                          {own.map(r => {
                            const other = people.find(p => p.id === r.person_b_id)
                            const label = RELATION_TYPE_LABEL[r.relation_type as PeopleRelationType] ?? r.relation_type
                            return (
                              <button
                                key={r.id}
                                onClick={() => other && onNavigate({ type: 'person', id: other.id, label: other.name })}
                                className="flex items-center gap-2 text-[13px] text-[#2C2825] hover:text-[#9B5E3A] text-left"
                              >
                                <span className="text-[#8C8278]">·</span>{other?.name ?? '?'}
                                <span className="text-[#8C8278] text-[11px]">{label}</span>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </section>
                )}

                {/* Éléments liés */}
                {linked.length > 0 && mode === 'view' && (
                  <section>
                    <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#8C8278] mb-2">Liés</p>
                    <div className="flex flex-col gap-1">
                      {linked.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => onNavigate(item.ref)}
                          className="text-left text-[13px] text-[#2C2825] hover:text-[#9B5E3A] transition-colors"
                        >
                          {item.ref.label}{' '}
                          <span className="text-[11px] text-[#8C8278]">
                            ({{ person: 'personne', place: 'lieu', life_event: 'événement', alinea: 'alinéa' }[item.ref.type]}
                            {item.sub ? ` · ${item.sub}` : ''})
                          </span>
                          {item.pivot && <PivotIcon className="ml-1" />}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Édition / fusion / suppression — personne */}
                {entity.type === 'person' && person && mode === 'edit' && (
                  <div className="flex flex-col gap-3">
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nom"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <input value={editRelation} onChange={e => setEditRelation(e.target.value)} placeholder="Relation"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <div>
                      <label className="text-[11px] text-[#8C8278] block mb-1">Naissance</label>
                      <div className="flex gap-2">
                        <input value={editBirthDay} onChange={e => setEditBirthDay(e.target.value)} placeholder="JJ" inputMode="numeric"
                               className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        <input value={editBirthMonth} onChange={e => setEditBirthMonth(e.target.value)} placeholder="MM" inputMode="numeric"
                               className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        <input value={editBirthYear} onChange={e => setEditBirthYear(e.target.value)} placeholder="AAAA" inputMode="numeric"
                               className="w-24 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-[#2C2825] cursor-pointer">
                      <input type="checkbox" checked={editIsDeceased} onChange={e => setEditIsDeceased(e.target.checked)} className="accent-[#9B5E3A]" />
                      Décédé·e
                    </label>
                    {editIsDeceased && (
                      <div>
                        <label className="text-[11px] text-[#8C8278] block mb-1">Décès</label>
                        <div className="flex gap-2">
                          <input value={editDeathDay} onChange={e => setEditDeathDay(e.target.value)} placeholder="JJ" inputMode="numeric"
                                 className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                          <input value={editDeathMonth} onChange={e => setEditDeathMonth(e.target.value)} placeholder="MM" inputMode="numeric"
                                 className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                          <input value={editDeathYear} onChange={e => setEditDeathYear(e.target.value)} placeholder="AAAA" inputMode="numeric"
                                 className="w-24 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        </div>
                      </div>
                    )}
                    <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email" type="email"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Téléphone" type="tel"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <div>
                      <label className="text-[11px] text-[#8C8278] block mb-1">Mémoire IA</label>
                      <AutoTextarea value={editPersonAiSummary} onChange={v => { setEditPersonAiSummary(v); setPendingAiConfirm(false) }}
                                className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[13px] outline-none focus:border-[#9B5E3A] resize-none overflow-hidden" />
                    </div>
                    {pendingAiConfirm && (
                      <p className="text-[12px] text-[#9B5E3A] bg-[#FAF0E4] border border-[#E8C9A8] rounded-lg px-3 py-2">
                        Tu modifies ce que l&apos;IA a compris de cette personne — clique à nouveau sur Sauvegarder pour confirmer.
                      </p>
                    )}
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={saving || !editName.trim()} className="flex-1 px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Sauvegarde…' : pendingAiConfirm ? 'Confirmer la modification' : 'Sauvegarder'}
                      </button>
                      <button onClick={() => { setMode('view'); setPendingAiConfirm(false); if (person) resetPersonFields(person) }} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
                    </div>
                  </div>
                )}

                {/* Édition — lieu */}
                {entity.type === 'place' && place && mode === 'edit' && (
                  <div className="flex flex-col gap-3">
                    <input value={editPlaceName} onChange={e => setEditPlaceName(e.target.value)} placeholder="Nom"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <input value={editPlaceRegion} onChange={e => setEditPlaceRegion(e.target.value)} placeholder="Région"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <input value={editPlaceCountry} onChange={e => setEditPlaceCountry(e.target.value)} placeholder="Pays"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <div>
                      <label className="text-[11px] text-[#8C8278] block mb-1">Mémoire IA</label>
                      <AutoTextarea value={editPlaceAiSummary} onChange={v => { setEditPlaceAiSummary(v); setPendingAiConfirm(false) }}
                                className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[13px] outline-none focus:border-[#9B5E3A] resize-none overflow-hidden" />
                    </div>
                    {pendingAiConfirm && (
                      <p className="text-[12px] text-[#9B5E3A] bg-[#FAF0E4] border border-[#E8C9A8] rounded-lg px-3 py-2">
                        Tu modifies ce que l&apos;IA a compris de ce lieu — clique à nouveau sur Sauvegarder pour confirmer.
                      </p>
                    )}
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSavePlaceEdit} disabled={saving || !editPlaceName.trim()} className="flex-1 px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Sauvegarde…' : pendingAiConfirm ? 'Confirmer la modification' : 'Sauvegarder'}
                      </button>
                      <button onClick={() => { setMode('view'); setPendingAiConfirm(false); if (place) resetPlaceFields(place) }} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
                    </div>
                  </div>
                )}

                {/* Édition — événement */}
                {entity.type === 'life_event' && event && mode === 'edit' && (
                  <div className="flex flex-col gap-3">
                    <input value={editEventTitle} onChange={e => setEditEventTitle(e.target.value)} placeholder="Titre"
                           className="px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                    <div>
                      <label className="text-[11px] text-[#8C8278] block mb-1">Date</label>
                      <div className="flex gap-2">
                        <input value={editEventDay} onChange={e => setEditEventDay(e.target.value)} placeholder="JJ" inputMode="numeric"
                               className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        <input value={editEventMonth} onChange={e => setEditEventMonth(e.target.value)} placeholder="MM" inputMode="numeric"
                               className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        <input value={editEventYear} onChange={e => setEditEventYear(e.target.value)} placeholder="AAAA" inputMode="numeric"
                               className="w-24 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                      </div>
                      <p className="text-[10px] text-[#C4BDB6] italic mt-1">Vide = à dater</p>
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-[#2C2825] cursor-pointer">
                      <input type="checkbox" checked={editEventIsRange} onChange={e => setEditEventIsRange(e.target.checked)} className="accent-[#9B5E3A]" />
                      Événement sur une période (pas ponctuel)
                    </label>
                    {editEventIsRange && (
                      <div>
                        <label className="text-[11px] text-[#8C8278] block mb-1">Date de fin</label>
                        <div className="flex gap-2">
                          <input value={editEventDayEnd} onChange={e => setEditEventDayEnd(e.target.value)} placeholder="JJ" inputMode="numeric"
                                 className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                          <input value={editEventMonthEnd} onChange={e => setEditEventMonthEnd(e.target.value)} placeholder="MM" inputMode="numeric"
                                 className="w-16 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                          <input value={editEventYearEnd} onChange={e => setEditEventYearEnd(e.target.value)} placeholder="AAAA" inputMode="numeric"
                                 className="w-24 px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] outline-none focus:border-[#9B5E3A]" />
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[13px] text-[#2C2825] cursor-pointer">
                      <input type="checkbox" checked={editEventIsPivot} onChange={e => setEditEventIsPivot(e.target.checked)} className="accent-[#9B5E3A]" />
                      Moment tournant
                    </label>
                    <div>
                      <label className="text-[11px] text-[#8C8278] block mb-1">Mémoire IA</label>
                      <AutoTextarea value={editEventAiSummary} onChange={v => { setEditEventAiSummary(v); setPendingAiConfirm(false) }}
                                className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[13px] outline-none focus:border-[#9B5E3A] resize-none overflow-hidden" />
                    </div>
                    {pendingAiConfirm && (
                      <p className="text-[12px] text-[#9B5E3A] bg-[#FAF0E4] border border-[#E8C9A8] rounded-lg px-3 py-2">
                        Tu modifies ce que l&apos;IA a compris de cet événement — clique à nouveau sur Sauvegarder pour confirmer.
                      </p>
                    )}
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEventEdit} disabled={saving || !editEventTitle.trim()} className="flex-1 px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Sauvegarde…' : pendingAiConfirm ? 'Confirmer la modification' : 'Sauvegarder'}
                      </button>
                      <button onClick={() => { setMode('view'); setPendingAiConfirm(false); if (event) resetEventFields(event) }} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
                    </div>
                  </div>
                )}

                {entity.type === 'person' && person && mode === 'merge' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-[13px]">Cette personne est la même que…</p>
                    <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
                      {others.map(p => (
                        <button key={p.id} onClick={() => { setMergeTarget(p); setKeepId(p.id) }}
                                className={['px-3 py-2 rounded-xl text-left border text-[13px]', mergeTarget?.id === p.id ? 'border-[#9B5E3A] bg-white' : 'border-[#E6DAC8]'].join(' ')}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleMerge} disabled={saving || !mergeTarget} className="flex-1 px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Fusion…' : 'Fusionner'}
                      </button>
                      <button onClick={() => setMode('view')} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
                    </div>
                  </div>
                )}

                {entity.type === 'person' && person && mode === 'delete' && (
                  <div className="flex flex-col gap-3">
                    <div className="bg-[#FFF8F5] border border-[#EECECE] rounded-xl px-4 py-3 text-[13px]">
                      Supprimer <strong>{person.name}</strong> et ses relations ?
                    </div>
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleDelete} disabled={saving} className="flex-1 px-4 py-2 bg-[#CC4444] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Suppression…' : 'Confirmer'}
                      </button>
                      <button onClick={() => setMode('view')} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-t border-[#E8E2D9] flex-shrink-0">
          <button
            onClick={() => onFocus(entity)}
            className="px-3 py-1.5 rounded-lg text-[12px] text-[#9B5E3A] hover:bg-[#F2EDE5] transition-colors"
          >
            🎯 Mettre le focus ici
          </button>
          {entity.type === 'person' && mode === 'view' && !loading && (
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setMode('edit')} className="px-3 py-1.5 text-[12px] text-[#8C8278] hover:text-[#2C2825]">Modifier</button>
              {onAddLink && <button onClick={onAddLink} className="px-3 py-1.5 text-[12px] text-[#8C8278] hover:text-[#2C2825]">Déclarer un lien</button>}
              {others.length > 0 && <button onClick={() => setMode('merge')} className="px-3 py-1.5 text-[12px] text-[#8C8278] hover:text-[#2C2825]">Fusionner</button>}
              <button onClick={() => setMode('delete')} className="px-3 py-1.5 text-[12px] text-[#CC4444] hover:bg-[#FFF0F0] rounded-lg">Supprimer</button>
            </div>
          )}
          {(entity.type === 'place' || entity.type === 'life_event') && mode === 'view' && !loading && (
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setMode('edit')} className="px-3 py-1.5 text-[12px] text-[#8C8278] hover:text-[#2C2825]">Modifier</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Hauteur qui suit le contenu plutôt qu'une taille fixe (rows) trop courte
// pour une synthèse IA longue, ou inutilement grande pour une courte.
function AutoTextarea({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} rows={3} className={className} />
}
