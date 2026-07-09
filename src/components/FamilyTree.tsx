'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Person, PersonRelation, PeopleRelationType } from '@/types/domain'
import { FAMILY_GENERATION_DELTA, FAMILY_NODE_LABEL } from '@/types/domain'

type Props = {
  people:         Person[]
  relations:      PersonRelation[]
  selfId:         string | null
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

export default function FamilyTree({ people, relations, selfId, userName, onPersonClick, onUserClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const sel = d3.select(svgEl)
    sel.selectAll('*').remove()

    const W = svgEl.clientWidth  || 300
    const H = svgEl.clientHeight || 400

    if (!selfId) {
      sel.append('text').attr('x', W / 2).attr('y', H / 2)
        .attr('text-anchor', 'middle').attr('font-size', '12px')
        .attr('fill', C.muted).attr('font-family', 'inherit')
        .text('Aucun membre de la famille')
      return
    }

    // ── Relations directes moi → personne, structurées (migration 021) ────────
    // Remplace l'ancien regex sur people.relation (texte libre, cassé par la
    // langue de conversation) : relation_type est un enum fixe, indépendant
    // de la langue, dérivé automatiquement dans les deux sens par les tools
    // link_people_relation / declare_family_unit.
    const selfRelByPersonId = new Map<string, PeopleRelationType>()
    for (const r of relations) {
      if (r.person_a_id === selfId && FAMILY_GENERATION_DELTA[r.relation_type] !== undefined) {
        selfRelByPersonId.set(r.person_b_id, r.relation_type)
      }
    }

    const peopleById = new Map(people.map(p => [p.id, p]))
    const nameToGen = new Map<string, number>()   // clé = person.id (pas le nom, plus fiable)
    const family: Person[] = []

    for (const p of people) {
      const relType = selfRelByPersonId.get(p.id)
      if (!relType) continue
      family.push(p)
      nameToGen.set(p.id, FAMILY_GENERATION_DELTA[relType] ?? 0)
    }

    // ── Pass 2 : conjoint d'un proche non directement lié à moi ───────────────
    // Ex. "ma grand-mère Renée, mariée à Jean" sans déclarer Jean comme
    // grand-père directement — Jean est positionné à la génération de Renée
    // via l'arête partner_of structurée entre eux (plus de regex "épouse de X").
    const familyIds = new Set(family.map(p => p.id))
    for (const r of relations) {
      if (r.relation_type !== 'partner_of') continue
      const [inId, outId] = familyIds.has(r.person_a_id) ? [r.person_a_id, r.person_b_id]
        : familyIds.has(r.person_b_id) ? [r.person_b_id, r.person_a_id]
        : [null, null]
      if (!inId || !outId || familyIds.has(outId)) continue
      const partner = peopleById.get(outId)
      if (!partner) continue
      family.push(partner)
      familyIds.add(outId)
      nameToGen.set(outId, nameToGen.get(inId) ?? 0)
    }

    if (family.length === 0) {
      sel.append('text').attr('x', W / 2).attr('y', H / 2)
        .attr('text-anchor', 'middle').attr('font-size', '12px')
        .attr('fill', C.muted).attr('font-family', 'inherit')
        .text('Aucun membre de la famille')
      return
    }

    // ── Grouper par génération ────────────────────────────────────────────────
    const byGen = new Map<number, Person[]>()
    for (const p of family) {
      const g = nameToGen.get(p.id) ?? 0
      if (!byGen.has(g)) byGen.set(g, [])
      byGen.get(g)!.push(p)
    }

    // Séparer gen 0 : conjoint direct de moi à droite, tout le reste
    // (frères/sœurs/cousins, ou conjoint d'un proche ajouté en pass 2) à gauche
    const gen0raw = byGen.get(0) ?? []
    const leftRow  = gen0raw.filter(p => selfRelByPersonId.get(p.id) !== 'partner_of')
    const rightRow = gen0raw.filter(p => selfRelByPersonId.get(p.id) === 'partner_of')

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
    // Vers le prochain échelon occupé en direction de moi
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

      // Trunk vertical du milieu de la barre vers la prochaine génération / moi
      const targetY = trunkTargetY(g)
      // Partir du bord du cercle le plus proche de moi
      const startY  = above ? rowY + R : rowY - R
      seg(midX, startY, midX, targetY, C.line)

      // Si midX ≠ userX (ne devrait pas arriver avec le layout centré), jog horizontal
      if (Math.abs(midX - userX) > 2) {
        const jY = above ? userY - R : userY + R
        seg(midX, jY, userX, jY, C.line)
      }
    }

    // ── Connecteurs gen 0 ─────────────────────────────────────────────────────
    // Frères/sœurs/cousins : trait horizontal jusqu'à moi
    if (leftRow.length) {
      const lx = pos.get(leftRow[0].id)!.x
      seg(lx + R, userY, userX - R, userY, C.line)
    }
    // Conjoint direct : double trait
    rightRow.forEach(p => {
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
      // Sous-titre dérivé du relation_type structuré (toujours en français, ne
      // suit pas la langue de conversation) — ou "conjoint(e)" par défaut pour
      // les personnes ajoutées uniquement via une arête partner_of (pass 2).
      const relType = selfRelByPersonId.get(p.id)
      const sub = relType ? (FAMILY_NODE_LABEL[relType] ?? '') : 'conjoint(e)'
      drawNode(np.x, np.y, p.name, sub, false, p.is_deceased ?? false, () => onPersonClick?.(p))
    }

  }, [people, relations, selfId, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  return <svg ref={svgRef} className="w-full h-full block" />
}
