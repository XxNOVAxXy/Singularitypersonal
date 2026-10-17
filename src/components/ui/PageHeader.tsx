import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
  icon?: ReactNode
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow = 'Workspace',
  icon,
}: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(28,30,34,0.04)] sm:px-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border-[24px] border-slate-100/80" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {icon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-carbon text-white shadow-sm">
              {icon}
            </div>
          ) : null}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-platinum">
              {eyebrow}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="relative flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
