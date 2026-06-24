'use client'

import { useState } from 'react'
import type { Person } from '@/types/domain'

type Mode = 'view' | 'edit' | 'merge' | 'delete'

type Props = {
  person:     Person
  allPeople:  Person[]
  onClose:    () => void
  onSaved:    () => void
}

export default function PersonPanel({ person, allPeople, onClose, onSaved }: Props) {
  const [mode,        setMode]        = useState<Mode>('view')
  const [editName,    setEditName]    = useState(person.name)
  const [editRelation, setEditRelation] = useState(person.relation ?? '')
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null)
  const [keepId,      setKeepId]      = useState<string>(person.id)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const others = allPeople.filter(p => p.id !== person.id)

  async function handleSaveEdit() {
    if (!editName.trim()) return
    setLoading(true); setError(null)
    const res = await fetch(`/api/people/${person.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: editName, relation: editRelation }),
    })
    setLoading(false)
    if (res.ok) { onSaved(); onClose() }
    else setError('Erreur lors de la sauvegarde.')
  }

  async function handleDelete() {
    setLoading(true); setError(null)
    const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { onSaved(); onClose() }
    else setError('Erreur lors de la suppression.')
  }

  async function handleMerge() {
    if (!mergeTarget) return
    setLoading(true); setError(null)
    const deleteId = keepId === person.id ? mergeTarget.id : person.id
    const res = await fetch('/api/people/merge', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ keepId, deleteId }),
    })
    setLoading(false)
    if (res.ok) { onSaved(); onClose() }
    else setError('Erreur lors de la fusion.')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[360px] max-w-full bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-[#3D2B1A] truncate">{person.name}</p>
            {person.relation && (
              <p className="text-[12px] text-[#8C7565] mt-0.5 truncate">{person.relation}</p>
            )}
          </div>
          <button onClick={onClose} className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none flex-shrink-0 ml-3 transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* ── Vue par défaut ─────────────────────────────────────── */}
          {mode === 'view' && (
            <>
              {person.ai_summary && (
                <section>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
                    Ce qu&apos;Alinéa comprend
                  </p>
                  <p className="text-[13px] text-[#3D2B1A] leading-relaxed italic">{person.ai_summary}</p>
                </section>
              )}

              <div className="flex flex-col gap-2 mt-auto">
                <button
                  onClick={() => setMode('edit')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#E6DAC8] text-[#3D2B1A] rounded-xl text-[13px] hover:border-[#9B5E3A] transition-colors"
                >
                  Modifier le nom ou la relation
                </button>
                {others.length > 0 && (
                  <button
                    onClick={() => setMode('merge')}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#E6DAC8] text-[#3D2B1A] rounded-xl text-[13px] hover:border-[#9B5E3A] transition-colors"
                  >
                    Fusionner avec une autre personne
                  </button>
                )}
                <button
                  onClick={() => setMode('delete')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#EECECE] text-[#CC4444] rounded-xl text-[13px] hover:bg-[#FFF0F0] transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </>
          )}

          {/* ── Mode édition ─────────────────────────────────────── */}
          {mode === 'edit' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide block mb-1.5">
                  Nom
                </label>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                  className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide block mb-1.5">
                  Relation
                </label>
                <input
                  value={editRelation}
                  onChange={e => setEditRelation(e.target.value)}
                  placeholder="ex. père, ami d'enfance, collègue…"
                  className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] placeholder-[#8C7565] outline-none focus:border-[#9B5E3A] transition-colors"
                />
              </div>
              {error && <p className="text-[12px] text-[#CC4444]">{error}</p>}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={loading || !editName.trim()}
                  className="flex-1 px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 hover:bg-[#7A4A2C] transition-colors"
                >
                  {loading ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => setMode('view')}
                  className="px-4 py-2.5 border border-[#E6DAC8] text-[#8C7565] rounded-xl text-[13px] hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* ── Mode fusion ──────────────────────────────────────── */}
          {mode === 'merge' && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-[#3D2B1A]">
                Cette personne est la même que…
              </p>

              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
                {others.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setMergeTarget(p); setKeepId(p.id) }}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors border',
                      mergeTarget?.id === p.id
                        ? 'border-[#9B5E3A] bg-[#FAF6F0] text-[#3D2B1A]'
                        : 'border-[#E6DAC8] text-[#3D2B1A] hover:border-[#9B5E3A]',
                    ].join(' ')}
                  >
                    <span className="font-medium text-[13px]">{p.name}</span>
                    {p.relation && <span className="text-[11px] text-[#8C7565]">{p.relation}</span>}
                  </button>
                ))}
              </div>

              {mergeTarget && (
                <div className="flex flex-col gap-2 pt-2 border-t border-[#F0E8DC]">
                  <p className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide">
                    Quel nom conserver ?
                  </p>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="keep"
                      checked={keepId === mergeTarget.id}
                      onChange={() => setKeepId(mergeTarget.id)}
                      className="accent-[#9B5E3A]"
                    />
                    <span className="text-[13px] text-[#3D2B1A]">{mergeTarget.name}</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="keep"
                      checked={keepId === person.id}
                      onChange={() => setKeepId(person.id)}
                      className="accent-[#9B5E3A]"
                    />
                    <span className="text-[13px] text-[#3D2B1A]">{person.name}</span>
                  </label>
                </div>
              )}

              {error && <p className="text-[12px] text-[#CC4444]">{error}</p>}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleMerge}
                  disabled={loading || !mergeTarget}
                  className="flex-1 px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 hover:bg-[#7A4A2C] transition-colors"
                >
                  {loading ? 'Fusion…' : 'Fusionner'}
                </button>
                <button
                  onClick={() => { setMode('view'); setMergeTarget(null) }}
                  className="px-4 py-2.5 border border-[#E6DAC8] text-[#8C7565] rounded-xl text-[13px] hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* ── Mode suppression ─────────────────────────────────── */}
          {mode === 'delete' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#FFF8F5] border border-[#EECECE] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#3D2B1A]">
                  Supprimer <strong>{person.name}</strong> et toutes ses relations dans ta toile ?
                </p>
                <p className="text-[11px] text-[#8C7565] mt-1">
                  Les alinéas qui mentionnent cette personne ne seront pas affectés.
                </p>
              </div>
              {error && <p className="text-[12px] text-[#CC4444]">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[#CC4444] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 hover:bg-[#AA3333] transition-colors"
                >
                  {loading ? 'Suppression…' : 'Confirmer la suppression'}
                </button>
                <button
                  onClick={() => setMode('view')}
                  className="px-4 py-2.5 border border-[#E6DAC8] text-[#8C7565] rounded-xl text-[13px] hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
