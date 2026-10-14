import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Sparkles } from 'lucide-react'
import type { ExtractionMethod } from '@/types'
import { documents, getDocumentById } from '@/mocks/documents'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useExtraction } from '@/features/extraction/hooks/useExtraction'
import { ExtractionToolbar } from '@/features/extraction/components/ExtractionToolbar'
import { DocumentSelector } from '@/features/extraction/components/DocumentSelector'
import { DocumentViewer } from '@/features/extraction/components/DocumentViewer'
import { ExtractionResults } from '@/features/extraction/components/ExtractionResults'
import { ReviewPanel } from '@/features/extraction/components/ReviewPanel'
import { GeneralFieldsForm } from '@/features/extraction/components/GeneralFieldsForm'
import { SpecificFieldsForm } from '@/features/extraction/components/SpecificFieldsForm'
import { AdditionalFieldsForm } from '@/features/extraction/components/AdditionalFieldsForm'
import { JsonPreview } from '@/features/extraction/components/JsonPreview'
import { GeminiDocumentInput } from '@/features/extraction/components/GeminiDocumentInput'
import { ExtractionErrorState } from '@/features/extraction/components/ExtractionErrorState'
import { validateDocumentFile } from '@/services/documentInput'

function resolveInitialId(param: string | null): string {
  if (param && getDocumentById(param)) return param
  return documents[0]?.id ?? ''
}

export function ExtractionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string>(() =>
    resolveInitialId(searchParams.get('document')),
  )
  const [method, setMethod] = useState<ExtractionMethod>('gemini')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    const param = searchParams.get('document')
    if (param && getDocumentById(param)) {
      setSelectedId(param)
    }
  }, [searchParams])

  const selectedDocument = getDocumentById(selectedId) ?? documents[0] ?? null

  const {
    grouped,
    summary,
    reviewFields,
    json,
    status,
    error,
    isExtracting,
    canRun,
    lastRunAt,
    updateField,
    addField,
    removeField,
    runGemini,
    reset,
  } = useExtraction(selectedDocument, method, attachment, attachmentError)

  const handleSelect = (id: string) => {
    // Cada documento es un origen distinto: descarta el archivo adjunto previo.
    setAttachment(null)
    setAttachmentError(null)
    setSelectedId(id)
    setSearchParams({ document: id }, { replace: true })
  }

  const handleSelectFile = (file: File | null) => {
    if (!file) {
      setAttachment(null)
      setAttachmentError(null)
      return
    }
    const validation = validateDocumentFile(file)
    if (!validation.ok) {
      setAttachment(null)
      setAttachmentError(validation.message ?? 'Archivo no válido.')
      return
    }
    setAttachment(file)
    setAttachmentError(null)
  }

  if (!selectedDocument) {
    return (
      <EmptyState
        title="No hay documentos disponibles"
        description="Carga documentos para comenzar la extracción."
      />
    )
  }

  const showReadyState =
    method === 'gemini' && status === 'ready' && grouped.general.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Extracción de pólizas"
        description="Selecciona un documento, elige el método y revisa los campos extraídos en una sola pantalla."
      />

      <ExtractionToolbar
        method={method}
        onChangeMethod={setMethod}
        status={status}
        isExtracting={isExtracting}
        canRun={canRun}
        lastRunAt={lastRunAt}
        onRun={runGemini}
        onReset={reset}
      />

      {method === 'gemini' ? (
        <GeminiDocumentInput
          fileName={attachment?.name ?? null}
          disabled={isExtracting}
          error={attachmentError}
          onSelect={handleSelectFile}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <DocumentSelector
            documents={documents}
            selectedId={selectedDocument.id}
            onSelect={handleSelect}
          />
        </div>
        <div className="xl:col-span-5">
          <DocumentViewer document={selectedDocument} />
        </div>
        <div className="space-y-6 xl:col-span-4">
          <ExtractionResults
            summary={summary}
            method={method}
            document={selectedDocument}
            lastRunAt={lastRunAt}
            status={status}
          />
          <ReviewPanel fields={reviewFields} onChange={updateField} />
        </div>
      </div>

      {isExtracting ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 shadow-sm">
          <Loader2 size={28} className="animate-spin text-brand-500" />
          <p className="text-sm font-medium text-slate-600">
            Procesando el documento con Gemini AI…
          </p>
          <p className="text-xs text-slate-400">
            Extrayendo información real de {selectedDocument.name}
          </p>
        </div>
      ) : status === 'error' ? (
        <ExtractionErrorState
          message={error ?? 'Ocurrió un error inesperado.'}
          canRetry={canRun}
          onRetry={runGemini}
        />
      ) : showReadyState ? (
        <EmptyState
          icon={<Sparkles size={26} />}
          title="Listo para extraer"
          description="Adjunta el documento (PDF, PNG, JPG o WEBP) y ejecuta la extracción con Gemini AI. También puedes cambiar a captura manual."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <GeneralFieldsForm
              fields={grouped.general}
              onChange={updateField}
              onRemove={removeField}
            />
            <SpecificFieldsForm
              fields={grouped.specific}
              policyType={selectedDocument.policyType}
              onChange={updateField}
              onRemove={removeField}
            />
            <AdditionalFieldsForm
              fields={grouped.additional}
              onChange={updateField}
              onRemove={removeField}
              onAdd={addField}
            />
          </div>
          <div className="xl:col-span-4">
            <JsonPreview data={json} method={method} />
          </div>
        </div>
      )}
    </div>
  )
}
