'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Person, PersonRelation, Theme, LifePhase, LifeEvent } from '@/types/domain'
import { RELATION_TYPE_LABEL } from '@/types/domain'
import type { PeopleRelationType } from '@/types/domain'

export type EntityRef = { type: 'person' | 'place' | 'life_event' | 'alinea'; id: string; label: string }

type LinkedItem = { ref: EntityRef; sub?: string }

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
  onClose:     () => void
  onNavigate:  (ref: EntityRef) => void
  onBack?:     () => void
  onFocus:     (ref: EntityRef) => void
  onSaved:     () => void
  onAddLink?:  () => void
}

export default function DetailPanel({
  entity, people, relations, themes, phases, onClose, onNavigate, onBack, onFocus, onSaved, onAddLink,
}: Props) {
  const [loading, setLoading]   = useState(true)
  const [place,   setPlace]     = useState<PlaceData | null>(null)
  const [event,   setEvent]     = useState<LifeEvent | null>(null)
  const [alinea,  setAlinea]    = useState<AlineaData | null>(null)
  const [linked,  setLinked]    = useState<LinkedItem[]>([])
  const [mode,    setMode]      = useState<'view' | 'edit' | 'merge' | 'delete'>('view')
  const [editName, setEditName] = useState('')
  const [editRelation, setEditRelation] = useState('')
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null)
  const [keepId, setKeepId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const person = entity.type === 'person' ? people.find(p => p.id === entity.id) ?? null : null

  useEffect(() => {
    setMode('view'); setError(null)
    if (entity.type === 'person') {
      if (person) { setEditName(person.name); setEditRelation(person.relation ?? '') }
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
        setPlace((data as PlaceData) ?? null)
        const [{ data: al }, { data: ev }] = await Promise.all([
          supabase.from('alinea_places').select('alinea_id, alineas(id, title)').eq('place_id', entity.id),
          supabase.from('life_event_places').select('life_event_id, life_events(id, title)').eq('place_id', entity.id),
        ])
        if (cancelled) return
        const items: LinkedItem[] = [
          ...((al ?? []) as unknown as { alineas: { id: string; title: string | null } | null }[])
            .filter(r => r.alineas)
            .map(r => ({ ref: { type: 'alinea' as const, id: r.alineas!.id, label: r.alineas!.title ?? 'Sans titre' } })),
          ...((ev ?? []) as unknown as { life_events: { id: string; title: string } | null }[])
            .filter(r => r.life_events)
            .map(r => ({ ref: { type: 'life_event' as const, id: r.life_events!.id, label: r.life_events!.title } })),
        ]
        setLinked(items)
      }

      if (entity.type === 'life_event') {
        const { data } = await supabase.from('life_events').select('*').eq('id', entity.id).single()
        if (cancelled) return
        setEvent(data as LifeEvent | null)
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
          const { data: ev } = await supabase.from('life_events').select('id, title').eq('id', data.life_event_id).single()
          if (ev) items.push({ ref: { type: 'life_event', id: ev.id, label: ev.title } })
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
    setSaving(true); setError(null)
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, relation: editRelation }),
    })
    setSaving(false)
    if (res.ok) {
      fetch(`/api/people/${person.id}/refresh-summary`, { method: 'POST' }).catch(() => {})
      onSaved(); onClose()
    } else setError('Erreur lors de la sauvegarde.')
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
    : null // life_event.ai_summary pas encore en base (cf. Conception-memoire-IA, chantier non fait)

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
                    {person.is_deceased && <p className="text-[#8C8278] italic">Décédé·e{person.death_year ? ` · ${person.death_year}` : ''}</p>}
                  </section>
                )}
                {entity.type === 'place' && place && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    {(place.region || place.country) && (
                      <p className="text-[#8C8278]">{[place.region, place.country].filter(Boolean).join(' · ')}</p>
                    )}
                  </section>
                )}
                {entity.type === 'life_event' && event && (
                  <section className="flex flex-col gap-1 text-[13px] text-[#2C2825]">
                    <p className="text-[#8C8278]">
                      {event.year}{event.event_month ? `/${event.event_month}` : ''}{event.event_day ? `/${event.event_day}` : ''}
                      {' · '}{{ undocumented: 'non documenté', draft: 'brouillon', validated: 'validé' }[event.status]}
                    </p>
                    {event.life_phase_id && (
                      <p className="text-[#8C8278]">{phases.find(p => p.id === event.life_phase_id)?.name}</p>
                    )}
                    {themes.filter(t => event.theme_ids.includes(t.id)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {themes.filter(t => event.theme_ids.includes(t.id)).map(t => (
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
                {aiSummary && (
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
                          {item.ref.label} <span className="text-[11px] text-[#8C8278]">({{ person: 'personne', place: 'lieu', life_event: 'événement', alinea: 'alinéa' }[item.ref.type]})</span>
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
                    {error && <p className="text-[12px] text-[#B0504A]">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={saving || !editName.trim()} className="flex-1 px-4 py-2 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-medium disabled:opacity-40">
                        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                      </button>
                      <button onClick={() => setMode('view')} className="px-4 py-2 border border-[#E6DAC8] rounded-xl text-[13px]">Annuler</button>
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
        </div>
      </div>
    </>
  )
}
