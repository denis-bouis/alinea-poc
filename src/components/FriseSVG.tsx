'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { Theme, LifeEvent } from '@/types/domain'

const YEAR_MIN  = 1930
const YEAR_MAX  = 2030
const FM        = { left: 148, right: 28, top: 18, bottom: 26 }
const BAND_H    = 34
const BAND_GAP  = 8
const EVENT_R   = 7

type Props = {
  themes: Theme[]
  events: LifeEvent[]
  birthYear: number
  onEventClick?: (event: LifeEvent) => void
}

export default function FriseSVG({ themes, events, birthYear, onEventClick }: Props) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const zoomRef  = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const stateRef = useRef({ k: 1, x: 0 })
  const [period, setPeriod] = useState('')

  useEffect(() => {
    if (!svgRef.current || !themes.length) return
    const svg = svgRef.current

    // Nettoyer et initialiser le zoom une seule fois
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        stateRef.current = { k: event.transform.k, x: event.transform.x }
        render()
        updatePeriod(event.transform.k, event.transform.x, svg.clientWidth)
      })

    zoomRef.current = zoom
    d3.select(svg).call(zoom)
    render()

    function updatePeriod(k: number, tx: number, W: number) {
      const CW    = W - FM.left - FM.right
      const range = YEAR_MAX - YEAR_MIN
      if (k <= 1.02) { setPeriod(''); return }
      const yMin = Math.max(YEAR_MIN, Math.round(YEAR_MIN - tx * range / (CW * k)))
      const yMax = Math.min(YEAR_MAX, Math.round(YEAR_MIN + (CW - tx) * range / (CW * k)))
      setPeriod(`${yMin} – ${yMax}`)
    }

    return () => { d3.select(svg).on('.zoom', null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themes.length, events.length, birthYear])

  // Redessiner quand les données changent
  useEffect(() => { render() }, [themes, events, birthYear]) // eslint-disable-line react-hooks/exhaustive-deps

  function render() {
    const svgEl = svgRef.current
    if (!svgEl || !themes.length) return

    const sel = d3.select(svgEl)
    sel.selectAll('*').remove()

    const W   = svgEl.clientWidth || 800
    const CW  = W - FM.left - FM.right
    const { k: zoomK, x: zoomTx } = stateRef.current
    const axY = FM.top + themes.length * (BAND_H + BAND_GAP) - BAND_GAP + 14

    function yearX(y: number) {
      return FM.left + ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * CW) * zoomK + zoomTx
    }

    // ── Defs ─────────────────────────────────────────────────────────────
    const defs = sel.append('defs')

    defs.append('clipPath').attr('id', 'frise-clip')
      .append('rect').attr('x', FM.left).attr('y', 0)
      .attr('width', CW).attr('height', axY + 20)

    const hatch = defs.append('pattern')
      .attr('id', 'frise-hatch').attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 7).attr('height', 7)
      .attr('patternTransform', 'rotate(45)')
    hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 7)
      .attr('stroke', '#AAAAAA').attr('stroke-width', 1)

    // ── Groupe fixe (labels, fonds de bande) ─────────────────────────────
    const fixedG = sel.append('g')

    fixedG.append('line')
      .attr('x1', FM.left).attr('x2', W - FM.right)
      .attr('y1', axY - 4).attr('y2', axY - 4)
      .attr('stroke', '#E8E8E3').attr('stroke-width', 1)

    themes.forEach((theme, i) => {
      const bY = FM.top + i * (BAND_H + BAND_GAP)

      fixedG.append('rect')
        .attr('x', FM.left).attr('y', bY)
        .attr('width', CW).attr('height', BAND_H)
        .attr('rx', 4).attr('fill', theme.color).attr('opacity', 0.09)

      fixedG.append('line')
        .attr('x1', FM.left).attr('x2', W - FM.right)
        .attr('y1', bY + BAND_H / 2).attr('y2', bY + BAND_H / 2)
        .attr('stroke', theme.color).attr('stroke-width', 1.5).attr('opacity', 0.35)

      fixedG.append('text')
        .attr('x', FM.left - 8).attr('y', bY + BAND_H / 2 + 4)
        .attr('text-anchor', 'end').attr('font-size', '11px').attr('font-weight', '600')
        .attr('fill', theme.color).attr('font-family', 'inherit')
        .text(theme.name.length > 18 ? theme.name.slice(0, 17) + '…' : theme.name)
    })

    // ── Groupe zoomé + clippé ─────────────────────────────────────────────
    const zoomG = sel.append('g').attr('clip-path', 'url(#frise-clip)')

    // Zone pré-naissance
    const birthX = yearX(birthYear)
    const preBandH = themes.length * (BAND_H + BAND_GAP) - BAND_GAP
    zoomG.append('rect')
      .attr('x', FM.left).attr('y', FM.top)
      .attr('width', Math.max(0, birthX - FM.left)).attr('height', preBandH)
      .attr('fill', 'url(#frise-hatch)').attr('opacity', 0.18)

    // Ancre ★ naissance
    zoomG.append('line')
      .attr('x1', birthX).attr('x2', birthX)
      .attr('y1', FM.top).attr('y2', axY - 4)
      .attr('stroke', '#BBBBBB').attr('stroke-width', 1).attr('stroke-dasharray', '2,2')
    zoomG.append('text')
      .attr('x', birthX).attr('y', axY + 11)
      .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#999999')
      .text('★')

    // Ticks adaptatifs
    const range = YEAR_MAX - YEAR_MIN
    const yMinVis = YEAR_MIN - zoomTx * range / (CW * zoomK)
    const yMaxVis = YEAR_MIN + (CW - zoomTx) * range / (CW * zoomK)
    const tickStep = zoomK >= 4 ? 2 : zoomK >= 2 ? 5 : 10
    const t0 = Math.floor(yMinVis / tickStep) * tickStep
    const t1 = Math.ceil(yMaxVis / tickStep) * tickStep
    for (let y = t0; y <= t1; y += tickStep) {
      if (y < YEAR_MIN || y > YEAR_MAX || y === birthYear) continue
      const x = yearX(y)
      zoomG.append('text').attr('x', x).attr('y', axY + 11)
        .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#8E8E93').text(y)
      zoomG.append('line').attr('x1', x).attr('x2', x)
        .attr('y1', axY - 8).attr('y2', axY - 3).attr('stroke', '#E8E8E3')
    }

    // Ligne aujourd'hui
    const now = new Date().getFullYear()
    const todX = yearX(now)
    zoomG.append('line').attr('x1', todX).attr('x2', todX)
      .attr('y1', FM.top).attr('y2', axY - 4)
      .attr('stroke', '#DCDCDC').attr('stroke-width', 1).attr('stroke-dasharray', '3,3')
    zoomG.append('text').attr('x', todX).attr('y', FM.top - 3)
      .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#8E8E93').text(now)

    // Connecteurs cross-thème
    const themeIds = themes.map(t => t.id)
    events
      .filter(ev => (ev.theme_ids ?? []).filter(id => themeIds.includes(id)).length > 1)
      .forEach(ev => {
        const active = (ev.theme_ids ?? []).filter(id => themeIds.includes(id))
        const ys = active
          .map(id => FM.top + themes.findIndex(t => t.id === id) * (BAND_H + BAND_GAP) + BAND_H / 2)
          .sort((a, b) => a - b)
        zoomG.append('line')
          .attr('x1', yearX(ev.year)).attr('x2', yearX(ev.year))
          .attr('y1', ys[0]).attr('y2', ys[ys.length - 1])
          .attr('stroke', '#CECECE').attr('stroke-width', 1.5).attr('stroke-dasharray', '2,3')
      })

    // Événements
    themes.forEach((theme, i) => {
      const bY = FM.top + i * (BAND_H + BAND_GAP)
      events.filter(ev => (ev.theme_ids ?? []).includes(theme.id)).forEach(ev => {
        const cx       = yearX(ev.year)
        const cy       = bY + BAND_H / 2
        const preBirth = ev.year < birthYear
        const status   = ev.status
        const fillOpacity = status === 'draft' ? 0.55 : status === 'validated' ? 1 : 0
        const labelY   = i % 2 === 0 ? cy - 14 : cy + 21
        const eG = zoomG.append('g')
          .style('cursor', 'pointer')
          .on('click', () => onEventClick?.(ev))

        if (preBirth) {
          // Losange
          const pts = `${cx},${cy - EVENT_R} ${cx + EVENT_R},${cy} ${cx},${cy + EVENT_R} ${cx - EVENT_R},${cy}`
          eG.append('polygon').attr('points', pts)
            .attr('fill', theme.color).attr('fill-opacity', fillOpacity)
            .attr('stroke', theme.color).attr('stroke-width', 2)
          if (status === 'validated') {
            const rr = EVENT_R + 4
            const pts2 = `${cx},${cy - rr} ${cx + rr},${cy} ${cx},${cy + rr} ${cx - rr},${cy}`
            eG.append('polygon').attr('points', pts2)
              .attr('fill', 'none').attr('stroke', theme.color)
              .attr('stroke-width', 1.5).attr('opacity', 0.45)
          }
        } else {
          // Cercle
          eG.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', EVENT_R)
            .attr('fill', theme.color).attr('fill-opacity', fillOpacity)
            .attr('stroke', theme.color).attr('stroke-width', 2)
          if (status === 'validated') {
            eG.append('circle')
              .attr('cx', cx).attr('cy', cy).attr('r', EVENT_R + 4)
              .attr('fill', 'none').attr('stroke', theme.color)
              .attr('stroke-width', 1.5).attr('opacity', 0.45)
          }
        }

        eG.append('text')
          .attr('x', cx).attr('y', labelY).attr('text-anchor', 'middle')
          .attr('font-size', '9px').attr('font-family', 'inherit')
          .attr('fill', preBirth ? '#8E8E93' : '#1C1C1E').attr('font-weight', '500')
          .text(ev.title.length > 20 ? ev.title.slice(0, 19) + '…' : ev.title)
      })
    })
  }

  function zoomIn()    { if (!zoomRef.current || !svgRef.current) return; d3.select(svgRef.current).transition().duration(280).call(zoomRef.current.scaleBy, 2) }
  function zoomOut()   { if (!zoomRef.current || !svgRef.current) return; d3.select(svgRef.current).transition().duration(280).call(zoomRef.current.scaleBy, 0.5) }
  function zoomReset() { if (!zoomRef.current || !svgRef.current) return; d3.select(svgRef.current).transition().duration(380).call(zoomRef.current.transform, d3.zoomIdentity) }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Barre de contrôle */}
      <div className="flex items-center px-4 py-2 gap-2 flex-shrink-0">
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#8C7565]">
          Ma frise de vie
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={zoomIn}    className="frise-zoom-btn">+</button>
          <button onClick={zoomOut}   className="frise-zoom-btn">−</button>
          <button onClick={zoomReset} className="frise-zoom-btn text-[11px]">↺</button>
          {period && (
            <span className="text-[10px] text-[#8C7565] ml-2 min-w-[90px] text-right">
              {period}
            </span>
          )}
        </div>
      </div>

      {/* SVG D3 */}
      <svg
        ref={svgRef}
        className="flex-1 w-full block cursor-grab active:cursor-grabbing"
        style={{ minHeight: 120 }}
      />
    </div>
  )
}
