import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  hint?: string
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1',
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              active
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {option.icon}
            <span className="flex flex-col text-left">
              <span>{option.label}</span>
              {option.hint ? (
                <span className="text-[10px] font-normal text-slate-400">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
