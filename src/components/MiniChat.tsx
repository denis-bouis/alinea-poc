'use client'

type Props = {
  lastMessage: string
  onClick: () => void
}

export default function MiniChat({ lastMessage, onClick }: Props) {
  if (!lastMessage) return null
  return (
    <button
      onClick={onClick}
      className={[
        'flex md:hidden items-center gap-3 flex-shrink-0',
        'h-[52px] px-4 bg-white border-t border-[#E6DAC8]',
        'w-full text-left cursor-pointer',
      ].join(' ')}
    >
      <span className="flex-1 text-[13px] text-[#8C7565] italic truncate">
        {lastMessage}
      </span>
      <span className="text-[12px] font-semibold text-[#9B5E3A] whitespace-nowrap flex-shrink-0">
        Reprendre →
      </span>
    </button>
  )
}
