'use client'

import type { Theme } from '@/types/domain'

const MATURITY_LABEL: Record<string, string> = {
  emerging: 'Naissante',
  active:   'Active',
  major:    'Majeure',
  closed:   'Clôturée',
}

type Props = {
  theme:              Theme
  eventCount:         number
  isHidden:           boolean
  onToggleVisibility: () => void
  onStartChat:        () => void
  onClose:            () => void
}

export default function ThemeDetail({ theme, eventCount, isHidden, onToggleVisibility, onStartChat, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[360px] max-w-full bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: theme.color }} />
            <p className="font-bold text-[15px] text-[#3D2B1A] truncate">{theme.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none flex-shrink-0 ml-3 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Méta */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: theme.color + '22', color: theme.color }}
            >
              {MATURITY_LABEL[theme.maturity] ?? theme.maturity}
            </span>
            <span className="text-[12px] text-[#8C7565]">
              {eventCount} événement{eventCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Synthèse IA */}
          {theme.ai_summary ? (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
                Ce qu&apos;Alinéa comprend
              </p>
              <p className="text-[13px] text-[#3D2B1A] leading-relaxed italic">{theme.ai_summary}</p>
            </section>
          ) : (
            <p className="text-[13px] text-[#8C7565] italic">
              La synthèse de ce fil apparaîtra ici au fil des alinéas.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={onStartChat}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold hover:bg-[#7A4A2C] transition-colors"
            >
              Raconter un souvenir sur ce fil
            </button>
            <button
              onClick={onToggleVisibility}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#E6DAC8] text-[#8C7565] rounded-xl text-[12px] hover:border-[#9B5E3A] hover:text-[#3D2B1A] transition-colors"
            >
              {isHidden ? 'Afficher dans la frise' : 'Masquer dans la frise'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
