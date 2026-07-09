'use client'

import { useMemo } from 'react'
import type { LifeEvent, LifePhase, Theme } from '@/types/domain'
import { phaseColor, withAlpha } from '@/types/domain'
import PivotIcon from './PivotIcon'

type Props = {
  phases:            LifePhase[]
  themes:            Theme[]                    // toutes (filtrage appliqué en amont sur `events`)
  events:            LifeEvent[]                // theme_ids peuplés, déjà filtrés (thématiques/phases/focus)
  birthYear:         number
  collapsedPhaseIds: Set<string>
  onTogglePhase:     (id: string) => void
  onEventClick:      (e: LifeEvent) => void
  onEventFocus:      (e: LifeEvent) => void
  fullscreen?:       boolean
}

type BandEvent = {
  event:    LifeEvent
  // true = rattaché par recoupement de date (fallback d'affichage), pas par un
  // life_phase_id explicite — distinction affichée pour ne pas laisser croire
  // à un rattachement éditorial voulu (cf. remarque de test 13b).
  inferred: boolean
}

type Band = {
  key:    string
  phase:  LifePhase | null
  color:  string
  current: boolean   // phase en cours (pas de borne de fin) — affichée en haut
  events: BandEvent[]
}

// Les événements sans année (à dater) sont triés en tête, aux côtés des plus
// récents — pas de position "vraie" possible sans date, autant les garder visibles.
function eventDate(e: LifeEvent): number {
  if (e.year == null) return Infinity
  return e.year * 10000 + (e.event_month ?? 0) * 100 + (e.event_day ?? 0)
}

function formatEventYear(e: LifeEvent): string {
  if (e.year == null) return 'à dater'
  if (e.year_end != null && e.year_end !== e.year) return `${e.year}–${e.year_end}`
  return String(e.year)
}

export default function FriseVerticale({
  phases, themes, events, birthYear, collapsedPhaseIds, onTogglePhase, onEventClick, onEventFocus, fullscreen = false,
}: Props) {

  // Un événement sans année n'est pas datable comme antérieur à la naissance —
  // il reste dans la vie "vécue" (affiché, plutôt que silencieusement écarté).
  const vecue    = useMemo(() => events.filter(e => e.year == null || e.year >= birthYear), [events, birthYear])
  const transmise = useMemo(
    () => [...events.filter(e => e.year != null && e.year < birthYear)].sort((a, b) => eventDate(b) - eventDate(a)),
    [events, birthYear],
  )

  // ── Bandes de phases — vie vécue, présent en haut ────────────────────────
  const bands = useMemo<Band[]>(() => {
    const sorted = [...phases].sort(
      (a, b) => (b.year_start ?? 0) - (a.year_start ?? 0) || b.sort_order - a.sort_order,
    )

    if (sorted.length === 0) {
      return [{
        key: 'all', phase: null, color: phaseColor(0), current: true,
        events: [...vecue].sort((a, b) => eventDate(b) - eventDate(a)).map(event => ({ event, inferred: false })),
      }]
    }

    const used = new Set<string>()
    const result: Band[] = sorted.map((phase, i) => {
      const inPhase = vecue
        .filter((e) => {
          if (e.life_phase_id) return e.life_phase_id === phase.id
          // Sans année, aucun recoupement de date possible — l'événement ne
          // peut rejoindre une bande que via un rattachement explicite.
          if (e.year == null || phase.year_start == null) return false
          const end = phase.year_end ?? 9999
          return e.year >= phase.year_start && e.year <= end
        })
        .map(event => ({ event, inferred: event.life_phase_id !== phase.id }))
      inPhase.forEach(({ event }) => used.add(event.id))
      return {
        key: phase.id, phase, color: phaseColor(phases.indexOf(phase)), current: phase.year_end == null,
        events: inPhase.sort((a, b) => eventDate(b.event) - eventDate(a.event)),
      }
    })

    const orphans = vecue.filter((e) => !used.has(e.id))
    if (orphans.length > 0) {
      result.unshift({
        key: 'orphans', phase: null, color: '#C4BDB6', current: true,
        events: orphans.sort((a, b) => eventDate(b) - eventDate(a)).map(event => ({ event, inferred: false })),
      })
    }
    return result
  }, [phases, vecue])

  function eventThemeColors(e: LifeEvent): { primary: string | null; secondary: string | null } {
    const matched = themes.filter(t => e.theme_ids.includes(t.id))
    return { primary: matched[0]?.color ?? null, secondary: matched[1]?.color ?? null }
  }

  const containerClass = fullscreen
    ? 'h-full overflow-x-auto overflow-y-hidden bg-[#FAF8F4] flex items-stretch gap-0'
    : 'h-full overflow-y-auto bg-[#FAF8F4]'

  function renderBand(band: Band, diamond: boolean) {
    const collapsed = band.phase ? collapsedPhaseIds.has(band.phase.id) : false
    const wash = withAlpha(band.color, diamond ? 0.03 : 0.06)
    const yearLabel = band.phase
      ? band.phase.year_start == null ? 'à dater' : `${band.phase.year_start}–${band.phase.year_end ?? '…'}`
      : band.key === 'orphans' ? 'hors période' : ''

    return (
      <div key={band.key} className="border-b border-dashed border-[#E8E2D9]" style={{ background: wash }}>
        <div className="flex items-center gap-1.5 px-3 py-1.5 sticky top-0 z-10" style={{ background: wash }}>
          {band.phase && !diamond && (
            <button onClick={() => onTogglePhase(band.phase!.id)} className="text-[#8C8278] hover:text-[#2C2825] text-[10px] leading-none">
              {collapsed ? '▸' : '▾'}
            </button>
          )}
          <span className="text-[11px] tracking-[0.06em] uppercase text-[#2C2825] font-medium truncate">
            {band.phase?.name ?? (band.key === 'orphans' ? 'Hors période' : 'Ma vie')}
          </span>
          {yearLabel && <span className="text-[10px] text-[#8C8278] ml-auto flex-shrink-0">{yearLabel}</span>}
        </div>

        {collapsed ? (
          <div className="h-6 flex items-center px-3">
            <span className="text-[10px] text-[#8C8278] italic">
              {band.events.length} moment{band.events.length > 1 ? 's' : ''} replié{band.events.length > 1 ? 's' : ''}
            </span>
          </div>
        ) : band.events.length === 0 ? (
          <div className="h-5 flex items-center px-3">
            <span className="text-[11px] text-[#C4BDB6] italic">—</span>
          </div>
        ) : (
          <div className="flex flex-col py-1.5 pl-3 pr-3 relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#E0D8CC]" />
            {band.events.map(({ event: e, inferred }) => (
              <EventRow key={e.id} event={e} diamond={diamond} inferred={inferred} {...eventThemeColors(e)} onClick={() => onEventClick(e)} onFocus={() => onEventFocus(e)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const vecueBands = fullscreen
    ? bands.map(b => <div key={b.key} className="flex-shrink-0 w-[220px] border-r border-[#E8E2D9] flex flex-col">{renderBand(b, false)}</div>)
    : bands.map(b => renderBand(b, false))

  return (
    <div className={containerClass}>
      <div className={fullscreen ? 'flex' : ''}>
        {!fullscreen && vecueBands}
        {fullscreen && <div className="flex">{vecueBands}</div>}

        {/* Ancre de naissance */}
        <div className={fullscreen ? 'flex-shrink-0 w-full border-t border-[#D4CEC6]' : ''}>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[13px]" style={{ color: '#C99A3E' }}>★</span>
            <span className="text-[10px] text-[#8C8278]">Naissance · {birthYear}</span>
          </div>
        </div>

        {/* Zone pré-naissance — mémoire transmise */}
        {transmise.length > 0 && (
          <div
            className="pl-3 pr-3 py-1.5 relative"
            style={{
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(44,40,37,0.05) 0 6px, transparent 6px 12px)',
            }}
          >
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#E0D8CC]" />
            <p className="text-[10px] tracking-[0.06em] uppercase text-[#8C8278] mb-1 pl-6">Mémoire transmise</p>
            {transmise.map(e => (
              <EventRow key={e.id} event={e} diamond inferred={false} {...eventThemeColors(e)} onClick={() => onEventClick(e)} onFocus={() => onEventFocus(e)} />
            ))}
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  )
}

function EventRow({
  event, diamond, inferred, primary, secondary, onClick, onFocus,
}: {
  event: LifeEvent
  diamond: boolean
  inferred: boolean
  primary: string | null
  secondary: string | null
  onClick: () => void
  onFocus: () => void
}) {
  const color = primary ?? '#9B5E3A'
  const shapeClass = diamond ? 'rotate-45 rounded-[3px]' : 'rounded-full'

  let dotStyle: React.CSSProperties = { width: 13, height: 13 }
  if (event.status === 'validated') {
    dotStyle = { ...dotStyle, background: color, boxShadow: `0 0 0 2px #FAF8F4, 0 0 0 3px ${color}` }
  } else if (event.status === 'draft') {
    dotStyle = { ...dotStyle, background: withAlpha(color, 0.6) }
  } else {
    dotStyle = { ...dotStyle, background: 'transparent', border: `1.5px solid ${withAlpha(color, 0.5)}` }
  }

  return (
    <div className="group flex items-center gap-1 w-full rounded-md hover:bg-black/[0.02] transition-colors">
      <button
        onClick={onClick}
        title={inferred ? 'Classé ici par recoupement de date — pas rattaché explicitement à cette phase' : undefined}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left py-1"
      >
        <span className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 18 }}>
          <span className={shapeClass} style={dotStyle} />
          {secondary && (
            <span
              className="absolute rounded-full"
              style={{ width: 5, height: 5, background: secondary, right: -1, bottom: -1, boxShadow: '0 0 0 1.5px #FAF8F4' }}
            />
          )}
          {event.is_pivot && <PivotIcon className="absolute -top-1.5 -left-1 text-[9px] leading-none" />}
        </span>
        <span className="text-[13px] text-[#2C2825] truncate flex-1">{event.title}</span>
        <span className={['text-[10px] flex-shrink-0', (inferred || event.year == null) ? 'text-[#C4BDB6] italic' : 'text-[#8C8278]'].join(' ')}>
          {inferred && event.year != null ? '~' : ''}{formatEventYear(event)}
        </span>
      </button>
      <button
        onClick={onFocus}
        title="Mettre le focus ici"
        className="flex-shrink-0 px-1.5 text-[#C4BDB6] hover:text-[#9B5E3A] opacity-0 group-hover:opacity-100 transition-opacity"
      >
        🎯
      </button>
    </div>
  )
}
