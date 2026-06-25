'use client'

import { useState } from 'react'
import type { Person, PeopleRelationType } from '@/types/domain'
import { RELATION_TYPE_LABEL } from '@/types/domain'

type Props = {
  people: Person[]
  personA?: Person
  onClose: () => void
  onSaved: () => void
}

const RELATION_TYPES: PeopleRelationType[] = [
  'parent_of',
  'child_of',
  'sibling_of',
  'partner_of',
  'friend_of',
  'colleague_of',
  'mentor_of',
]

export default function LinkEditor({ people, personA: initialPersonA, onClose, onSaved }: Props) {
  const [personAId, setPersonAId] = useState<string>(initialPersonA?.id ?? '')
  const [personBId, setPersonBId] = useState<string>('')
  const [relationType, setRelationType] = useState<PeopleRelationType>('friend_of')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!personAId || !personBId || !relationType) return
    if (personAId === personBId) {
      setError('Les deux personnes doivent être différentes.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/people/relations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_a_id: personAId, person_b_id: personBId, relation_type: relationType }),
    })

    setLoading(false)

    if (!res.ok) {
      setError('Erreur lors de la création du lien.')
      return
    }

    // Fire-and-forget: refresh summaries for both people
    fetch(`/api/people/${personAId}/refresh-summary`, { method: 'POST' }).catch(() => {})
    fetch(`/api/people/${personBId}/refresh-summary`, { method: 'POST' }).catch(() => {})

    onSaved()
  }

  const personAName = people.find(p => p.id === personAId)?.name ?? ''
  const personBName = people.find(p => p.id === personBId)?.name ?? ''

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[380px] max-w-full bg-white shadow-xl z-[70] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0">
          <div>
            <p className="font-bold text-[15px] text-[#3D2B1A]">Déclarer un lien</p>
            <p className="text-[12px] text-[#8C7565] mt-0.5">Relation entre deux personnes</p>
          </div>
          <button onClick={onClose} className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none ml-3 transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Person A */}
          <div>
            <label className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide block mb-1.5">
              De
            </label>
            <select
              value={personAId}
              onChange={e => setPersonAId(e.target.value)}
              className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
            >
              <option value="">Choisir une personne…</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Relation type */}
          <div>
            <label className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide block mb-2">
              Relation
            </label>
            <div className="flex flex-col gap-1.5">
              {RELATION_TYPES.map(type => (
                <label key={type} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="relationType"
                    value={type}
                    checked={relationType === type}
                    onChange={() => setRelationType(type)}
                    className="accent-[#9B5E3A]"
                  />
                  <span className="text-[13px] text-[#3D2B1A]">{RELATION_TYPE_LABEL[type]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Person B */}
          <div>
            <label className="text-[11px] font-semibold text-[#8C7565] uppercase tracking-wide block mb-1.5">
              Vers
            </label>
            <select
              value={personBId}
              onChange={e => setPersonBId(e.target.value)}
              className="w-full px-3 py-2 border border-[#E6DAC8] rounded-xl text-[14px] text-[#3D2B1A] outline-none focus:border-[#9B5E3A] transition-colors bg-white"
            >
              <option value="">Choisir une personne…</option>
              {people.filter(p => p.id !== personAId).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {personAId && personBId && (
            <div className="bg-[#FAF6F0] border border-[#E6DAC8] rounded-xl px-4 py-3">
              <p className="text-[13px] text-[#3D2B1A]">
                <strong>{personAName}</strong>
                {' '}est{' '}
                <span className="text-[#9B5E3A] font-medium">{RELATION_TYPE_LABEL[relationType]}</span>
                {' '}
                <strong>{personBName}</strong>
              </p>
            </div>
          )}

          {error && <p className="text-[12px] text-[#CC4444]">{error}</p>}

          <div className="flex gap-2 mt-auto">
            <button
              onClick={handleSubmit}
              disabled={loading || !personAId || !personBId}
              className="flex-1 px-4 py-2.5 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 hover:bg-[#7A4A2C] transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer le lien'}
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
