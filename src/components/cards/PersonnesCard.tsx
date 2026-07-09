'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import CardShell from './CardShell'
import type { Person, PersonRelation } from '@/types/domain'
import type { EntityRef } from '@/components/DetailPanel'
import DeceasedIcon from '@/components/DeceasedIcon'

const FamilyTree = dynamic(() => import('@/components/FamilyTree'), { ssr: false })
const RelationsGraph = dynamic(() => import('@/components/RelationsGraph'), { ssr: false })

type Props = {
  people:       Person[]
  relations:    PersonRelation[]
  userName:     string
  selfId:       string | null
  visibleIds:   Set<string> | null   // null = pas de filtre focus actif
  collapsed:    boolean
  onToggleCollapse: () => void
  fullscreen:   boolean
  onToggleFullscreen: () => void
  onOpen:       (ref: EntityRef) => void
  onFocus:      (ref: EntityRef) => void
  onAddLink:    () => void
  onAddFamily:  () => void
}

export default function PersonnesCard({
  people, relations, userName, selfId, visibleIds, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen,
  onOpen, onFocus, onAddLink, onAddFamily,
}: Props) {
  const [view, setView] = useState<'liste' | 'arbre' | 'toile'>('liste')
  const shown = visibleIds ? people.filter(p => visibleIds.has(p.id)) : people

  return (
    <CardShell
      title="Personnes" count={shown.length} totalCount={people.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
      fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen}
      headerExtra={
        <div className="flex items-center gap-0.5 bg-[#F2EDE5] rounded-md p-0.5 ml-1">
          {(['liste', 'arbre', 'toile'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
                    className={['text-[10px] px-2 py-0.5 rounded transition-colors', view === v ? 'bg-white text-[#2C2825] font-medium' : 'text-[#8C8278]'].join(' ')}>
              {v === 'liste' ? 'Liste' : v === 'arbre' ? 'Arbre' : 'Toile'}
            </button>
          ))}
        </div>
      }
    >
      {view === 'arbre' ? (
        <div className="h-full min-h-[280px]">
          <FamilyTree
            people={shown} relations={relations} userName={userName} selfId={selfId}
            onPersonClick={p => onOpen({ type: 'person', id: p.id, label: p.name })}
          />
        </div>
      ) : view === 'toile' ? (
        <div className="h-full min-h-[280px]">
          <RelationsGraph
            people={shown} relations={relations} userName={userName} selfId={selfId}
            onPersonClick={p => onOpen({ type: 'person', id: p.id, label: p.name })}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {shown.length === 0 ? (
            <p className="text-[12px] text-[#8C8278] italic px-4 py-3">
              {people.length > 0 ? 'Aucune personne pour ce focus.' : 'Aucune personne pour l’instant.'}
            </p>
          ) : shown.map(p => (
            <div key={p.id} className="group flex items-center border-b border-[#F2EDE5] last:border-0">
              <button
                onClick={() => onOpen({ type: 'person', id: p.id, label: p.name })}
                className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[#FAF6F0] transition-colors"
              >
                <span className="text-[13px] text-[#2C2825] truncate flex-1 min-w-0">{p.name}</span>
                {p.is_deceased && <DeceasedIcon className="flex-shrink-0" />}
                {p.relation && <span className="text-[11px] text-[#8C8278] flex-shrink-0 max-w-[40%] truncate">{p.relation}</span>}
              </button>
              <button
                onClick={() => onFocus({ type: 'person', id: p.id, label: p.name })}
                title="Mettre le focus ici"
                className="flex-shrink-0 px-2 text-[#C4BDB6] hover:text-[#9B5E3A] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                🎯
              </button>
            </div>
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
