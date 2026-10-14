import type { ReactNode } from 'react'

interface FieldSectionProps {
  title: string
  description?: string
  badge?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function FieldSection({
  title,
  description,
  badge,
  action,
  children,
}: FieldSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {description ? (
            <p className="hidden text-xs text-slate-500 md:block">{description}</p>
          ) : null}
          {action}
        </div>
      </header>
      <div className="px-5">{children}</div>
    </section>
  )
}
