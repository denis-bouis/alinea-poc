'use client'

import { useState } from 'react'
import type { Person } from '@/types/domain'

type ChildEntry = { personId: string; linkType: 'biological' | 'adoptive' }

type Props = {
  people: Person[]
  onClose: () => void
  onSaved: () => void
}

const UNION_TYPES = [
  { value: 'married', label: 'Marié(s)' },
  { value: 'civil_union', label: 'Pacsé(s)' },
  { value: 'cohabiting', label: 'Concubin(s)' },
  { value: 'unknown', label: 'Inconnu' },
] as const

export default function FamilyUnitEditor({ people, onClose, onSaved }: Props) {
  const [parent1Id, setParent1Id] = useState<string>('')
  const [parent2Id, setParent2Id] = useState<string>('')
  const [unionType, setUnionType] = useState<'married' | 'civil_union' | 'cohabiting' | 'unknown'>('unknown')
  const [children, setChildren] = useState<ChildEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addChild() {
    setChildren(prev => [...prev, { personId: '', linkType: 'biological' }])
  }

  function removeChild(idx: number) {
    setChildren(prev => prev.filter((_, i) => i !== idx))
  }

  function updateChild(idx: number, field: keyof ChildEntry, value: string) {
    setChildren(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  async function handleSubmit() {
    const parents = [parent1Id, parent2Id].filter(Boolean)
    const validChildren = children.filter(c => c.personId)

    if (parents.length === 0 && validChildren.length === 0) {
      setError('Ajoutez au moins un parent ou un enfant.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/people/family-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_1_id: parent1Id || null,
        parent_2_id: parent2Id || null,
        union_type: unionType,
        children: validChildren.map(c => ({
          person_id: c.personId,
          link_type: c.linkType,
        })),
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erreur lors de la création.')
      return
    }

    // Fire-and-forget: refresh summaries for all involved people
    const allIds = [...new Set([
      ...(parent1Id ? [parent1Id] : []),
      ...(parent2Id ? [parent2Id] : []),
      ...validChildren.map(c => c.personId),
    ])]
    allIds.forEach(pid => {
      fetch(`/api/people/${pid}/refresh-summary`, { method: 'POST' }).catch(() => {})
    })

    onSaved()
  }

  // For the parent selects, exclude each other
  const parent1Options = people.filter(p => p.id !== parent2Id)
  const parent2Options = people.filter(p => p.id !== parent1Id)

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[100]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[400px] max-w-full bg-white shadow-xl z-[110] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0">
          <div>
            <p className="font-bold text-[15px] text-[#3D2B1A]">Cellule familiale</p>
            <p className="text-[12px] text-[#8C7565] mt-0.5">Déclarer parents et enfants</p>
          </div>
          <button onClick={onClose} className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none ml-3 transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Parents */}
          <section>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
              Parents
            </p>
            <div className="flex flex-col gap-2">
              <select
                value={parent1Id}
                onChange={e => setParent1Id(e.target.value)}
                className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
              >
                <option value="">Parent 1 (facultatif)</option>
                {parent1Options.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={parent2Id}
                onChange={e => setParent2Id(e.target.value)}
                className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
              >
                <option value="">Parent 2 (facultatif)</option>
                {parent2Options.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Union type */}
          {(parent1Id || parent2Id) && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
                Type d&apos;union
              </p>
              <div className="flex flex-wrap gap-2">
                {UNION_TYPES.map(ut => (
                  <label key={ut.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="unionType"
                      value={ut.value}
                      checked={unionType === ut.value}
                      onChange={() => setUnionType(ut.value)}
                      className="accent-[#9B5E3A]"
                    />
                    <span className="text-[13px] text-[#3D2B1A]">{ut.label}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Children */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
                Enfants
              </p>
              <button
                onClick={addChild}
                className="text-[11px] text-[#9B5E3A] hover:text-[#7A4A2C] transition-colors"
              >
                + Ajouter
              </button>
            </div>

            {children.length === 0 && (
              <p className="text-[12px] text-[#8C7565] italic">Aucun enfant ajouté.</p>
            )}

            <div className="flex flex-col gap-2">
              {children.map((child, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 border border-[#E6DAC8] rounded-xl">
                  <select
                    value={child.personId}
                    onChange={e => updateChild(idx, 'personId', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-[#E6DAC8] rounded-lg text-[13px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
                  >
                    <option value="">Choisir…</option>
                    {people.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={child.linkType}
                    onChange={e => updateChild(idx, 'linkType', e.target.value)}
                    className="px-2 py-1.5 border border-[#E6DAC8] rounded-lg text-[12px] text-[#8C7565] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
                  >
                    <option value="biological">Bio.</option>
                    <option value="adoptive">Adoptif</option>
                  </select>
                  <button
                    onClick={() => removeChild(idx)}
                    className="text-[#CC4444] hover:text-[#AA3333] text-[16px] leading-none transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error && <p className="text-[12px] text-[#CC4444]">{error}</p>}

          <div className="flex gap-2 mt-auto">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 hover:bg-[#7A4A2C] transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-[#E6DAC8] text-[#8C7565] rounded-xl text-[13px] hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
            >
              Annuler
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
