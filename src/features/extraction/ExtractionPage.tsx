import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Sparkles } from 'lucide-react'
import type { ExtractionField, ExtractionMethod, PolicyDocument, PolicyType } from '@/types'
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
import { getGmailDocuments, type GmailDocumentRecord } from '@/services/gmailService'

interface PendingExtraction {
  email?: { fromName?: string; fromEmail?: string; receivedAt?: string; id?: string }
  attachment?: { id?: string; name?: string; sizeKb?: number; previewUrl?: string; downloadUrl?: string }
  result?: unknown
}

const LAST_EXTRACTION_DOCUMENT_KEY = 'singularity.extraction.selectedDocument'

function resolveInitialId(param: string | null, pendingId?: string): string {
  if (param && getDocumentById(param)) return param
  if (param && param === pendingId) return param
  if (pendingId) return pendingId
  try {
    const storedId = window.sessionStorage.getItem(LAST_EXTRACTION_DOCUMENT_KEY)
    if (storedId) return storedId
  } catch {
    // La selección inicial puede continuar sin almacenamiento de sesión.
  }
  return documents[0]?.id ?? ''
}

function readPendingExtraction(): PendingExtraction | null {
  try {
    const raw = sessionStorage.getItem('singularity.pendingExtraction')
    return raw ? JSON.parse(raw) as PendingExtraction : null
  } catch {
    return null
  }
}

function buildPendingDocument(pending: PendingExtraction | null): PolicyDocument | null {
  if (!pending?.attachment?.id || !pending.attachment.name) return null
  const result = pending.result as { document?: { pageCount?: number }; policyType?: string } | undefined
  return {
    id: `gmail-${pending.attachment.id}`,
    name: pending.attachment.name,
    policyType: resolvePolicyType(result?.policyType),
    insurer: 'Documento recibido por Gmail',
    client: pending.email?.fromName ?? pending.email?.fromEmail ?? 'Cuenta de Gmail',
    policyNumber: '',
    fileType: 'pdf',
    pages: result?.document?.pageCount ?? 1,
    sizeKb: pending.attachment.sizeKb ?? 0,
    receivedAt: pending.email?.receivedAt ?? new Date().toISOString(),
    status: 'in_review',
    emailId: pending.email?.id,
    source: 'gmail',
    previewUrl: pending.attachment.previewUrl,
    downloadUrl: pending.attachment.downloadUrl,
    extractionFields: mapPendingFields(pending.result) ?? undefined,
  }
}

function mapPendingFields(result: unknown): ExtractionField[] | null {
  if (!result || typeof result !== 'object' || !Array.isArray((result as { fields?: unknown }).fields)) return null
  return ((result as { fields: unknown[] }).fields).flatMap((item): ExtractionField[] => {
    if (!item || typeof item !== 'object') return []
    const field = item as { key?: unknown; label?: unknown; value?: unknown; category?: unknown; confidence?: unknown; source?: { page?: unknown } }
    if (typeof field.key !== 'string' || typeof field.label !== 'string') return []
    const value = field.value == null ? '' : String(field.value)
    const scope = field.category === 'specific' ? 'specific' : field.category === 'additional' ? 'additional' : 'general'
    const confidence = typeof field.confidence === 'number' ? (field.confidence > 1 ? field.confidence / 100 : field.confidence) : undefined
    return [{
      key: field.key,
      label: field.label,
      kind: field.key.includes('date') ? 'date' : field.key === 'premium' ? 'currency' : 'text',
      scope,
      value,
      source: 'gemini',
      status: value ? 'ok' : 'missing',
      required: scope === 'general',
      confidence,
      page: typeof field.source?.page === 'number' ? field.source.page : undefined,
    }]
  })
}

function resolvePolicyType(value: string | undefined): PolicyType {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('auto')) return 'auto'
  if (normalized.includes('vida')) return 'vida'
  if (normalized.includes('salud') || normalized.includes('gmm')) return 'gmm'
  if (normalized.includes('fianza')) return 'fianza'
  if (normalized.includes('recibo')) return 'recibo'
  return 'danos'
}

function toPolicyDocument(record: GmailDocumentRecord): PolicyDocument {
  const result = record.result as {
    document?: { pageCount?: number }
    policyType?: string
    extractedAt?: string
    fields?: Array<{ key?: string; value?: unknown }>
  } | undefined
  const attachmentKey = record.attachmentKey ?? record.id
  const baseUrl = record.messageId
    ? `/api/gmail/attachments/${encodeURIComponent(record.messageId)}/${encodeURIComponent(attachmentKey)}`
    : `/api/gmail/documents/${encodeURIComponent(record.id)}/file`
  const policyNumber = result?.fields?.find((field) => field.key === 'policy_number')?.value
  return {
    id: record.id,
    name: record.filename,
    policyType: resolvePolicyType(result?.policyType),
    insurer: 'Documento recibido por Gmail',
    client: record.messageId ? `Mensaje ${record.messageId.slice(0, 8)}` : 'Cuenta de Gmail',
    policyNumber: policyNumber == null ? '' : String(policyNumber),
    fileType: 'pdf',
    pages: result?.document?.pageCount ?? 1,
    sizeKb: 0,
    receivedAt: result?.extractedAt ?? record.createdAt ?? new Date().toISOString(),
    status: record.status === 'extracted' ? 'in_review' : record.status === 'not-policy' ? 'reviewed' : 'pending',
    source: 'gmail',
    previewUrl: baseUrl,
    downloadUrl: baseUrl ? `${baseUrl}?download=true` : undefined,
    extractionFields: mapPendingFields(record.result) ?? undefined,
  }
}

export function ExtractionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingExtraction] = useState(readPendingExtraction)
  const [storedDocuments, setStoredDocuments] = useState<PolicyDocument[]>([])
  const pendingDocument = useMemo(
    () => buildPendingDocument(pendingExtraction),
    [pendingExtraction],
  )
  const availableDocuments = useMemo(
    () => {
      const sourceDocuments = storedDocuments.length > 0 ? storedDocuments : documents
      const all = pendingDocument
        ? [pendingDocument, ...sourceDocuments]
        : sourceDocuments
      return all.filter((document, index, list) => list.findIndex((item) => item.id === document.id) === index)
    },
    [pendingDocument, storedDocuments],
  )
  const [selectedId, setSelectedId] = useState<string>(() =>
    resolveInitialId(searchParams.get('document'), pendingDocument?.id),
  )
  const [method, setMethod] = useState<ExtractionMethod>('gemini')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    getGmailDocuments()
      .then((records) => setStoredDocuments(records.map(toPolicyDocument)))
      .catch(() => setStoredDocuments([]))
  }, [])

  useEffect(() => {
    const param = searchParams.get('document')
    if (param && availableDocuments.some((document) => document.id === param)) {
      setSelectedId(param)
    }
  }, [availableDocuments, searchParams])

  const selectedDocument = availableDocuments.find((document) => document.id === selectedId) ?? availableDocuments[0] ?? null
  const pendingFields = useMemo(
    () => selectedDocument?.extractionFields ?? (selectedDocument?.id === pendingDocument?.id ? mapPendingFields(pendingExtraction?.result) : null),
    [pendingDocument?.id, pendingExtraction?.result, selectedDocument?.extractionFields, selectedDocument?.id],
  )

  const {
    grouped,
    summary,
    reviewFields,
    json,
    status,
    error,
    fallbackNotice,
    isExtracting,
    canRun,
    lastRunAt,
    updateField,
    addField,
    removeField,
    runExtraction,
    reset,
  } = useExtraction(selectedDocument, method, attachment, attachmentError, pendingFields)

  const handleSelect = (id: string) => {
    // Cada documento es un origen distinto: descarta el archivo adjunto previo.
    setAttachment(null)
    setAttachmentError(null)
    setSelectedId(id)
    try {
      window.sessionStorage.setItem(LAST_EXTRACTION_DOCUMENT_KEY, id)
    } catch {
      // No bloquea el cambio de documento.
    }
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
        onRun={runExtraction}
        onReset={reset}
      />

      {method === 'gemini' || method === 'manual' ? (
        <GeminiDocumentInput
           title={method === 'manual' ? 'Documento para lectura manual' : undefined}
           subtitle={method === 'manual' ? 'Se extrae el texto del PDF localmente, sin usar Gemini. Después puedes corregir cualquier campo.' : undefined}
           pdfOnly={method === 'manual'}
           fileName={attachment?.name ?? (selectedDocument.downloadUrl ? selectedDocument.name : selectedDocument?.id === pendingDocument?.id ? pendingDocument.name : null)}
          disabled={isExtracting}
          error={attachmentError}
          onSelect={handleSelectFile}
        />
      ) : null}

      {fallbackNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {fallbackNotice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-3">
            <DocumentSelector
                documents={availableDocuments}
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
            {method === 'manual' ? 'Leyendo el PDF con reglas locales…' : 'Procesando el documento con Gemini AI…'}
          </p>
          <p className="text-xs text-slate-400">
            Extrayendo información real de {selectedDocument.name}
          </p>
        </div>
      ) : status === 'error' ? (
        <ExtractionErrorState
          message={error ?? 'Ocurrió un error inesperado.'}
          canRetry={canRun}
           onRetry={runExtraction}
        />
      ) : showReadyState ? (
        <EmptyState
          icon={<Sparkles size={26} />}
          title="Listo para extraer"
           description="Adjunta un documento y ejecuta la extracción. En modo Manual se lee el texto del PDF sin usar Gemini; después puedes editar los campos."
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
