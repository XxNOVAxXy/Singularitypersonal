import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Card({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || action)
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
