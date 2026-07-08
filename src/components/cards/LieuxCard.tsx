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
}

export default function LieuxCard({ places, visibleIds, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen, onOpen }: Props) {
  const shown = visibleIds ? places.filter(p => visibleIds.has(p.id)) : places

  return (
    <CardShell title="Lieux" count={places.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
               fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen}>
      <div className="flex flex-col">
        {shown.length === 0 ? (
          <p className="text-[12px] text-[#8C8278] italic px-4 py-3">Aucun lieu pour l&apos;instant.</p>
        ) : shown.map(place => (
          <button
            key={place.id}
            onClick={() => onOpen({ type: 'place', id: place.id, label: place.name })}
            className="flex items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[#FAF6F0] transition-colors border-b border-[#F2EDE5] last:border-0"
          >
            <span className="text-[13px] text-[#2C2825] truncate">{place.name}</span>
            <span className="text-[11px] text-[#8C8278] flex-shrink-0">{[place.region, place.country].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
    </CardShell>
  )
}
