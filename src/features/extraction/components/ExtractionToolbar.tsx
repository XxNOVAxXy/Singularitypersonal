import { FileSearch, Loader2, RotateCcw, Sparkles } from 'lucide-react'
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
  onSave?: () => void
  isDirty?: boolean
  isSaving?: boolean
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
      <span className="inline-flex items-center gap-1.5 text-graphite">
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
  onSave,
  isDirty = false,
  isSaving = false,
}: ExtractionToolbarProps) {
  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(28,30,34,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Método de extracción
        </span>
        <div className="text-right text-[11px] text-slate-500">
          {method === 'gemini' ? (
            <GeminiHint status={status} lastRunAt={lastRunAt} />
          ) : (
            <span>Reglas locales</span>
          )}
        </div>
      </div>

      <MethodSelector method={method} onChange={onChangeMethod} />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {method === 'manual' && onSave ? (
          <Button
            variant="secondary"
            size="sm"
            icon={isSaving ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
            onClick={onSave}
            disabled={isSaving || isExtracting || !isDirty}
          >
            {isSaving ? 'Guardando' : 'Guardar'}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={onReset}
          disabled={isExtracting}
        >
          Restablecer
        </Button>
        <Button
          size="sm"
          icon={
            isExtracting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : method === 'manual' ? (
              <FileSearch size={14} />
            ) : (
              <Sparkles size={14} />
            )
          }
          onClick={onRun}
          disabled={!canRun}
          title={
            canRun
              ? undefined
              : status === 'done'
                ? 'El documento ya fue procesado. Restablece para ejecutarlo otra vez.'
                : 'Adjunta un documento para poder extraer'
          }
        >
          {isExtracting ? 'Extrayendo…' : method === 'manual' ? 'Leer PDF' : 'Ejecutar extracción'}
        </Button>
      </div>
    </div>
  )
}
