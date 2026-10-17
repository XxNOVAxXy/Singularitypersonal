import { Bell, ChevronRight, Menu, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation()
  const section = location.pathname.startsWith('/extraccion')
    ? 'Extracción'
    : location.pathname.startsWith('/comparacion')
      ? 'Comparación'
      : location.pathname.startsWith('/configuracion')
        ? 'Configuración'
        : 'Correos'

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200/80 bg-white px-4 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-mist hover:text-ink lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      <div className="hidden items-center gap-2 text-xs lg:flex">
        <span className="font-medium text-slate-400">Workspace</span>
        <ChevronRight size={14} className="text-slate-300" />
        <span className="font-semibold text-ink">{section}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-mist hover:text-ink"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pl-1 pr-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-carbon text-xs font-semibold text-white">
            LD
          </span>
         
        </div>
      </div>
    </header>
  )
}
