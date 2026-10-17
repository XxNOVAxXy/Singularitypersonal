import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border bg-white px-3 text-sm text-slate-800 transition-colors',
        'placeholder:text-slate-400',
        'focus:outline-none focus:ring-2 focus:ring-platinum/40',
        invalid
          ? 'border-rose-300 focus:border-rose-400'
          : 'border-slate-300 focus:border-graphite',
        className,
      )}
      {...props}
    />
  )
}
