'use client'

import CardShell from './CardShell'
import type { Place } from '@/types/domain'
import type { EntityRef } from '@/components/DetailPanel'

type Props = {
  places:       Place[]
  visibleIds:   Set<string> | null
  collapsed:    boolean
  onToggleCollapse: () => void
  fullscreen:   boolean
  onToggleFullscreen: () => void
  onOpen:       (ref: EntityRef) => void
  onFocus:      (ref: EntityRef) => void
}

export default function LieuxCard({ places, visibleIds, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen, onOpen, onFocus }: Props) {
  const shown = visibleIds ? places.filter(p => visibleIds.has(p.id)) : places

  return (
    <CardShell title="Lieux" count={shown.length} totalCount={places.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
               fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen}>
      <div className="flex flex-col">
        {shown.length === 0 ? (
          <p className="text-[12px] text-[#8C8278] italic px-4 py-3">
            {places.length > 0 ? 'Aucun lieu pour ce focus.' : 'Aucun lieu pour l’instant.'}
          </p>
        ) : shown.map(place => (
          <div key={place.id} className="group flex items-center border-b border-[#F2EDE5] last:border-0">
            <button
              onClick={() => onOpen({ type: 'place', id: place.id, label: place.name })}
              className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[#FAF6F0] transition-colors"
            >
              <span className="text-[13px] text-[#2C2825] truncate">{place.name}</span>
              <span className="text-[11px] text-[#8C8278] flex-shrink-0">{[place.region, place.country].filter(Boolean).join(' · ')}</span>
            </button>
            <button
              onClick={() => onFocus({ type: 'place', id: place.id, label: place.name })}
              title="Mettre le focus ici"
              className="flex-shrink-0 px-2 text-[#C4BDB6] hover:text-[#9B5E3A] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              🎯
            </button>
          </div>
        ))}
      </div>
    </CardShell>
  )
}
