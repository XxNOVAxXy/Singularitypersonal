import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-carbon text-white hover:bg-graphite focus-visible:outline-carbon shadow-sm',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-mist focus-visible:outline-graphite',
  ghost:
    'bg-transparent text-slate-600 hover:bg-mist focus-visible:outline-graphite',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-sm',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}
