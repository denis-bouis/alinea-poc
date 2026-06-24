'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LifeEvent, Theme } from '@/types/domain'

type AlineaRow = { id: string; title: string | null; created_at: string }

type Props = {
  event:        LifeEvent
  themes:       Theme[]
  onClose:      () => void
  onStartChat?: () => void
}

export default function EventDrawer({ event, themes, onClose, onStartChat }: Props) {
  const [alineas, setAlineas] = useState<AlineaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('alineas')
      .select('id, title, created_at')
      .eq('event_year', event.year)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAlineas(data ?? [])
        setLoading(false)
      })
  }, [event.year])

  const eventThemes = themes.filter(t => event.theme_ids.includes(t.id))

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[380px] max-w-full bg-white shadow-xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#E6DAC8] flex-shrink-0 gap-3">
          <div>
            <p className="font-bold text-[15px] text-[#3D2B1A] leading-snug">{event.title}</p>
            <p className="text-[12px] text-[#8C7565] mt-0.5">{event.year}</p>
          </div>
          <button onClick={onClose} className="text-[#8C7565] hover:text-[#3D2B1A] text-[20px] leading-none flex-shrink-0 transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Thèmes liés */}
          {eventThemes.length > 0 && (
            <section>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">Thèmes</p>
              <div className="flex flex-wrap gap-1.5">
                {eventThemes.map(t => (
                  <span key={t.id} className="flex items-center gap-1.5 text-[12px] text-[#3D2B1A] bg-[#FAF6F0] border border-[#E6DAC8] rounded-full px-2.5 py-0.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Alinéas liés */}
          <section>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565] mb-2">
              Alinéas{!loading && ` (${alineas.length})`}
            </p>
            {loading ? (
              <p className="text-[12px] text-[#8C7565] italic">Chargement…</p>
            ) : alineas.length === 0 ? (
              <p className="text-[12px] text-[#8C7565] italic">Aucun alinéa pour cette période.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {alineas.map(a => (
                  <a
                    key={a.id}
                    href={`/alinea/${a.id}`}
                    className="block bg-[#FAF6F0] rounded-xl px-3 py-2.5 hover:bg-[#F0E8DC] transition-colors"
                  >
                    <p className="text-[13px] text-[#3D2B1A] font-medium">
                      {a.title ?? <span className="italic text-[#8C7565]">Sans titre</span>}
                    </p>
                    <p className="text-[11px] text-[#8C7565] mt-0.5">
                      {new Date(a.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* CTA documenter */}
          {onStartChat ? (
            <button
              onClick={() => { onClose(); onStartChat() }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold hover:bg-[#7A4A2C] transition-colors w-full"
            >
              + Raconter cet événement
            </button>
          ) : (
            <a
              href={`/alinea/new?event_year=${event.year}`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#9B5E3A] text-white rounded-xl text-[13px] font-semibold hover:bg-[#7A4A2C] transition-colors"
            >
              + Documenter cet événement
            </a>
          )}
        </div>
      </div>
    </>
  )
}
