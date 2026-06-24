'use client'

import type { Theme } from '@/types/domain'

type Props = {
  themes:          Theme[]
  eventCountsByTheme: Record<string, number>
  hiddenThemeIds?: Set<string>
  onThemeClick?:   (theme: Theme) => void
}

const maturityLabel: Record<string, string> = {
  emerging: 'Naissante',
  active:   'Active',
  major:    'Majeure',
  closed:   'Clôturée',
}

export default function ThemesPanel({ themes, eventCountsByTheme, hiddenThemeIds, onThemeClick }: Props) {
  if (!themes.length) {
    return (
      <div className="p-4 text-[13px] text-[#8C7565] italic">
        Tes thématiques apparaîtront ici après l'onboarding.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-3 overflow-y-auto h-full">
      {themes.map(theme => {
        const count  = eventCountsByTheme[theme.id] ?? 0
        const hidden = hiddenThemeIds?.has(theme.id) ?? false
        return (
          <button
            key={theme.id}
            onClick={() => onThemeClick?.(theme)}
            title={onThemeClick ? (hidden ? 'Afficher dans la frise' : 'Masquer dans la frise') : undefined}
            className={['flex flex-col gap-0.5 p-2.5 rounded-lg text-left hover:bg-[#F0E8DC] transition-all', hidden ? 'opacity-35' : ''].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: theme.color }}
              />
              <span className="text-[13px] font-semibold text-[#3D2B1A] leading-tight">
                {theme.name}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-4">
              <span className="text-[10px] text-[#8C7565]">
                {count} événement{count !== 1 ? 's' : ''}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ background: theme.color + '22', color: theme.color }}
              >
                {maturityLabel[theme.maturity] ?? theme.maturity}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
