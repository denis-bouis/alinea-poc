'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import CardShell from './CardShell'
import type { Person, PersonRelation } from '@/types/domain'
import type { EntityRef } from '@/components/DetailPanel'

const FamilyTree = dynamic(() => import('@/components/FamilyTree'), { ssr: false })

type Props = {
  people:       Person[]
  relations:    PersonRelation[]
  userName:     string
  visibleIds:   Set<string> | null   // null = pas de filtre focus actif
  collapsed:    boolean
  onToggleCollapse: () => void
  fullscreen:   boolean
  onToggleFullscreen: () => void
  onOpen:       (ref: EntityRef) => void
  onAddLink:    () => void
  onAddFamily:  () => void
}

export default function PersonnesCard({
  people, relations, userName, visibleIds, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen,
  onOpen, onAddLink, onAddFamily,
}: Props) {
  const [view, setView] = useState<'liste' | 'arbre'>('liste')
  const shown = visibleIds ? people.filter(p => visibleIds.has(p.id)) : people

  return (
    <CardShell
      title="Personnes" count={people.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
      fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen}
      headerExtra={
        <div className="flex items-center gap-0.5 bg-[#F2EDE5] rounded-md p-0.5 ml-1">
          {(['liste', 'arbre'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
                    className={['text-[10px] px-2 py-0.5 rounded transition-colors', view === v ? 'bg-white text-[#2C2825] font-medium' : 'text-[#8C8278]'].join(' ')}>
              {v === 'liste' ? 'Liste' : 'Arbre'}
            </button>
          ))}
        </div>
      }
    >
      {view === 'arbre' ? (
        <div className="h-full min-h-[280px]">
          <FamilyTree
            people={shown} relations={relations} userName={userName}
            onPersonClick={p => onOpen({ type: 'person', id: p.id, label: p.name })}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {shown.length === 0 ? (
            <p className="text-[12px] text-[#8C8278] italic px-4 py-3">Aucune personne pour l&apos;instant.</p>
          ) : shown.map(p => (
            <button
              key={p.id}
              onClick={() => onOpen({ type: 'person', id: p.id, label: p.name })}
              className="flex items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[#FAF6F0] transition-colors border-b border-[#F2EDE5] last:border-0"
            >
              <span className="text-[13px] text-[#2C2825] truncate">{p.name}</span>
              <span className="text-[11px] text-[#8C8278] flex-shrink-0">{p.relation}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-[#F2EDE5] flex-shrink-0">
        <button onClick={onAddLink} className="text-[11px] text-[#8C8278] hover:text-[#9B5E3A]">+ Lien</button>
        <button onClick={onAddFamily} className="text-[11px] text-[#8C8278] hover:text-[#9B5E3A]">Famille +</button>
      </div>
    </CardShell>
  )
}
