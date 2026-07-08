'use client'

import CardShell from './CardShell'
import type { Theme } from '@/types/domain'
import type { EntityRef } from '@/components/DetailPanel'

export type AlineaListItem = {
  id: string
  title: string | null
  status: 'seed' | 'draft' | 'validated'
  approximate_date: string | null
  theme_ids: string[]
  life_event_id: string | null
}

type Props = {
  alineas:      AlineaListItem[]
  themes:       Theme[]
  visibleIds:   Set<string> | null
  highlightId?: string | null
  collapsed:    boolean
  onToggleCollapse: () => void
  fullscreen:   boolean
  onToggleFullscreen: () => void
  onOpen:       (ref: EntityRef) => void
}

const STATUS_LABEL: Record<AlineaListItem['status'], string> = {
  seed: 'amorce', draft: 'brouillon', validated: 'validé',
}

export default function AlineasCard({
  alineas, themes, visibleIds, highlightId, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen, onOpen,
}: Props) {
  const shown = visibleIds ? alineas.filter(a => visibleIds.has(a.id)) : alineas

  return (
    <CardShell title="Alinéas" count={alineas.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
               fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen}>
      <div className="flex flex-col">
        {shown.length === 0 ? (
          <p className="text-[12px] text-[#8C8278] italic px-4 py-3">Aucun alinéa pour l&apos;instant.</p>
        ) : shown.map(a => {
          const color = themes.find(t => a.theme_ids.includes(t.id))?.color ?? '#C4BDB6'
          return (
            <button
              key={a.id}
              onClick={() => onOpen({ type: 'alinea', id: a.id, label: a.title ?? 'Sans titre' })}
              className={[
                'flex items-center justify-between gap-2 pl-3 pr-4 py-2 text-left hover:bg-[#FAF6F0] transition-colors border-b border-[#F2EDE5] last:border-0 border-l-[3px]',
                a.id === highlightId ? 'bg-[#FAF0E4]' : '',
              ].join(' ')}
              style={{ borderLeftColor: color }}
            >
              <span className="text-[13px] text-[#2C2825] truncate">{a.title ?? 'Sans titre'}</span>
              <span className="text-[11px] text-[#8C8278] flex-shrink-0">{STATUS_LABEL[a.status]}</span>
            </button>
          )
        })}
      </div>
    </CardShell>
  )
}
