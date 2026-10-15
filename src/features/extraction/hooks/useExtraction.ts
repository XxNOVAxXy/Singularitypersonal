import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  ExtractionField,
  ExtractionMethod,
  FieldKind,
  PolicyDocument,
} from '@/types'
import { buildManualFields } from '@/mocks/extraction'
import {
  applyUserEdit,
  buildExtractionJson,
  groupFields,
  summarizeExtraction,
} from '@/features/extraction/utils/extractionUtils'
import {
  initialExtractionRunState,
  reduceExtractionRunState,
} from '@/features/extraction/utils/extractionState'
import { toFieldKey } from '@/lib/slug'
import {
  ExtractionServiceError,
  downloadPdf,
  extractFromFile,
  extractWithRules,
} from '@/services/extractionService'

export interface NewFieldInput {
  label: string
  kind: FieldKind
}

interface StoredExtraction {
  fields: ExtractionField[]
  updatedAt: string
}

function storageKey(documentId: string, method: ExtractionMethod): string {
  return `singularity.extraction.${method}.${encodeURIComponent(documentId)}`
}

function readStoredExtraction(
  documentId: string,
  method: ExtractionMethod,
): StoredExtraction | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(documentId, method))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredExtraction>
    return Array.isArray(parsed.fields) && typeof parsed.updatedAt === 'string'
      ? { fields: parsed.fields, updatedAt: parsed.updatedAt }
      : null
  } catch {
    return null
  }
}

function storeExtraction(
  documentId: string,
  method: ExtractionMethod,
  fields: ExtractionField[],
): void {
  if (typeof window === 'undefined') return
  try {
    const value: StoredExtraction = {
      fields,
      updatedAt: new Date().toISOString(),
    }
    window.sessionStorage.setItem(storageKey(documentId, method), JSON.stringify(value))
  } catch {
    // La extracción sigue funcionando aunque el almacenamiento de sesión esté lleno.
  }
}

function clearStoredExtraction(documentId: string, method: ExtractionMethod): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey(documentId, method))
  } catch {
    // No bloquea el restablecimiento del formulario.
  }
}

export function useExtraction(
  document: PolicyDocument | null,
  method: ExtractionMethod,
  attachment: File | null,
  attachmentError: string | null,
  initialFields: ExtractionField[] | null = null,
) {
  const [fields, setFields] = useState<ExtractionField[]>([])
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [runState, dispatch] = useReducer(
    reduceExtractionRunState,
    initialExtractionRunState,
  )
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const invalidate = useCallback(() => {
    requestIdRef.current += 1
    busyRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => {
    invalidate()
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFallbackNotice(null)
    if (!document) {
      setFields([])
      return
    }
    const stored = readStoredExtraction(document.id, method)
    // El método manual reconstruye los campos; una extracción de Gmail puede
    // llegar ya resuelta desde la bandeja de entrada.
    if (method === 'manual') {
      setFields(buildManualFields(document))
    } else if (attachment) {
      // Un archivo nuevo invalida el resultado previo del documento de Gmail.
      setFields([])
    } else if (stored?.fields.length) {
      setFields(stored.fields)
      dispatch({ type: 'succeed' })
      setLastRunAt(stored.updatedAt)
    } else if (initialFields?.length) {
      setFields(initialFields)
      dispatch({ type: 'succeed' })
      setLastRunAt(new Date().toISOString())
    } else {
      setFields([])
    }
  }, [document, method, attachment, initialFields, invalidate])

  useEffect(() => {
    if (!document || runState.status !== 'done' || fields.length === 0) return
    storeExtraction(document.id, method, fields)
  }, [document, method, fields, runState.status])

  const updateField = useCallback((key: string, value: string) => {
    setFields((current) =>
      current.map((field) =>
        field.key === key ? applyUserEdit(field, value) : field,
      ),
    )
  }, [])

  const addField = useCallback((input: NewFieldInput) => {
    setFields((current) => {
      const baseKey = toFieldKey(input.label)
      let key = baseKey
      let suffix = 1
      while (current.some((field) => field.key === key)) {
        key = `${baseKey}_${suffix}`
        suffix += 1
      }
      return [
        ...current,
        {
          key,
          label: input.label,
          kind: input.kind,
          scope: 'additional',
          value: '',
          source: 'user',
          status: 'ok',
          required: false,
        },
      ]
    })
  }, [])

  const removeField = useCallback((key: string) => {
    setFields((current) => current.filter((field) => field.key !== key))
  }, [])

  const runExtraction = useCallback(async () => {
    if (
      !document ||
      attachmentError ||
      (!attachment && !document.downloadUrl) ||
      runState.status === 'done'
    ) return
    if (busyRef.current) return

    busyRef.current = true
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'start' })
    setFields([])
    setFallbackNotice(null)

    let sourceFile: File | null = null
    try {
      sourceFile = attachment ?? await downloadPdf(
        document.downloadUrl as string,
        document.name,
        { signal: controller.signal },
      )
      const fields = method === 'manual'
        ? await extractWithRules(sourceFile, { signal: controller.signal }, document.policyType)
        : (await extractFromFile(
            { policyType: document.policyType, file: sourceFile },
            { signal: controller.signal },
          )).fields
      if (requestIdRef.current !== requestId) return
      setFields(fields)
      dispatch({ type: 'succeed' })
      setLastRunAt(new Date().toISOString())
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      const canUseLocalFallback =
        method === 'gemini' &&
        sourceFile &&
        error instanceof ExtractionServiceError &&
        ['configuration_error', 'authentication_error', 'invalid_request', 'model_output_invalid', 'rate_limited', 'quota_exhausted', 'service_unavailable', 'timeout', 'upstream_error', 'network_error'].includes(error.code)

      if (canUseLocalFallback && sourceFile) {
        try {
          const localFields = await extractWithRules(sourceFile, { signal: controller.signal }, document.policyType)
          if (requestIdRef.current !== requestId) return
          setFields(localFields)
          setFallbackNotice('Gemini no está disponible. Se aplicó extracción local; revisa y edita los campos antes de guardar.')
          dispatch({ type: 'succeed' })
          setLastRunAt(new Date().toISOString())
          return
        } catch {
          // Conserva el error original si el extractor local tampoco responde.
        }
      }
      const message =
        error instanceof ExtractionServiceError
          ? error.message
          : 'Ocurrió un error inesperado al extraer la información.'
      dispatch({ type: 'fail', message })
    } finally {
      busyRef.current = false
    }
  }, [method, document, attachment, attachmentError, runState.status])

  const reset = useCallback(() => {
    invalidate()
    if (document) clearStoredExtraction(document.id, method)
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFallbackNotice(null)
    setFields(document && method === 'manual' ? buildManualFields(document) : initialFields ?? [])
  }, [invalidate, document, method, initialFields])

  const grouped = useMemo(() => groupFields(fields), [fields])
  const summary = useMemo(() => summarizeExtraction(fields), [fields])
  const reviewFields = useMemo(
    () => fields.filter((field) => field.status !== 'ok'),
    [fields],
  )
  const json = useMemo(
    () => buildExtractionJson(document, method, fields),
    [document, method, fields],
  )

  const isExtracting = runState.status === 'extracting'
  const canRun =
    Boolean(document) &&
    Boolean(attachment || document?.downloadUrl) &&
    !attachmentError &&
    runState.status !== 'done' &&
    !isExtracting

  return {
    fields,
    grouped,
    summary,
    reviewFields,
    json,
    status: runState.status,
    error: runState.error,
    fallbackNotice,
    isExtracting,
    canRun,
    lastRunAt,
    updateField,
    addField,
    removeField,
    runExtraction,
    reset,
  }
}
