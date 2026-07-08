'use client'

export type MobileColumn = 'chat' | 'frise' | 'fiches'

type Props = {
  active:   MobileColumn
  onChange: (col: MobileColumn) => void
}

const TABS: { id: MobileColumn; label: string }[] = [
  { id: 'chat',   label: 'Chat' },
  { id: 'frise',  label: 'Frise' },
  { id: 'fiches', label: 'Fiches' },
]

// Onglets une-colonne-à-la-fois (<1180px) — pleine largeur, cible tactile
// généreuse, cohérent avec l'esprit mobile déjà décrit dans Conception-UX-globale.
export default function MobileTabs({ active, onChange }: Props) {
  return (
    <nav className="flex flex-shrink-0 h-10 border-b border-[#E8E2D9] bg-[#FAF8F4]">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'flex-1 text-[13px] font-medium transition-colors border-b-2',
            active === tab.id ? 'text-[#9B5E3A] border-[#9B5E3A]' : 'text-[#8C8278] border-transparent',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
