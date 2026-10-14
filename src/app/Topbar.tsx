import { Bell, Menu, Search } from 'lucide-react'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          placeholder="Buscar pólizas, correos o clientes…"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pl-1 pr-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-100 text-xs font-semibold text-brand-700">
            LD
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs font-semibold text-slate-700">Laura Domínguez</p>
            <p className="text-[11px] text-slate-400">Analista de pólizas</p>
          </div>
        </div>
      </div>
    </header>
  )
}
