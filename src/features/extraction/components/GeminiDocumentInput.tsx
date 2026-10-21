import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { ACCEPTED_MIME_TYPES } from '@/services/documentInput'

interface GeminiDocumentInputProps {
  title?: string
  subtitle?: string
  pdfOnly?: boolean
  fileName: string | null
  disabled: boolean
  error: string | null
  onSelect: (file: File | null) => void
}

export function GeminiDocumentInput({
  title = 'Documento para Gemini',
  subtitle = 'El backend de extracción recibe el archivo directamente; la API key nunca se expone al navegador.',
  pdfOnly = false,
  fileName,
  disabled,
  error,
  onSelect,
}: GeminiDocumentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    onSelect(file)
    // Permite volver a seleccionar el mismo archivo más adelante.
    event.target.value = ''
  }

  return (
    <Card
      className="h-full"
      title={title}
      subtitle={subtitle}
      bodyClassName="flex min-h-[74px] items-center p-3.5"
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-carbon px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip size={14} />
          {fileName ? 'Cambiar archivo' : 'Adjuntar archivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={pdfOnly ? 'application/pdf,.pdf' : ACCEPTED_MIME_TYPES.join(',')}
          disabled={disabled}
          onChange={handleChange}
        />

        {fileName ? (
          <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            <FileText size={13} className="text-slate-400" />
            <span className="max-w-[240px] truncate">{fileName}</span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              disabled={disabled}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-50"
              aria-label="Quitar archivo"
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <span className="min-w-0 text-xs text-slate-400">
             {pdfOnly ? 'Ningún PDF seleccionado · PDF (máx. 25 MB)' : 'Ningún archivo seleccionado · PDF, PNG, JPG o WEBP (máx. 25 MB)'}
          </span>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </Card>
  )
}
