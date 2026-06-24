'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Person, PersonRelation } from '@/types/domain'

type Props = {
  people:         Person[]
  relations?:     PersonRelation[]
  userName:       string
  onPersonClick?: (person: Person) => void
  onUserClick?:   () => void
}

const C = {
  node:   '#9B5E3A',
  user:   '#E8845C',
  muted:  '#8C7565',
  border: '#E6DAC8',
  line:   '#D4C4B0',
  couple: '#B8A090',
  bg:     '#FAF6F0',
}

const R       = 16
const GEN_H   = 90
const NODE_W  = 80
const LABEL_H = 32   // espace réservé sous chaque cercle (prénom + relation)

// ── Génération de base (sans résolution de contexte) ─────────────────────────
function inferGenBasic(relation: string): number {
  const r = relation.toLowerCase()
  if (/arrière[- ]grand/.test(r))                                               return -3
  if (/grands?[- ]?(père|mère|pa|ma|parent)|aïeul|bisaïeul/.test(r))           return -2
  if (/père|mère|papa|maman|beau[- ]?père|belle[- ]?mère|oncle|tante|parrain|marraine/.test(r)) return -1
  if (/petite?[- ]?(fils|fille|enfant)/.test(r))                                return  2
  if (/fils|fille|beau[- ]?fils|belle[- ]?fille|enfant|neveu|nièce/.test(r))   return  1
  return 0
}

function isSibling(r: string) {
  return /frère|sœur|soeur|cousin|cousine/.test(r.toLowerCase())
}
function isSpouseRel(r: string) {
  return /conjoint|époux|épouse|femme|mari|compagnon|compagne|partenaire|concubin/.test(r.toLowerCase())
}

export default function FamilyTree({ people, userName, onPersonClick, onUserClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const sel = d3.select(svgEl)
    sel.selectAll('*').remove()

    const W = svgEl.clientWidth  || 300
    const H = svgEl.clientHeight || 400

    const family = people.filter(p => p.relation_type === 'famille')

    if (family.length === 0) {
      sel.append('text').attr('x', W / 2).attr('y', H / 2)
        .attr('text-anchor', 'middle').attr('font-size', '12px')
        .attr('fill', C.muted).attr('font-family', 'inherit')
        .text('Aucun membre de la famille')
      return
    }

    // ── Passe 1 : inférence de base ───────────────────────────────────────────
    const nameToGen = new Map<string, number>()
    for (const p of family) {
      nameToGen.set(p.name.toLowerCase(), inferGenBasic(p.relation ?? ''))
    }

    // ── Passe 2 : résolution "épouse/compagnon de X" ──────────────────────────
    // Si X est à gen +1, la personne est aussi à gen +1 (beau-fils, belle-fille…)
    for (const p of family) {
      const rel = p.relation ?? ''
      if (!isSpouseRel(rel)) continue
      const m = rel.toLowerCase().match(/\bde\s+([a-zàâéèêëîïôùûüæœç]+)/i)
      if (!m) continue
      const refName = m[1].toLowerCase()
      const refPerson = family.find(fp => fp.name.toLowerCase().startsWith(refName))
      if (!refPerson) continue
      const refGen = nameToGen.get(refPerson.name.toLowerCase())
      if (refGen !== undefined && refGen !== 0) {
        nameToGen.set(p.name.toLowerCase(), refGen)
      }
    }

    // ── Grouper par génération ────────────────────────────────────────────────
    const byGen = new Map<number, Person[]>()
    for (const p of family) {
      const g = nameToGen.get(p.name.toLowerCase()) ?? 0
      if (!byGen.has(g)) byGen.set(g, [])
      byGen.get(g)!.push(p)
    }

    // Séparer gen 0 : frères/sœurs à gauche, conjoint direct de Denis à droite
    const gen0raw = byGen.get(0) ?? []
    const siblings  = gen0raw.filter(p => isSibling(p.relation ?? ''))
    const spouses0  = gen0raw.filter(p => isSpouseRel(p.relation ?? '') && (nameToGen.get(p.name.toLowerCase()) ?? 0) === 0)
    const others0   = gen0raw.filter(p => !isSibling(p.relation ?? '') && !((nameToGen.get(p.name.toLowerCase()) ?? 0) === 0 && isSpouseRel(p.relation ?? '')))
    const leftRow   = [...siblings, ...others0]
    const rightRow  = [...spouses0]

    const otherGens = [...byGen.keys()].filter(g => g !== 0).sort((a, b) => a - b)

    // ── Positions Y ──────────────────────────────────────────────────────────
    const allGens  = [...new Set([0, ...otherGens])].sort((a, b) => a - b)
    const userGenI = allGens.indexOf(0)
    const topMargin = R + LABEL_H + 8
    const centerY  = Math.max(H / 2, userGenI * GEN_H + topMargin)

    const genY = (g: number) => centerY + g * GEN_H

    const userX = W / 2
    const userY = genY(0)

    // ── Positions X ──────────────────────────────────────────────────────────
    type NPos = { x: number; y: number }
    const pos = new Map<string, NPos>()

    pos.set('__user__', { x: userX, y: userY })

    leftRow.forEach((p, i) => {
      pos.set(p.id, { x: userX - (leftRow.length - i) * NODE_W, y: userY })
    })
    rightRow.forEach((p, i) => {
      pos.set(p.id, { x: userX + (i + 1) * NODE_W, y: userY })
    })

    for (const g of otherGens) {
      const row = byGen.get(g) ?? []
      if (!row.length) continue
      const totalW = row.length * NODE_W
      row.forEach((p, i) => {
        pos.set(p.id, { x: userX - totalW / 2 + NODE_W / 2 + i * NODE_W, y: genY(g) })
      })
    }

    // ── Dessin ───────────────────────────────────────────────────────────────
    const lineG = sel.append('g')
    const nodeG = sel.append('g')

    const seg = (x1: number, y1: number, x2: number, y2: number, color = C.line, w = 1.5) =>
      lineG.append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke', color).attr('stroke-width', w)
        .attr('stroke-linecap', 'round')

    // ── Helper : cible Y du trunk pour la génération g ───────────────────────
    // Vers le prochain échelon occupé en direction de Denis
    function trunkTargetY(g: number): number {
      if (g < 0) {
        const closer = otherGens.filter(og => og > g && og < 0)
        return closer.length ? genY(Math.max(...closer)) : userY - R
      } else {
        const closer = otherGens.filter(og => og < g && og > 0)
        return closer.length ? genY(Math.min(...closer)) : userY + R
      }
    }

    // ── Connecteurs générations (barre AU niveau des nœuds + trunk vertical) ─
    for (const g of otherGens) {
      const row = byGen.get(g) ?? []
      if (!row.length) continue

      const rowY   = genY(g)
      const above  = g < 0
      const xs     = row.map(p => pos.get(p.id)!.x)
      const minX   = Math.min(...xs)
      const maxX   = Math.max(...xs)
      const midX   = (minX + maxX) / 2   // ≈ userX (rangée centrée)

      // Barre horizontale reliant les nœuds de la rangée (au niveau de leurs centres)
      if (row.length >= 2) {
        seg(minX + R, rowY, maxX - R, rowY, C.couple, 1.5)
        // Petit nœud de jonction au milieu de la barre (point de famille)
        lineG.append('circle')
          .attr('cx', midX).attr('cy', rowY)
          .attr('r', 3).attr('fill', C.couple)
      }

      // Trunk vertical du milieu de la barre vers la prochaine génération / Denis
      const targetY = trunkTargetY(g)
      // Partir du bord du cercle le plus proche de Denis
      const startY  = above ? rowY + R : rowY - R
      seg(midX, startY, midX, targetY, C.line)

      // Si midX ≠ userX (ne devrait pas arriver avec le layout centré), jog horizontal
      if (Math.abs(midX - userX) > 2) {
        const jY = above ? userY - R : userY + R
        seg(midX, jY, userX, jY, C.line)
      }
    }

    // ── Connecteurs gen 0 ─────────────────────────────────────────────────────
    // Frères/sœurs : trait horizontal jusqu'à Denis
    if (leftRow.length) {
      const lx = pos.get(leftRow[0].id)!.x
      seg(lx + R, userY, userX - R, userY, C.line)
    }
    // Conjoint direct de Denis : double trait
    spouses0.forEach(p => {
      const px = pos.get(p.id)!.x
      const x1 = userX + R, x2 = px - R
      seg(x1, userY - 3, x2, userY - 3, C.couple)
      seg(x1, userY + 3, x2, userY + 3, C.couple)
      const mx = (x1 + x2) / 2
      lineG.append('polygon')
        .attr('points', `${mx},${userY - 6} ${mx + 5},${userY} ${mx},${userY + 6} ${mx - 5},${userY}`)
        .attr('fill', C.couple)
    })

    // ── Nœuds ─────────────────────────────────────────────────────────────────
    function drawNode(
      x: number, y: number,
      label: string, sub: string,
      isUser: boolean, deceased: boolean,
      onClick: () => void,
    ) {
      const g = nodeG.append('g').style('cursor', 'pointer').on('click', onClick)

      g.append('circle').attr('cx', x).attr('cy', y).attr('r', R)
        .attr('fill', isUser ? C.user : C.bg)
        .attr('stroke', isUser ? 'none' : (deceased ? C.muted : C.node))
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', !isUser && deceased ? '3,3' : null)
        .attr('opacity', !isUser && deceased ? 0.6 : 1)

      const initials = isUser
        ? (label[0]?.toUpperCase() ?? '?')
        : label.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()

      g.append('text').attr('x', x).attr('y', y).attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('font-size', isUser ? '13px' : '10px').attr('font-weight', '700')
        .attr('fill', isUser ? '#fff' : (deceased ? C.muted : C.node))
        .attr('font-family', 'inherit')
        .text(initials)

      const firstName = label.split(' ')[0] ?? label
      g.append('text').attr('x', x).attr('y', y + R + 13)
        .attr('text-anchor', 'middle').attr('font-size', '10px')
        .attr('fill', C.muted).attr('font-family', 'inherit')
        .text(firstName.length > 9 ? firstName.slice(0, 8) + '…' : firstName)

      if (sub) {
        g.append('text').attr('x', x).attr('y', y + R + 24)
          .attr('text-anchor', 'middle').attr('font-size', '8px')
          .attr('fill', C.border).attr('font-family', 'inherit').attr('font-style', 'italic')
          .text(sub.length > 14 ? sub.slice(0, 13) + '…' : sub)
      }
    }

    drawNode(userX, userY, userName, '', true, false, () => onUserClick?.())

    for (const p of family) {
      const np = pos.get(p.id)
      if (!np) continue
      drawNode(np.x, np.y, p.name, p.relation ?? '', false, p.is_deceased ?? false, () => onPersonClick?.(p))
    }

  }, [people, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  return <svg ref={svgRef} className="w-full h-full block" />
}
