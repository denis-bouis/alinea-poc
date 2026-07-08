'use client'

import type { Theme, LifePhase } from '@/types/domain'

type Props = {
  themes:            Theme[]
  phases:            LifePhase[]
  selectedThemeIds:  Set<string>
  selectedPhaseIds:  Set<string>
  onToggleTheme:     (id: string) => void
  onTogglePhase:     (id: string) => void
  onReset:           () => void
}

export default function FilterBar({ themes, phases, selectedThemeIds, selectedPhaseIds, onToggleTheme, onTogglePhase, onReset }: Props) {
  const active = selectedThemeIds.size > 0 || selectedPhaseIds.size > 0
  if (themes.length === 0 && phases.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[#E8E2D9] flex-shrink-0 overflow-x-auto">
      {themes.map(t => {
        const on = selectedThemeIds.has(t.id)
        return (
          <button
            key={t.id}
            onClick={() => onToggleTheme(t.id)}
            className={[
              'flex items-center gap-1.5 text-[12px] rounded-full border px-2.5 py-0.5 whitespace-nowrap transition-colors',
              on ? 'border-[#9B5E3A] text-[#2C2825] bg-[#FAF0E4]' : 'border-[#D4CEC6] text-[#8C8278] hover:border-[#9B5E3A]',
            ].join(' ')}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
            {t.name}
          </button>
        )
      })}

      {themes.length > 0 && phases.length > 0 && <div className="w-px h-4 bg-[#E8E2D9] flex-shrink-0 mx-1" />}

      {phases.map(p => {
        const on = selectedPhaseIds.has(p.id)
        return (
          <button
            key={p.id}
            onClick={() => onTogglePhase(p.id)}
            className={[
              'text-[12px] rounded-full border px-2.5 py-0.5 whitespace-nowrap transition-colors',
              on ? 'border-[#9B5E3A] text-[#2C2825] bg-[#FAF0E4]' : 'border-[#D4CEC6] text-[#8C8278] hover:border-[#9B5E3A]',
            ].join(' ')}
          >
            {p.name}
          </button>
        )
      })}

      {active && (
        <button onClick={onReset} className="ml-auto text-[12px] text-[#8C8278] hover:text-[#9B5E3A] whitespace-nowrap flex-shrink-0">
          Tout voir
        </button>
      )}
    </div>
  )
}
