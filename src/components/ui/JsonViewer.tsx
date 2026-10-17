import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

interface JsonViewerProps {
  data: unknown
  className?: string
  maxHeight?: string
}

export function JsonViewer({ data, className, maxHeight }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(data, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-carbon bg-carbon',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-graphite px-2 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-slate-600 transition-colors hover:bg-slate-600"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre
        className="overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200"
        style={{ maxHeight: maxHeight ?? '320px' }}
      >
        {text}
      </pre>
    </div>
  )
}
