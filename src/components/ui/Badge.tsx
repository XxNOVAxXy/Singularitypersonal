import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-slate-100 text-graphite ring-slate-300',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
