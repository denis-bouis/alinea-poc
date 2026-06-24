'use client'

type MobileView = 'chat' | 'frise' | 'personnes' | 'themes'

type Tab = {
  id: MobileView
  icon: string
  label: string
  disabled?: boolean
}

type Props = {
  active: MobileView
  phase: 1 | 2
  onChange: (view: MobileView) => void
}

export default function MobileNav({ active, phase, onChange }: Props) {
  const tabs: Tab[] = [
    { id: 'chat',      icon: '💬', label: 'Chat'    },
    { id: 'frise',     icon: '📅', label: 'Frise',    disabled: phase < 2 },
    { id: 'personnes', icon: '👥', label: 'Proches'  },
    { id: 'themes',    icon: '🏷', label: 'Thèmes',  disabled: phase < 2 },
  ]

  return (
    <nav className="flex md:hidden flex-shrink-0 h-[58px] bg-white border-t border-[#E6DAC8]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={[
            'flex-1 flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-medium transition-colors duration-150',
            'disabled:opacity-30 disabled:pointer-events-none',
            active === tab.id
              ? 'text-[#9B5E3A]'
              : 'text-[#8C7565]',
          ].join(' ')}
        >
          <span className="text-[19px] leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
