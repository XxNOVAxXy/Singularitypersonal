import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import type { ExtractionMethod } from '@/types'
import type { ExtractionStatus } from '@/features/extraction/utils/extractionState'
import { relativeTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { MethodSelector } from '@/features/extraction/components/MethodSelector'

interface ExtractionToolbarProps {
  method: ExtractionMethod
  onChangeMethod: (method: ExtractionMethod) => void
  status: ExtractionStatus
  isExtracting: boolean
  canRun: boolean
  lastRunAt: string | null
  onRun: () => void
  onReset: () => void
}

function GeminiHint({
  status,
  lastRunAt,
}: {
  status: ExtractionStatus
  lastRunAt: string | null
}) {
  if (status === 'extracting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-brand-600">
        <Loader2 size={14} className="animate-spin" />
        Procesando documento…
      </span>
    )
  }
  if (status === 'error') {
    return <span className="text-rose-600">La extracción falló</span>
  }
  if (status === 'done' && lastRunAt) {
    return <span>Última extracción {relativeTime(lastRunAt)}</span>
  }
  return <span>Listo para extraer</span>
}

export function ExtractionToolbar({
  method,
  onChangeMethod,
  status,
  isExtracting,
  canRun,
  lastRunAt,
  onRun,
  onReset,
}: ExtractionToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Método de extracción
        </span>
        <MethodSelector method={method} onChange={onChangeMethod} />
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <div className="text-xs text-slate-500">
          {method === 'gemini' ? (
            <GeminiHint status={status} lastRunAt={lastRunAt} />
          ) : (
            <span>Captura los valores manualmente en cada campo</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={onReset}
            disabled={isExtracting}
          >
            Restablecer
          </Button>
          {method === 'gemini' ? (
            <Button
              size="sm"
              icon={
                isExtracting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )
              }
              onClick={onRun}
              disabled={!canRun}
              title={
                canRun ? undefined : 'Adjunta un documento para poder extraer'
              }
            >
              {isExtracting ? 'Extrayendo…' : 'Ejecutar extracción'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
