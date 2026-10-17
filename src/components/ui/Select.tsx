import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-lg border bg-white px-3 text-sm text-slate-800 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-platinum/40',
        invalid
          ? 'border-rose-300 focus:border-rose-400'
          : 'border-slate-300 focus:border-graphite',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
