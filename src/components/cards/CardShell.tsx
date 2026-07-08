'use client'

type Props = {
  title:       string
  count:       number
  collapsed:   boolean
  onToggleCollapse: () => void
  fullscreen:  boolean
  onToggleFullscreen: () => void
  headerExtra?: React.ReactNode
  children:    React.ReactNode
}

export default function CardShell({ title, count, collapsed, onToggleCollapse, fullscreen, onToggleFullscreen, headerExtra, children }: Props) {
  return (
    <div className={[
      'flex flex-col bg-white rounded-2xl border border-[#E8E2D9] overflow-hidden',
      fullscreen ? 'fixed inset-6 max-[640px]:inset-2 z-[70]' : 'flex-1 min-h-0',
    ].join(' ')}>
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#E8E2D9] flex-shrink-0">
        <button onClick={onToggleCollapse} className="text-[#8C8278] hover:text-[#2C2825] text-[11px]">
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#2C2825]">{title}</span>
        <span className="text-[11px] text-[#8C8278]">· {count}</span>
        {headerExtra}
        <button onClick={onToggleFullscreen} className="ml-auto text-[#8C8278] hover:text-[#2C2825] text-[13px]" title={fullscreen ? 'Réduire' : 'Plein écran'}>
          ⛶
        </button>
      </div>
      {!collapsed && <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>}
    </div>
  )
}
