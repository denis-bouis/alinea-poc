// Icône unique pour marquer une personne décédée (people.is_deceased),
// partagée entre PersonnesCard (liste) et DetailPanel (fiche détaillée).
export default function DeceasedIcon({ className = '', title = 'Décédé·e' }: { className?: string; title?: string }) {
  return (
    <span title={title} className={['text-[#8C8278] cursor-help', className].join(' ')}>
      🕯
    </span>
  )
}
