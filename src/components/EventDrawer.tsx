'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LifeEvent, Theme } from '@/types/domain'

type AlineaRow = {
  id: string
  title: string | null
  content: string | null
  status: 'draft' | 'validated'
  sort_order: number
}

type Props = {
  event:        LifeEvent
  themes:       Theme[]
  color?:       string          // couleur de la phase
  phaseName?:   string | null
  onClose:      () => void
  onStartChat?: () => void
}

function excerpt(content: string | null): string {
  if (!content) return ''
  const clean = content.trim().replace(/\s+/g, ' ')
  return clean.length > 88 ? clean.slice(0, 88) + '…' : clean
}

export default function EventDrawer({ event, themes, color = '#9B5E3A', phaseName, onClose, onStartChat }: Props) {
  const [alineas, setAlineas] = useState<AlineaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('alineas')
      .select('id, title, content, status, sort_order')
      .eq('life_event_id', event.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setAlineas((data ?? []) as AlineaRow[])
        setLoading(false)
      })
  }, [event.id])

  const eventThemes = themes.filter(t => event.theme_ids.includes(t.id))

  // État d'un alinéa : ◉ validé · ● brouillon avec contenu · ○ vide
  function glyph(a: AlineaRow): string {
    if (a.status === 'validated') return '◉'
    if (a.content && a.content.trim()) return '●'
    return '○'
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[320px] max-w-full bg-[#FAF8F4] shadow-[-8px_0_24px_rgba(44,40,37,0.10)] z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 flex-shrink-0 gap-3">
          <div>
            <p className="font-serif text-[18px] text-[#2C2825] leading-snug">{event.title}</p>
            <p className="text-[11px] text-[#8C8278] mt-1">
              {event.year}{phaseName ? ` · ${phaseName}` : ''}
            </p>
            {eventThemes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {eventThemes.map(t => (
                  <span key={t.id} className="flex items-center gap-1 text-[11px] text-[#8C8278]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-[#8C8278] hover:text-[#2C2825] text-[18px] leading-none flex-shrink-0 transition-colors">✕</button>
        </div>

        <div className="border-t border-[#E8E2D9] mx-5" />

        {/* Alinéas */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#8C8278] mb-3">
            Alinéas{!loading && ` · ${alineas.length}`}
          </p>

          {loading ? (
            <p className="text-[12px] text-[#8C8278] italic">Chargement…</p>
          ) : alineas.length === 0 ? (
            <p className="text-[12px] text-[#8C8278] italic leading-relaxed">
              Aucun alinéa pour le moment. Commence à raconter ce souvenir.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {alineas.map(a => {
                const hasContent = !!(a.content && a.content.trim())
                return (
                  <div key={a.id} className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] leading-none mt-0.5" style={{ color }}>{glyph(a)}</span>
                      <span className="text-[13px] text-[#2C2825] font-medium flex-1">
                        {a.title ?? <span className="italic text-[#8C8278]">Sans titre</span>}
                      </span>
                    </div>
                    {hasContent ? (
                      <p className="text-[11px] text-[#8C8278] mt-0.5 ml-5 leading-snug line-clamp-2">
                        « {excerpt(a.content)} »
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#C4BDB6] italic mt-0.5 ml-5">aucun contenu</p>
                    )}
                    <a
                      href={`/alinea/${a.id}/edit`}
                      className="self-end text-[11px] mt-1 transition-colors"
                      style={{ color }}
                    >
                      {hasContent ? 'Ouvrir' : 'Écrire'} →
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* + Ajouter */}
        <div className="border-t border-[#E8E2D9] mx-5" />
        <div className="px-5 py-3 flex-shrink-0">
          {onStartChat ? (
            <button
              onClick={() => { onClose(); onStartChat() }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#9B5E3A' }}
            >
              + Ajouter un alinéa
            </button>
          ) : (
            <a
              href={`/alinea/new?life_event=${event.id}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#9B5E3A' }}
            >
              + Ajouter un alinéa
            </a>
          )}
        </div>
      </div>
    </>
  )
}
