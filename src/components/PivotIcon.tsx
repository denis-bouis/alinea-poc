// Icône unique pour marquer un événement "moment tournant" (life_events.is_pivot),
// partagée entre DetailPanel (fiche événement + éléments liés) et FriseVerticale
// (repère sur la frise) — un seul symbole, une seule définition.
export const PIVOT_TOOLTIP = 'Moment tournant — un événement qui a marqué un tournant dans cette vie.'

export default function PivotIcon({ className = '' }: { className?: string }) {
  return (
    <span title={PIVOT_TOOLTIP} className={['text-[#9B5E3A] cursor-help', className].join(' ')}>
      ⚡
    </span>
  )
}
