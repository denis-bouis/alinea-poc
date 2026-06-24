'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Person, PersonRelation } from '@/types/domain'

type Props = {
  people: Person[]
  relations: PersonRelation[]
  userName: string
  onPersonClick?: (person: Person) => void
}

type Node = d3.SimulationNodeDatum & {
  id: string
  name: string
  isUser: boolean
  relation?: string
  is_deceased?: boolean
}

type Link = d3.SimulationLinkDatum<Node> & {
  source: string | Node
  target: string | Node
  label?: string
}

const C = {
  orange: '#E8845C',
  node:   '#9B5E3A',
  user:   '#E8845C',
  muted:  '#8C7565',
  border: '#E6DAC8',
  text:   '#3D2B1A',
  bg:     '#FAF6F0',
}

export default function RelationsGraph({ people, relations, userName, onPersonClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<Node, Link> | null>(null)

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const sel = d3.select(svgEl)
    sel.selectAll('*').remove()

    const W = svgEl.clientWidth  || 400
    const H = svgEl.clientHeight || 400

    const userNode: Node = { id: '__user__', name: userName, isUser: true, fx: W / 2, fy: H / 2 }

    const nodes: Node[] = [
      userNode,
      ...people.map(p => ({
        id: p.id,
        name: p.name,
        isUser: false,
        relation: p.relation ?? undefined,
        is_deceased: p.is_deceased,
      })),
    ]

    const links: Link[] = [
      // Liens utilisateur → chaque personne
      ...people.map(p => ({ source: '__user__', target: p.id, label: p.relation ?? '' })),
      // Liens inter-personnes déclarés
      ...relations.map(r => ({ source: r.person_a_id, target: r.person_b_id, label: r.relation_label ?? '' })),
    ]

    const linkG = sel.append('g')
    const nodeG = sel.append('g')

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(90).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(40))

    simRef.current = sim

    sim.on('tick', () => {
      linkG.selectAll<SVGLineElement, Link>('line')
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0)

      nodeG.selectAll<SVGGElement, Node>('g.node')
        .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // Liens
    linkG.selectAll('line').data(links).join('line')
      .attr('stroke', C.border).attr('stroke-width', 1.5)

    // Nœuds
    const ng = nodeG.selectAll<SVGGElement, Node>('g.node')
      .data(nodes).join('g').attr('class', 'node')
      .style('cursor', d => d.isUser ? 'default' : 'pointer')
      .on('click', (_, d) => {
        if (!d.isUser) {
          const person = people.find(p => p.id === d.id)
          if (person) onPersonClick?.(person)
        }
      })
      .call(
        d3.drag<SVGGElement, Node>()
          .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); if (!d.isUser) { d.fx = null; d.fy = null } })
      )

    // Cercle du nœud
    ng.append('circle')
      .attr('r', d => d.isUser ? 20 : 15)
      .attr('fill', d => d.isUser ? C.user : C.bg)
      .attr('stroke', d => d.isUser ? C.user : C.node)
      .attr('stroke-width', d => d.isUser ? 0 : 1.5)
      .attr('stroke-dasharray', d => (d.is_deceased && !d.isUser) ? '3,3' : null)
      .attr('opacity', d => (d.is_deceased && !d.isUser) ? 0.55 : 1)

    // Texte du nœud
    ng.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.isUser ? 34 : 28)
      .attr('font-size', '10px')
      .attr('font-family', 'inherit')
      .attr('fill', C.muted)
      .text(d => d.name)

    // Initiale dans le cercle (utilisateur uniquement)
    ng.filter(d => d.isUser).append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('font-size', '13px').attr('font-weight', '700')
      .attr('fill', '#fff').attr('font-family', 'inherit')
      .text(d => d.name[0]?.toUpperCase() ?? '?')

  }, [people, relations, userName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mettre à jour le centre si le SVG est redimensionné
  useEffect(() => {
    const el = svgRef.current
    if (!el || !simRef.current) return
    const obs = new ResizeObserver(() => {
      const W = el.clientWidth, H = el.clientHeight
      const userNode = simRef.current?.nodes().find(n => n.id === '__user__')
      if (userNode) { userNode.fx = W / 2; userNode.fy = H / 2 }
      simRef.current?.force('center', d3.forceCenter(W / 2, H / 2))
      simRef.current?.alpha(0.2).restart()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <svg
      ref={svgRef}
      className="w-full h-full block"
    />
  )
}
