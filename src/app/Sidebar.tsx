import { NavLink } from 'react-router-dom'
import {
  FileSearch,
  GitCompare,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/correos', label: 'Correos', icon: Mail },
  { to: '/extraccion', label: 'Extracción de pólizas', icon: FileSearch },
  { to: '/comparacion', label: 'Comparación', icon: GitCompare },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-slate-900/40 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <ShieldCheck size={18} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Singularity</p>
              <p className="text-[11px] text-slate-400">Pólizas Enterprise</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-600/15 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="rounded-lg bg-slate-800/70 p-3">
            <p className="text-xs font-medium text-slate-200">
              Entorno de demostración
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Datos simulados · Sin backend
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
