'use client'

import { useState } from 'react'
import PersonnesCard from './cards/PersonnesCard'
import LieuxCard from './cards/LieuxCard'
import AlineasCard, { type AlineaListItem } from './cards/AlineasCard'
import type { Person, PersonRelation, Theme, Place } from '@/types/domain'
import type { EntityRef } from '@/components/DetailPanel'

export type FullscreenPanel = 'frise' | 'personnes' | 'lieux' | 'alineas' | null

type Props = {
  people:       Person[]
  relations:    PersonRelation[]
  places:       Place[]
  alineas:      AlineaListItem[]
  themes:       Theme[]
  userName:     string
  visiblePersonIds: Set<string> | null
  visiblePlaceIds:  Set<string> | null
  visibleAlineaIds: Set<string> | null
  highlightAlineaId?: string | null
  fullscreenPanel: FullscreenPanel
  onSetFullscreen: (panel: FullscreenPanel) => void
  onOpen:       (ref: EntityRef) => void
  onFocus:      (ref: EntityRef) => void
  onAddLink:    () => void
  onAddFamily:  () => void
}

export default function FichesColumn({
  people, relations, places, alineas, themes, userName,
  visiblePersonIds, visiblePlaceIds, visibleAlineaIds, highlightAlineaId,
  fullscreenPanel, onSetFullscreen, onOpen, onFocus, onAddLink, onAddFamily,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleFullscreen(key: Exclude<FullscreenPanel, null>) {
    onSetFullscreen(fullscreenPanel === key ? null : key)
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 p-3">
      <PersonnesCard
        people={people} relations={relations} userName={userName} visibleIds={visiblePersonIds}
        collapsed={collapsed.has('personnes')} onToggleCollapse={() => toggleCollapse('personnes')}
        fullscreen={fullscreenPanel === 'personnes'} onToggleFullscreen={() => toggleFullscreen('personnes')}
        onOpen={onOpen} onFocus={onFocus} onAddLink={onAddLink} onAddFamily={onAddFamily}
      />
      <LieuxCard
        places={places} visibleIds={visiblePlaceIds}
        collapsed={collapsed.has('lieux')} onToggleCollapse={() => toggleCollapse('lieux')}
        fullscreen={fullscreenPanel === 'lieux'} onToggleFullscreen={() => toggleFullscreen('lieux')}
        onOpen={onOpen} onFocus={onFocus}
      />
      <AlineasCard
        alineas={alineas} themes={themes} visibleIds={visibleAlineaIds} highlightId={highlightAlineaId}
        collapsed={collapsed.has('alineas')} onToggleCollapse={() => toggleCollapse('alineas')}
        fullscreen={fullscreenPanel === 'alineas'} onToggleFullscreen={() => toggleFullscreen('alineas')}
        onOpen={onOpen} onFocus={onFocus}
      />
    </div>
  )
}
