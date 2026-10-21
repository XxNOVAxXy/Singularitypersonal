import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import type { ExtractionField, ExtractionMethod, PolicyDocument, PolicyType } from '@/types'
import { documents, getDocumentById } from '@/mocks/documents'
import { EmptyState } from '@/components/ui/EmptyState'
import { useExtraction } from '@/features/extraction/hooks/useExtraction'
import { resolveSearchParamNavigation } from '@/features/extraction/utils/documentNavigation'
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
import {
  deleteDocument as deleteDocumentRecord,
  loadCatalogDocuments,
  registerManualDocument,
  type CatalogDocument,
} from '@/services/documentService'
import {
  filterDeletedDocuments,
  isDemoMode,
  markDemoDocumentDeleted,
  mergeCatalogDocuments,
  readDeletedDemoIds,
} from '@/features/extraction/utils/catalog'

interface PendingExtraction {
  email?: { fromName?: string; fromEmail?: string; receivedAt?: string; id?: string; source?: string }
  attachment?: { id?: string; documentId?: string; name?: string; sizeKb?: number; previewUrl?: string; downloadUrl?: string }
  result?: { documentId?: string; document?: { pageCount?: number }; policyType?: string }
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
  return isDemoMode() ? (documents[0]?.id ?? '') : ''
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
  const result = pending.result
  const source = pending.email?.source === 'imap' ? 'imap' : 'gmail'
  const receivedLabel = source === 'imap' ? 'Documento recibido por correo' : 'Documento recibido por Gmail'
  return {
    id: result?.documentId ?? pending.attachment.documentId ?? pending.attachment.id,
    name: pending.attachment.name,
    policyType: resolvePolicyType(result?.policyType),
    insurer: receivedLabel,
    client: pending.email?.fromName ?? pending.email?.fromEmail ?? 'Cuenta de correo',
    policyNumber: '',
    fileType: 'pdf',
    pages: result?.document?.pageCount ?? 1,
    sizeKb: pending.attachment.sizeKb ?? 0,
    receivedAt: pending.email?.receivedAt ?? new Date().toISOString(),
    status: 'in_review',
    emailId: pending.email?.id,
    source,
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

function toPolicyDocument(record: CatalogDocument): PolicyDocument {
  const result = record.result as {
    document?: { pageCount?: number }
    policyType?: string
    extractedAt?: string
    fields?: Array<{ key?: string; value?: unknown }>
  } | undefined
  const origin = record.origin === 'imap' || record.origin === 'gmail' ? record.origin : record.origin === 'demo' ? 'demo' : 'manual'
  const source = record.sources?.find(
    (item): item is { messageId?: string; attachmentId?: string; accountId?: string } =>
      typeof item === 'object' && item !== null,
  )
  const attachmentKey = source?.attachmentId ?? record.id
  let baseUrl: string
  if (origin === 'gmail' && source?.messageId) {
    baseUrl = `/api/gmail/attachments/${encodeURIComponent(source.messageId)}/${encodeURIComponent(attachmentKey)}`
  } else if (origin === 'imap' && source?.messageId && source.accountId) {
    baseUrl = `/api/imap/attachments/${encodeURIComponent(source.messageId)}/${encodeURIComponent(attachmentKey)}?account_id=${encodeURIComponent(source.accountId)}`
  } else {
    baseUrl = `/api/documents/${encodeURIComponent(record.id)}/file`
  }
  const policyNumber = result?.fields?.find((field) => field.key === 'policy_number')?.value
  const receivedAt = result?.extractedAt ?? record.uploadedAt ?? record.createdAt ?? new Date().toISOString()
  const insurerLabel = origin === 'gmail'
    ? 'Documento recibido por Gmail'
    : origin === 'imap'
      ? 'Documento recibido por correo'
      : origin === 'demo'
        ? 'Documento de demostración'
        : 'Documento adjunto manual'
  return {
    id: record.id,
    name: record.filename,
    policyType: resolvePolicyType(result?.policyType),
    insurer: insurerLabel,
    client: source?.messageId ? `Mensaje ${source.messageId.slice(0, 8)}` : origin === 'manual' ? 'Archivo local' : 'Cuenta de correo',
    policyNumber: policyNumber == null ? '' : String(policyNumber),
    fileType: 'pdf',
    pages: result?.document?.pageCount ?? 1,
    sizeKb: record.sizeBytes ? Math.round(record.sizeBytes / 1024) : 0,
    receivedAt,
    status: record.status === 'extracted'
      ? 'in_review'
      : record.status === 'not-policy'
        ? 'reviewed'
        : record.status === 'error'
          ? 'error'
          : 'pending',
    source: origin === 'demo' ? 'demo' : origin,
    previewUrl: baseUrl,
    downloadUrl: baseUrl ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}download=true` : undefined,
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
  const [deletedDemoIds, setDeletedDemoIds] = useState<Set<string>>(() => readDeletedDemoIds())
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogDegradedReason, setCatalogDegradedReason] = useState<string | null>(null)
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [catalogReloadToken, setCatalogReloadToken] = useState(0)

  const availableDocuments = useMemo(
    () => {
      const baseDocuments = filterDeletedDocuments(
        mergeCatalogDocuments<PolicyDocument>(
          storedDocuments,
          documents,
          isDemoMode(),
        ),
        deletedDemoIds,
      )
      const all = pendingDocument
        ? [pendingDocument, ...baseDocuments]
        : baseDocuments
      return all.filter((document, index, list) => list.findIndex((item) => item.id === document.id) === index)
    },
    [pendingDocument, storedDocuments, deletedDemoIds],
  )
  const [selectedId, setSelectedId] = useState<string>(() =>
    resolveInitialId(searchParams.get('document'), pendingDocument?.id),
  )
  const [method, setMethod] = useState<ExtractionMethod>('gemini')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCatalogDocuments()
      .then(({ documents: records, degraded, degradedReason }) => {
        if (cancelled) return
        setStoredDocuments(records.map(toPolicyDocument))
        setCatalogDegradedReason(degraded ? degradedReason : null)
      })
      .catch((error) => {
        if (cancelled) return
        setStoredDocuments([])
        setCatalogDegradedReason(null)
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar el catálogo de documentos.',
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCatalog(false)
      })
    return () => {
      cancelled = true
    }
  }, [catalogReloadToken])

  useEffect(() => {
    const navigation = resolveSearchParamNavigation(
      searchParams.get('document'),
      selectedId,
      availableDocuments.map((document) => document.id),
    )
    if (!navigation) return
    // Al cambiar a un documento distinto el archivo adjunto previo deja de ser
    // válido, por lo que la navegación por URL también lo invalida.
    if (navigation.clearAttachment) {
      setAttachment(null)
      setAttachmentError(null)
    }
    setSelectedId(navigation.documentId)
    try {
      window.sessionStorage.setItem(LAST_EXTRACTION_DOCUMENT_KEY, navigation.documentId)
    } catch {
      // No bloquea el cambio de documento.
    }
  }, [availableDocuments, searchParams, selectedId])

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
    persistNotice,
    isExtracting,
    canRun,
    lastRunAt,
    updateField,
    addField,
    removeField,
    runExtraction,
    reset,
    save,
    isDirty,
    isSaving,
  } = useExtraction(selectedDocument, method, attachment, attachmentError, pendingFields)

  const handleSelect = async (id: string) => {
    // Cada documento es un origen distinto: descarta el archivo adjunto previo.
    if (method === 'manual' && isDirty) {
      const confirmed = window.confirm('Hay cambios sin guardar. ¿Guardar antes de continuar?')
      if (confirmed) {
        const ok = await save()
        if (!ok) return
      } else {
        return
      }
    }
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

  const handleSelectFile = async (file: File | null) => {
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
    // Registra el documento en el backend ANTES de asociarle resultados para
    // obtener un ID propio; nunca reutiliza el ID de un mock ni el anterior.
    try {
      const registered = await registerManualDocument(file)
      const document = toPolicyDocument(registered)
      setStoredDocuments((current) => [
        document,
        ...current.filter((item) => item.id !== document.id),
      ])
      setSelectedId(document.id)
      setSearchParams({ document: document.id }, { replace: true })
      try {
        window.sessionStorage.setItem(LAST_EXTRACTION_DOCUMENT_KEY, document.id)
      } catch {
        // La selección inicial puede continuar sin almacenamiento de sesión.
      }
    } catch (error) {
      // Sin backend se conserva el flujo local con el archivo en memoria, pero
      // el fallo de registro se muestra para que no pase desapercibido.
      setAttachmentError(
        error instanceof Error && error.message
          ? `No se pudo registrar el documento en el servidor: ${error.message}. Se usará el archivo adjunto sin registrar.`
          : 'No se pudo registrar el documento en el servidor. Se usará el archivo adjunto sin registrar.',
      )
    }
  }

  const handleDeleteDocument = async (document: PolicyDocument) => {
    const confirmed = window.confirm(
      `¿Eliminar "${document.name}"? También se borrarán sus extracciones guardadas.`,
    )
    if (!confirmed) return
    if (document.source === 'demo') {
      markDemoDocumentDeleted(document.id)
      setDeletedDemoIds((current) => new Set(current).add(document.id))
      if (selectedId === document.id) {
        const next = availableDocuments.find((item) => item.id !== document.id)
        setSelectedId(next?.id ?? '')
      }
      return
    }
    try {
      await deleteDocumentRecord(document.id)
      setStoredDocuments((current) => current.filter((item) => item.id !== document.id))
      if (selectedId === document.id) {
        const next = availableDocuments.find((item) => item.id !== document.id)
        setSelectedId(next?.id ?? '')
      }
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : 'No se pudo eliminar el documento.',
      )
    }
  }

  if (!selectedDocument) {
    if (isLoadingCatalog) {
      return (
        <EmptyState
          title="Cargando documentos…"
          description="Consultando el catálogo de documentos."
        />
      )
    }
    if (catalogError) {
      return (
        <EmptyState
          icon={<AlertTriangle size={26} />}
          title="No se pudo cargar el catálogo de documentos"
          description={catalogError}
          action={
            <button
              type="button"
              onClick={() => {
                setCatalogError(null)
                setIsLoadingCatalog(true)
                setCatalogReloadToken((token) => token + 1)
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Reintentar
            </button>
          }
        />
      )
    }
    return (
      <EmptyState
        title="No hay documentos disponibles"
        description="Sube un documento, o extrae un PDF desde Correos (Gmail o IMAP), para comenzar la extracción."
      />
    )
  }

  const showReadyState =
    method === 'gemini' && status === 'ready' && grouped.general.length === 0

  return (
    <div className="space-y-3">
      {catalogDegradedReason ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          Catálogo en modo compatible: no se pudo acceder a la ruta unificada de documentos ({catalogDegradedReason}). Se muestra el registro disponible y no se pueden registrar documentos nuevos.
        </div>
      ) : null}
      {/* Workspace documental: izquierda carga, centro PDF, derecha extracción */}
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(225px,24fr)_minmax(0,46fr)_minmax(285px,30fr)] 2xl:grid-cols-[minmax(245px,23fr)_minmax(0,49fr)_minmax(315px,28fr)]">
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:pr-1" aria-label="Gestión de documentos">
          <GeminiDocumentInput
            title={method === 'manual' ? 'Documento para lectura manual' : 'Subir documento'}
            subtitle={method === 'manual' ? 'Lectura local del PDF, sin Gemini. Puedes corregir los campos.' : undefined}
            pdfOnly={method === 'manual'}
            fileName={attachment?.name ?? (selectedDocument.downloadUrl ? selectedDocument.name : selectedDocument?.id === pendingDocument?.id ? pendingDocument.name : null)}
            disabled={isExtracting}
            error={attachmentError}
            onSelect={handleSelectFile}
          />
          <DocumentSelector
            documents={availableDocuments}
            selectedId={selectedDocument.id}
            onSelect={handleSelect}
          />
          {selectedDocument.source === 'manual' || selectedDocument.source === 'demo' ? (
            <button
              type="button"
              onClick={() => void handleDeleteDocument(selectedDocument)}
              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Eliminar documento
            </button>
          ) : null}
        </aside>

        <main className="min-w-0 xl:sticky xl:top-4" aria-label="Visualización del PDF">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E2E4E8] bg-white shadow-sm [&_iframe]:max-w-full [&_canvas]:max-w-full">
            <DocumentViewer document={selectedDocument} />
          </div>
        </main>

        <aside className="min-w-0 space-y-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:pr-1" aria-label="Extracción y validación">
          <ExtractionToolbar
            method={method}
            onChangeMethod={setMethod}
            status={status}
            isExtracting={isExtracting}
            canRun={canRun}
            lastRunAt={lastRunAt}
            onRun={runExtraction}
            onReset={reset}
            onSave={save}
            isDirty={isDirty}
            isSaving={isSaving}
          />
          {fallbackNotice ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
              {fallbackNotice}
            </div>
          ) : null}
          {persistNotice ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
              {persistNotice}
            </div>
          ) : null}
          <ExtractionResults
            summary={summary}
            method={method}
            document={selectedDocument}
            lastRunAt={lastRunAt}
            status={status}
          />
          <ReviewPanel fields={reviewFields} onChange={updateField} />
        </aside>
      </div>

      {isExtracting ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 shadow-sm">
          <Loader2 size={28} className="animate-spin text-graphite" />
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
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
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
