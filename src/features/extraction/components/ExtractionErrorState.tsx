import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ExtractionErrorStateProps {
  message: string
  canRetry: boolean
  onRetry: () => void
}

export function ExtractionErrorState({
  message,
  canRetry,
  onRetry,
}: ExtractionErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-6 py-12 text-center">
      <AlertTriangle size={26} className="text-rose-500" />
      <div>
        <p className="text-sm font-semibold text-rose-700">
          No se pudo completar la extracción
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-rose-600">{message}</p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon={<RefreshCw size={14} />}
        onClick={onRetry}
        disabled={!canRetry}
      >
        Reintentar
      </Button>
    </div>
  )
}
