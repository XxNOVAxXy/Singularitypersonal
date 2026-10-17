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
import {
  clearStoredExtraction,
  readStoredExtraction,
  shouldPersistExtraction,
  writeStoredExtraction,
  type DocumentFields,
  type ExtractionStorage,
} from '@/features/extraction/utils/extractionPersistence'
import { resolveInitialFields } from '@/features/extraction/utils/extractionInitialFields'
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

<<<<<<< HEAD
<<<<<<< Updated upstream
=======
function getSessionStorage(): ExtractionStorage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

>>>>>>> Stashed changes
=======
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

>>>>>>> origin/cambiossosme
export function useExtraction(
  document: PolicyDocument | null,
  method: ExtractionMethod,
  attachment: File | null,
  attachmentError: string | null,
  initialFields: ExtractionField[] | null = null,
) {
<<<<<<< Updated upstream
  const [fields, setFields] = useState<ExtractionField[]>([])
<<<<<<< HEAD
=======
  const [documentFields, setDocumentFields] = useState<DocumentFields>({
    documentId: null,
    fields: [],
  })
  const fields = documentFields.fields
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
>>>>>>> Stashed changes
=======
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
>>>>>>> origin/cambiossosme
  const [runState, dispatch] = useReducer(
    reduceExtractionRunState,
    initialExtractionRunState,
  )
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [savedFields, setSavedFields] = useState<ExtractionField[] | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

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
      setDocumentFields({ documentId: null, fields: [] })
      return
    }
<<<<<<< HEAD
<<<<<<< Updated upstream
    // El método manual reconstruye los campos; Gemini parte vacío y espera
    // a que el usuario adjunte un documento y ejecute la extracción.
    setFields(method === 'manual' ? buildManualFields(document) : [])
  }, [document, method, attachment, invalidate])
=======
    const stored = readStoredExtraction(document.id, method, getSessionStorage())
    const resolution = resolveInitialFields({
      documentId: document.id,
      method,
      storedFields: stored?.fields ?? null,
      hasAttachment: Boolean(attachment),
      initialFields: initialFields ?? null,
      blankManualFields: method === 'manual' ? buildManualFields(document) : [],
    })
    setDocumentFields({ documentId: resolution.documentId, fields: resolution.fields })
    if (resolution.source === 'manual-restored' || resolution.source === 'stored') {
      setSavedFields(resolution.fields.slice())
      setSavedAt(stored?.updatedAt ?? null)
    } else {
      setSavedFields(null)
      setSavedAt(null)
    }
    if (resolution.source === 'stored') {
      dispatch({ type: 'succeed' })
      setLastRunAt(stored?.updatedAt ?? null)
    } else if (resolution.source === 'initial') {
      dispatch({ type: 'succeed' })
      setLastRunAt(new Date().toISOString())
=======
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
>>>>>>> origin/cambiossosme
    }
  }, [document, method, attachment, initialFields, invalidate])

  useEffect(() => {
<<<<<<< HEAD
    if (!document) return
    // Solo se persisten campos que pertenecen al documento activo. Así, durante
    // la transición A → B el efecto no puede guardar los campos de A bajo el ID
    // de B, aunque el estado de React aún no se haya actualizado.
    if (!shouldPersistExtraction(document.id, runState.status, documentFields)) return
    writeStoredExtraction(document.id, method, documentFields.fields, getSessionStorage())
  }, [document, method, documentFields, runState.status])
>>>>>>> Stashed changes
=======
    if (!document || runState.status !== 'done' || fields.length === 0) return
    storeExtraction(document.id, method, fields)
  }, [document, method, fields, runState.status])
>>>>>>> origin/cambiossosme

  const updateField = useCallback((key: string, value: string) => {
    setDocumentFields((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === key ? applyUserEdit(field, value) : field,
      ),
    }))
  }, [])

  const addField = useCallback((input: NewFieldInput) => {
    setDocumentFields((current) => {
      const baseKey = toFieldKey(input.label)
      let key = baseKey
      let suffix = 1
      while (current.fields.some((field) => field.key === key)) {
        key = `${baseKey}_${suffix}`
        suffix += 1
      }
      return {
        ...current,
        fields: [
          ...current.fields,
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
        ],
      }
    })
  }, [])

  const removeField = useCallback((key: string) => {
    setDocumentFields((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.key !== key),
    }))
  }, [])

<<<<<<< HEAD
<<<<<<< Updated upstream
  const runGemini = useCallback(async () => {
    if (method !== 'gemini' || !document || !attachment || attachmentError) return
=======
  const isDirty = useCallback(() => {
    if (method !== 'manual') return false
    const current = fields
    const saved = savedFields
    if (!saved) {
      return current.length > 0
    }
    if (current.length !== saved.length) return true
    for (let index = 0; index < current.length; index += 1) {
      const a = current[index]
      const b = saved[index]
      if (!b) return true
      if (
        a.key !== b.key ||
        a.label !== b.label ||
        a.kind !== b.kind ||
        a.scope !== b.scope ||
        a.value !== b.value ||
        a.source !== b.source ||
        a.status !== b.status ||
        a.required !== b.required
      ) {
        return true
      }
    }
    return false
  }, [method, fields, savedFields])

  const save = useCallback(async () => {
    if (!document) return false
    if (method !== 'manual') return false
    const storage = getSessionStorage()
    if (!storage) return false
    try {
      setIsSaving(true)
      const now = new Date().toISOString()
      writeStoredExtraction(document.id, method, fields, storage, now)
      setSavedFields(fields.slice())
      setSavedAt(now)
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
  }, [document, method, fields])

=======
>>>>>>> origin/cambiossosme
  const runExtraction = useCallback(async () => {
    if (
      !document ||
      attachmentError ||
      (!attachment && !document.downloadUrl) ||
      runState.status === 'done'
    ) return
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> origin/cambiossosme
    if (busyRef.current) return

    busyRef.current = true
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'start' })
<<<<<<< Updated upstream
    setFields([])
<<<<<<< HEAD
=======
    setDocumentFields({ documentId: document.id, fields: [] })
    setFallbackNotice(null)
>>>>>>> Stashed changes
=======
    setFallbackNotice(null)
>>>>>>> origin/cambiossosme

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
<<<<<<< HEAD
<<<<<<< Updated upstream
      setFields(result.fields)
=======
      setDocumentFields({ documentId: document.id, fields })
>>>>>>> Stashed changes
=======
      setFields(fields)
>>>>>>> origin/cambiossosme
      dispatch({ type: 'succeed' })
      setLastRunAt(new Date().toISOString())
    } catch (error) {
      if (requestIdRef.current !== requestId) return
<<<<<<< HEAD
<<<<<<< Updated upstream
=======
=======
>>>>>>> origin/cambiossosme
      const canUseLocalFallback =
        method === 'gemini' &&
        sourceFile &&
        error instanceof ExtractionServiceError &&
        ['configuration_error', 'authentication_error', 'invalid_request', 'model_output_invalid', 'rate_limited', 'quota_exhausted', 'service_unavailable', 'timeout', 'upstream_error', 'network_error'].includes(error.code)

      if (canUseLocalFallback && sourceFile) {
        try {
          const localFields = await extractWithRules(sourceFile, { signal: controller.signal }, document.policyType)
          if (requestIdRef.current !== requestId) return
<<<<<<< HEAD
          setDocumentFields({ documentId: document.id, fields: localFields })
=======
          setFields(localFields)
>>>>>>> origin/cambiossosme
          setFallbackNotice('Gemini no está disponible. Se aplicó extracción local; revisa y edita los campos antes de guardar.')
          dispatch({ type: 'succeed' })
          setLastRunAt(new Date().toISOString())
          return
        } catch {
          // Conserva el error original si el extractor local tampoco responde.
        }
      }
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> origin/cambiossosme
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
<<<<<<< HEAD
<<<<<<< Updated upstream
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFields(document && method === 'manual' ? buildManualFields(document) : [])
  }, [invalidate, document, method])
=======
    if (document) clearStoredExtraction(document.id, method, getSessionStorage())
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFallbackNotice(null)
    setSavedFields(null)
    setSavedAt(null)
    setDocumentFields({
      documentId: document?.id ?? null,
      fields: document && method === 'manual'
        ? buildManualFields(document)
        : initialFields ?? [],
    })
  }, [invalidate, document, method, initialFields])
>>>>>>> Stashed changes
=======
    if (document) clearStoredExtraction(document.id, method)
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFallbackNotice(null)
    setFields(document && method === 'manual' ? buildManualFields(document) : initialFields ?? [])
  }, [invalidate, document, method, initialFields])
>>>>>>> origin/cambiossosme

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
    save,
    isDirty: isDirty(),
    savedAt,
    isSaving,
  }
}
