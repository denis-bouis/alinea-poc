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
  bg:     '#FAF6F0',
}

const R       = 16   // rayon nœud
const GEN_H   = 82   // hauteur entre générations
const NODE_W  = 80   // largeur réservée par nœud dans une rangée

// Génération inférée depuis le libellé de relation
function inferGen(relation: string): number {
  const r = relation.toLowerCase()
  if (/arrière[- ]grand/.test(r))                                           return -3
  if (/grands?[- ]?(père|mère|pa|ma|parent)|aïeul|bisaïeul/.test(r))       return -2
  if (/père|mère|papa|maman|beau[- ]?père|belle[- ]?mère|oncle|tante|parrain|marraine/.test(r)) return -1
  if (/petite?[- ]?(fils|fille|enfant)/.test(r))                            return  2
  if (/fils|fille|beau[- ]?fils|belle[- ]?fille|enfant|neveu|nièce/.test(r)) return  1
  // Même génération
  return 0
}

function isSpouse(relation: string) {
  return /conjoint|époux|épouse|femme|mari|compagnon|compagne|partenaire|concubin/.test(relation.toLowerCase())
}

function isSibling(relation: string) {
  return /frère|sœur|soeur|cousin|cousine/.test(relation.toLowerCase())
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

    // ── Grouper par génération ──────────────────────────────────────────────
    const byGen = new Map<number, Person[]>()
    for (const p of family) {
      const g = inferGen(p.relation ?? '')
      if (!byGen.has(g)) byGen.set(g, [])
      byGen.get(g)!.push(p)
    }

    // Séparer gen 0 en : gauche (frères/sœurs), droite (conjoints), autres
    const gen0 = byGen.get(0) ?? []
    const siblings = gen0.filter(p => isSibling(p.relation ?? ''))
    const spouses  = gen0.filter(p => isSpouse(p.relation ?? ''))
    const others0  = gen0.filter(p => !isSibling(p.relation ?? '') && !isSpouse(p.relation ?? ''))

    // User est centré ; frères/autres à gauche, conjoints à droite
    const leftRow  = [...siblings, ...others0]
    const rightRow = [...spouses]

    // Générations présentes (hors 0, géré séparément)
    const otherGens = [...byGen.keys()].filter(g => g !== 0).sort((a, b) => a - b)

    // ── Calcul des positions Y ──────────────────────────────────────────────
    // On centre verticalement : la rangée utilisateur est à centerY
    const allGens  = [...new Set([0, ...otherGens])].sort((a, b) => a - b)
    const userGenI = allGens.indexOf(0)
    const centerY  = Math.max(H / 2, userGenI * GEN_H + R + 16)

    function genY(g: number): number { return centerY + g * GEN_H }

    const userX = W / 2
    const userY = genY(0)

    // ── Positions de tous les nœuds ─────────────────────────────────────────
    type NPos = { x: number; y: number }
    const pos = new Map<string, NPos>()

    // User
    pos.set('__user__', { x: userX, y: userY })

    // Gen 0 gauche
    leftRow.forEach((p, i) => {
      pos.set(p.id, { x: userX - (leftRow.length - i) * NODE_W, y: userY })
    })
    // Gen 0 droite
    rightRow.forEach((p, i) => {
      pos.set(p.id, { x: userX + (i + 1) * NODE_W, y: userY })
    })

    // Autres générations — centrées sur userX
    for (const g of otherGens) {
      const row = byGen.get(g) ?? []
      if (!row.length) continue
      const totalW = row.length * NODE_W
      row.forEach((p, i) => {
        pos.set(p.id, { x: userX - totalW / 2 + NODE_W / 2 + i * NODE_W, y: genY(g) })
      })
    }

    // ── Dessin ──────────────────────────────────────────────────────────────
    const lineG = sel.append('g')
    const nodeG = sel.append('g')

    // Helper ligne
    function line(x1: number, y1: number, x2: number, y2: number, dashed = false) {
      lineG.append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke', C.line).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', dashed ? '4,3' : null)
    }

    // ── Connecteurs gen 0 ───────────────────────────────────────────────────
    // Frères/sœurs : ligne horizontale à gauche du user
    if (leftRow.length) {
      const leftmostX = pos.get(leftRow[0].id)!.x
      line(leftmostX + R, userY, userX - R, userY)
    }
    // Conjoints : double trait vers droite
    spouses.forEach(p => {
      const px = pos.get(p.id)!.x
      const x1 = userX + R, x2 = px - R
      line(x1, userY - 3, x2, userY - 3)
      line(x1, userY + 3, x2, userY + 3)
      // Losange central
      const mx = (x1 + x2) / 2
      const pts = `${mx},${userY - 6} ${mx + 5},${userY} ${mx},${userY + 6} ${mx - 5},${userY}`
      lineG.append('polygon').attr('points', pts).attr('fill', C.line)
    })

    // ── Connecteurs générations ─────────────────────────────────────────────
    // Pour chaque génération non-0 : trunk vertical user → bus + bus horizontal + branches
    for (const g of otherGens) {
      const row = byGen.get(g) ?? []
      if (!row.length) continue

      const rowY    = genY(g)
      const above   = g < 0
      const busY    = above ? rowY + GEN_H * 0.45 : rowY - GEN_H * 0.45
      const trunkY0 = above ? userY - R : userY + R

      // Trunk depuis user jusqu'au bus
      line(userX, trunkY0, userX, busY)

      // Bus horizontal
      const xs = row.map(p => pos.get(p.id)!.x)
      const busX1 = Math.min(...xs, userX)
      const busX2 = Math.max(...xs, userX)
      if (busX1 < busX2) line(busX1, busY, busX2, busY)

      // Branches verticales de chaque personne au bus
      row.forEach(p => {
        const px = pos.get(p.id)!.x
        line(px, above ? rowY + R : rowY - R, px, busY)
      })
    }

    // ── Nœuds ───────────────────────────────────────────────────────────────
    function drawNode(
      id: string,
      x: number, y: number,
      label: string,
      sub: string,
      isUser: boolean,
      isDeceased: boolean,
      onClick: () => void,
    ) {
      const g = nodeG.append('g')
        .style('cursor', 'pointer')
        .on('click', onClick)

      g.append('circle').attr('cx', x).attr('cy', y).attr('r', R)
        .attr('fill', isUser ? C.user : C.bg)
        .attr('stroke', isUser ? 'none' : (isDeceased ? C.muted : C.node))
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', (!isUser && isDeceased) ? '3,3' : null)
        .attr('opacity', (!isUser && isDeceased) ? 0.6 : 1)

      // Initiales
      const initials = isUser
        ? (label[0]?.toUpperCase() ?? '?')
        : label.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()

      g.append('text').attr('x', x).attr('y', y).attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('font-size', isUser ? '13px' : '10px').attr('font-weight', '700')
        .attr('fill', isUser ? '#fff' : (isDeceased ? C.muted : C.node))
        .attr('font-family', 'inherit')
        .text(initials)

      // Prénom sous le cercle
      const firstName = label.split(' ')[0] ?? label
      g.append('text').attr('x', x).attr('y', y + R + 13)
        .attr('text-anchor', 'middle').attr('font-size', '10px')
        .attr('fill', C.muted).attr('font-family', 'inherit')
        .text(firstName.length > 9 ? firstName.slice(0, 8) + '…' : firstName)

      // Relation en dessous
      if (sub) {
        g.append('text').attr('x', x).attr('y', y + R + 24)
          .attr('text-anchor', 'middle').attr('font-size', '8px')
          .attr('fill', C.border).attr('font-family', 'inherit').attr('font-style', 'italic')
          .text(sub.length > 12 ? sub.slice(0, 11) + '…' : sub)
      }
    }

    // User
    drawNode('__user__', userX, userY, userName, '', true, false, () => onUserClick?.())

    // Famille
    for (const p of family) {
      const np = pos.get(p.id)
      if (!np) continue
      drawNode(p.id, np.x, np.y, p.name, p.relation ?? '', false, p.is_deceased ?? false, () => onPersonClick?.(p))
    }

  }, [people, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  return <svg ref={svgRef} className="w-full h-full block" />
}
