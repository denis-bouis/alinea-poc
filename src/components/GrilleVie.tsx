'use client'

import { useMemo } from 'react'
import type { LifeEvent, LifePhase, Theme } from '@/types/domain'
import { phaseColor, withAlpha } from '@/types/domain'

const MARGIN  = 140   // largeur marge phases (label)
const COL_MIN = 160   // largeur min colonne thématique
const SANSFIL = 120   // largeur colonne « sans fil »

type Props = {
  phases:           LifePhase[]
  themes:           Theme[]                    // visibles, ordonnées → colonnes
  events:           LifeEvent[]                // theme_ids peuplés
  alineaCounts:     Record<string, number>     // par life_event_id
  birthYear:        number
  collapsedPhaseIds: Set<string>
  onTogglePhase:    (id: string) => void
  onEventClick:     (e: LifeEvent) => void
}

type Band = {
  key:    string
  phase:  LifePhase | null
  color:  string
  events: LifeEvent[]
}

function eventDate(e: LifeEvent): number {
  return e.year * 10000 + (e.event_month ?? 0) * 100 + (e.event_day ?? 0)
}

export default function GrilleVie({
  phases, themes, events, alineaCounts, birthYear,
  collapsedPhaseIds, onTogglePhase, onEventClick,
}: Props) {

  // ── Répartition des events en bandes (phases) ────────────────────────────
  const bands = useMemo<Band[]>(() => {
    const sorted = [...phases].sort(
      (a, b) => a.sort_order - b.sort_order || (a.year_start ?? 0) - (b.year_start ?? 0),
    )

    // Pas de phases : une seule bande « Ma vie »
    if (sorted.length === 0) {
      return [{
        key: 'all', phase: null, color: phaseColor(0),
        events: [...events].sort((a, b) => eventDate(a) - eventDate(b)),
      }]
    }

    const used = new Set<string>()
    const result: Band[] = sorted.map((phase, i) => {
      const inPhase = events.filter((e) => {
        if (e.life_phase_id) return e.life_phase_id === phase.id
        // sans phase explicite : rattachement par année (impossible si la phase n'est pas datée)
        if (phase.year_start == null) return false
        const end = phase.year_end ?? 9999
        return e.year >= phase.year_start && e.year <= end
      })
      inPhase.forEach((e) => used.add(e.id))
      return {
        key: phase.id, phase, color: phaseColor(i),
        events: inPhase.sort((a, b) => eventDate(a) - eventDate(b)),
      }
    })

    // Events orphelins (aucune phase ne les couvre)
    const orphans = events.filter((e) => !used.has(e.id))
    if (orphans.length > 0) {
      result.push({
        key: 'orphans', phase: null, color: '#C4BDB6',
        events: orphans.sort((a, b) => eventDate(a) - eventDate(b)),
      })
    }
    return result
  }, [phases, events])

  // Template de la zone de contenu (colonnes thématiques + sans fil)
  const contentTemplate =
    `repeat(${themes.length}, minmax(${COL_MIN}px, 1fr)) ${SANSFIL}px`

  // Index colonne d'un event (parmi les thématiques visibles)
  function activeColumns(e: LifeEvent): number[] {
    const cols = themes
      .map((t, i) => (e.theme_ids.includes(t.id) ? i : -1))
      .filter((i) => i >= 0)
    return cols.length > 0 ? cols : [themes.length] // sans fil = dernière colonne
  }

  return (
    <div className="h-full overflow-auto bg-[#FAF8F4]">
      <div className="min-w-max">

        {/* ── En-tête colonnes ─────────────────────────────────────────── */}
        <div className="flex sticky top-0 z-20 bg-[#FAF8F4] border-b border-[#E8E2D9]">
          <div
            className="sticky left-0 z-10 flex-shrink-0 bg-[#FAF8F4] flex items-end px-3 pb-1.5"
            style={{ width: MARGIN }}
          >
            <span className="text-[10px] tracking-[0.12em] uppercase text-[#C4BDB6]">
              Phases
            </span>
          </div>
          <div className="flex-1 grid" style={{ gridTemplateColumns: contentTemplate }}>
            {themes.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 px-2 pb-1.5 pt-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: t.color }}
                />
                <span className="text-[11px] tracking-[0.06em] uppercase text-[#8C8278] truncate">
                  {t.name}
                </span>
              </div>
            ))}
            <div className="flex items-center px-2 pb-1.5 pt-2">
              <span className="text-[11px] tracking-[0.06em] uppercase text-[#C4BDB6]">
                sans fil
              </span>
            </div>
          </div>
        </div>

        {/* ── Ancre de naissance ───────────────────────────────────────── */}
        <div className="flex items-center" style={{ paddingLeft: MARGIN }}>
          <span className="text-[10px] text-[#C4BDB6] py-1">★ Naissance · {birthYear}</span>
        </div>

        {/* ── Bandes de phases ─────────────────────────────────────────── */}
        {bands.map((band) => {
          const collapsed = band.phase ? collapsedPhaseIds.has(band.phase.id) : false
          const wash      = withAlpha(band.color, 0.06)
          const yearLabel = band.phase
            ? band.phase.year_start == null
              ? 'à dater'
              : `${band.phase.year_start} – ${band.phase.year_end ?? ''}`
            : band.key === 'orphans' ? 'hors période' : ''

          return (
            <div
              key={band.key}
              className="flex border-b border-dashed border-[#E8E2D9]"
              style={{ background: wash }}
            >
              {/* Label phase (marge gauche, collante) */}
              <div
                className="sticky left-0 z-10 flex-shrink-0 flex flex-col justify-center px-3 py-3"
                style={{ width: MARGIN, background: wash, backdropFilter: 'none' }}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[11px] tracking-[0.08em] uppercase text-[#2C2825] font-medium leading-tight">
                    {band.phase?.name ?? (band.key === 'orphans' ? 'Hors période' : 'Ma vie')}
                  </span>
                  {band.phase && (
                    <button
                      onClick={() => onTogglePhase(band.phase!.id)}
                      title={collapsed ? 'Déplier' : 'Replier'}
                      className="text-[#8C8278] hover:text-[#2C2825] text-[11px] leading-none"
                    >
                      {collapsed ? '▸' : '▾'}
                    </button>
                  )}
                </div>
                {yearLabel && (
                  <span className="text-[10px] text-[#8C8278] mt-0.5">{yearLabel}</span>
                )}
              </div>

              {/* Contenu : colonnes thématiques */}
              <div className="flex-1 py-3">
                {collapsed ? (
                  <div className="h-6 flex items-center px-2">
                    <span className="text-[10px] text-[#8C8278] italic">
                      {band.events.length} moment{band.events.length > 1 ? 's' : ''} replié{band.events.length > 1 ? 's' : ''}
                    </span>
                  </div>
                ) : band.events.length === 0 ? (
                  <div className="h-8 flex items-center px-2">
                    <span className="text-[11px] text-[#C4BDB6] italic">—</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {band.events.map((e) => {
                      const cols     = activeColumns(e)
                      const minC     = Math.min(...cols)
                      const maxC     = Math.max(...cols)
                      const count    = alineaCounts[e.id] ?? 0
                      const hasContent = e.documented || count > 0 || e.status !== 'undocumented'
                      const evThemes = themes.filter((t) => e.theme_ids.includes(t.id))

                      return (
                        <div
                          key={e.id}
                          className="grid items-center"
                          style={{ gridTemplateColumns: contentTemplate, minHeight: 34 }}
                        >
                          {/* Connecteur multi-thématiques */}
                          {cols.length > 1 && (
                            <div
                              style={{
                                gridColumn: `${minC + 1} / ${maxC + 2}`,
                                gridRow: 1,
                                borderTop: `1px dotted ${band.color}`,
                                alignSelf: 'center',
                                height: 0,
                                marginLeft: 28,
                                marginRight: 28,
                              }}
                            />
                          )}

                          {/* Pastilles */}
                          {cols.map((c) => (
                            <Dot
                              key={c}
                              col={c}
                              color={band.color}
                              pivot={e.is_pivot}
                              hasContent={hasContent}
                              title={e.title}
                              year={e.year}
                              themesLabel={evThemes.map((t) => t.name).join(' · ') || 'sans fil'}
                              count={count}
                              onClick={() => onEventClick(e)}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div className="h-12" />
      </div>
    </div>
  )
}

// ── Pastille d'événement ────────────────────────────────────────────────────
function Dot({
  col, color, pivot, hasContent, title, year, themesLabel, count, onClick,
}: {
  col: number
  color: string
  pivot: boolean
  hasContent: boolean
  title: string
  year: number
  themesLabel: string
  count: number
  onClick: () => void
}) {
  const base: React.CSSProperties = {
    gridColumn: col + 1,
    gridRow: 1,
    width: 18,
    height: 18,
    borderRadius: '50%',
    justifySelf: 'center',
    cursor: 'pointer',
  }

  let dotStyle: React.CSSProperties
  if (pivot) {
    dotStyle = { ...base, background: color, boxShadow: 'inset 0 0 0 2px #FAF8F4' }
  } else if (hasContent) {
    dotStyle = { ...base, background: color }
  } else {
    dotStyle = { ...base, background: 'transparent', border: `1.5px solid ${withAlpha(color, 0.5)}` }
  }

  return (
    <div className="grille-event z-10" style={{ gridColumn: col + 1, gridRow: 1, justifySelf: 'center' }}>
      <button onClick={onClick} style={dotStyle} aria-label={title} />
      {/* Tooltip au survol */}
      <div
        className="grille-tooltip absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-[220px] bg-white rounded-md shadow-md border border-[#E8E2D9] px-3 py-2"
      >
        <p className="font-serif text-[13px] text-[#2C2825] leading-snug">{title}</p>
        <p className="text-[11px] text-[#8C8278] mt-0.5">{year} · {themesLabel}</p>
        <p className="text-[11px] text-[#8C8278]">
          {count > 0 ? `${count} alinéa${count > 1 ? 's' : ''}` : 'aucun contenu'}
        </p>
      </div>
    </div>
  )
}
