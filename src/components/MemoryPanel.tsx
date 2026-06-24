'use client'

import type { Theme, UserMemory } from '@/types/domain'

type Props = {
  portrait:  UserMemory | null
  themes:    Theme[]
  userName:  string
  onClose:   () => void
}

export default function MemoryPanel({ portrait, themes, userName, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[360px] max-w-full bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0">
          <span className="font-bold text-[15px] text-[#3D2B1A]">Mémoire IA</span>
          <button onClick={onClose} className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">

          {/* Portrait */}
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">Portrait</h3>
            <div className="bg-[#FAF6F0] rounded-xl p-3 space-y-1 text-[13px] text-[#3D2B1A]">
              <p><span className="text-[#8C7565]">Prénom :</span> {userName || '—'}</p>
              {portrait?.birth_year && (
                <p><span className="text-[#8C7565]">Né(e) en :</span> {portrait.birth_year}</p>
              )}
              {portrait?.portrait
                ? <p className="mt-2 text-[12px] leading-relaxed text-[#4A3728] italic">{portrait.portrait}</p>
                : <p className="text-[11px] text-[#8C7565] italic mt-2">Portrait non encore généré.</p>
              }
            </div>
          </section>

          {/* Thèmes */}
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
              Thématiques ({themes.length})
            </h3>
            <div className="flex flex-col gap-2">
              {themes.map(t => (
                <div key={t.id} className="bg-[#FAF6F0] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="font-semibold text-[13px] text-[#3D2B1A]">{t.name}</span>
                    <span className="ml-auto text-[10px] text-[#8C7565] capitalize">{t.maturity}</span>
                  </div>
                  {t.ai_summary
                    ? <p className="text-[12px] text-[#4A3728] leading-relaxed italic">{t.ai_summary}</p>
                    : <p className="text-[11px] text-[#8C7565] italic">Résumé non encore généré.</p>
                  }
                </div>
              ))}
              {themes.length === 0 && (
                <p className="text-[12px] text-[#8C7565] italic">Aucune thématique.</p>
              )}
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
