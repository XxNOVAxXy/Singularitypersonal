
import { NavLink } from 'react-router-dom'
import {
  FileSearch,
  GitCompareArrows,
  Mail,
  Settings2,
  ShieldCheck,
  X,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  description: string
  icon: typeof Mail
  end?: boolean
}

const navItems: NavItem[] = [
  {
    to: '/correos',
    label: 'Correos',
    description: 'Mensajes y documentos',
    icon: Mail,
  },
  {
    to: '/extraccion',
    label: 'Extracción de Docs',
    description: 'Manual e inteligencia artificial',
    icon: FileSearch,
  },
  {
    to: '/comparacion',
    label: 'Comparación',
    description: 'Análisis de resultados',
    icon: GitCompareArrows,
  },
  {
    to: '/configuracion',
    label: 'Configuración',
    description: 'Campos e integraciones',
    icon: Settings2,
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Fondo para móviles */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-slate-950/65 backdrop-blur-[3px] transition-opacity duration-300 lg:hidden',
          open
            ? 'opacity-100'
            : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col overflow-hidden',
           'border-r border-white/[0.08] bg-carbon',
          'transition-transform duration-300 ease-in-out',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shrink-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Marca */}
        <div className="relative flex h-[88px] shrink-0 items-center justify-between border-b border-white/[0.08] px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-graphite text-white">
              <ShieldCheck size={23} strokeWidth={1.9} className="text-white" />
            </div>

            <div>
              <p className="text-[17px] font-bold tracking-[-0.5px] text-white">
                Singularity
              </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[1.6px] text-platinum">
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-6">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold uppercase tracking-[2px] text-slate-500">
              Espacio de trabajo
            </p>
            <span className="text-[10px] font-semibold text-slate-600">04</span>
          </div>

          <div className="space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                     'group relative flex min-h-[66px] items-center gap-3 overflow-hidden rounded-xl border border-transparent px-3.5 py-2.5',
                    'transition-all duration-200',
                    isActive
                       ? 'border-white/10 bg-graphite text-white shadow-[0_8px_20px_rgba(0,0,0,0.16)]'
                       : 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Indicador activo */}
                    {isActive && (
                       <span className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-platinum" />
                    )}

                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive
                           ? 'bg-white/10 text-white'
                          : 'bg-white/[0.035] text-slate-400 group-hover:bg-white/[0.08] group-hover:text-white',
                      )}
                    >
                      <item.icon size={19} strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-[13px] font-semibold',
                          isActive ? 'text-white' : 'text-slate-300',
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500 group-hover:text-slate-400">
                        {item.description}
                      </p>
                    </div>

                    <ChevronRight
                      size={15}
                      className={cn(
                        'shrink-0 transition-all duration-200',
                        isActive
                           ? 'text-platinum'
                          : 'translate-x-[-4px] opacity-0 group-hover:translate-x-0 group-hover:opacity-100',
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="relative border-t border-white/[0.08] p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-platinum">
              Operaciones
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Revisión y extracción de documentos.
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
