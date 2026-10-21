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
  canAdoptAsMethod,
  clearStoredExtraction,
  readStoredExtraction,
  shouldPersistExtraction,
  writeStoredExtraction,
  type DocumentFields,
  type ExtractionStorage,
} from '@/features/extraction/utils/extractionPersistence'
import { decideSessionMigration } from '@/features/extraction/utils/catalog'
import { resolveInitialFields } from '@/features/extraction/utils/extractionInitialFields'
import { toFieldKey } from '@/lib/slug'
import {
  ExtractionServiceError,
  downloadPdf,
  extractFromFile,
  extractWithRules,
} from '@/services/extractionService'
import {
  getDocumentExtractions,
  saveDocumentExtraction,
} from '@/services/documentService'

export interface NewFieldInput {
  label: string
  kind: FieldKind
}

function getSessionStorage(): ExtractionStorage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

export function useExtraction(
  document: PolicyDocument | null,
  method: ExtractionMethod,
  attachment: File | null,
  attachmentError: string | null,
  initialFields: ExtractionField[] | null = null,
) {
  const [documentFields, setDocumentFields] = useState<DocumentFields>({
    documentId: null,
    method: null,
    fields: [],
  })
  const fields = documentFields.fields
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [runState, dispatch] = useReducer(
    reduceExtractionRunState,
    initialExtractionRunState,
  )
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [savedFields, setSavedFields] = useState<ExtractionField[] | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [persistNotice, setPersistNotice] = useState<string | null>(null)

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
    setPersistNotice(null)
    if (!document) {
      setDocumentFields({ documentId: null, method: null, fields: [] })
      return
    }
    const stored = readStoredExtraction(document.id, method, getSessionStorage())
    const resolution = resolveInitialFields({
      documentId: document.id,
      method,
      storedFields: stored?.fields ?? null,
      hasAttachment: Boolean(attachment),
      initialFields: initialFields ?? null,
      blankManualFields: method === 'manual' ? buildManualFields(document) : [],
    })
    // Los campos quedan etiquetados con el método que los produce: es lo que
    // impide que un resultado se guarde bajo el método anterior.
    setDocumentFields({
      documentId: resolution.documentId,
      method: resolution.method,
      fields: resolution.fields,
    })
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
    }
  }, [document, method, attachment, initialFields, invalidate])

  useEffect(() => {
    if (!document) return
    // Solo se persisten campos que pertenecen al documento activo Y al método
    // activo. Así, durante la transición de método (por ejemplo Gemini →
    // manual) el efecto no puede guardar el resultado de Gemini bajo el método
    // manual, aunque el estado de React aún no se haya actualizado.
    if (!shouldPersistExtraction(document.id, runState.status, documentFields, method)) return
    const now = new Date().toISOString()
    writeStoredExtraction(document.id, method, documentFields.fields, getSessionStorage(), now)
    // Réplica en el backend; el fallo se avisa sin perder la copia local.
    void saveDocumentExtraction(document.id, method, documentFields.fields, now)
      .then(() => {
        setPersistNotice(null)
      })
      .catch(() => {
        setPersistNotice(
          'No se pudo guardar la extracción en el servidor. Los datos se conservaron en esta sesión.',
        )
      })
  }, [document, method, documentFields, runState.status])

  // Lee primero el backend y, solo si allí no hay nada, migra una copia
  // identificable de sessionStorage sin descartarla hasta verificarla.
  useEffect(() => {
    if (!document) return
    let cancelled = false
    const targetId = document.id
    void (async () => {
      const backend = await getDocumentExtractions(targetId).catch(() => null)
      if (cancelled || backend === null) return
      const remote = backend[method]
      // Un resultado de Gemini guardado bajo la clave manual no se adopta:
      // se hydrataría como si fuera una captura manual.
      if (
        remote &&
        Array.isArray(remote.fields) &&
        remote.fields.length > 0 &&
        canAdoptAsMethod(method, remote.fields)
      ) {
        setDocumentFields({ documentId: targetId, method, fields: remote.fields })
        setSavedFields(remote.fields.slice())
        setSavedAt(remote.updatedAt)
        dispatch({ type: 'succeed' })
        setLastRunAt(remote.updatedAt)
        return
      }
      const stored = readStoredExtraction(targetId, method, getSessionStorage())
      const decision = decideSessionMigration({
        sessionExtraction: stored,
        backendExtraction: null,
        documentId: targetId,
        knownRemoteIds: new Set([targetId]),
        method,
      })
      if (decision !== 'migrate' || !stored) return
      const saved = await saveDocumentExtraction(targetId, method, stored.fields, stored.updatedAt)
        .catch(() => null)
      if (cancelled) return
      if (!saved) {
        // Solo se migra cuando el backend ya conoce el documento; un fallo
        // aquí es inesperado y no debe perderse en silencio.
        setPersistNotice(
          'No se pudo migrar la extracción guardada en esta sesión al servidor. La copia local se conserva.',
        )
        return
      }
      const verify = await getDocumentExtractions(targetId).catch(() => null)
      if (!cancelled && verify && verify[method]) {
        clearStoredExtraction(targetId, method, getSessionStorage())
      }
    })()
    return () => { cancelled = true }
  }, [document, method])

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
    // Solo se guarda el resultado que pertenece al documento y al método
    // activos: un estado heredado de otro método nunca se escribe.
    if (documentFields.documentId !== document.id || documentFields.method !== method) {
      return false
    }
    const storage = getSessionStorage()
    if (!storage) return false
    try {
      setIsSaving(true)
      const now = new Date().toISOString()
      writeStoredExtraction(document.id, method, fields, storage, now)
      const remote = await saveDocumentExtraction(document.id, method, fields, now)
        .then(() => true)
        .catch(() => false)
      setPersistNotice(
        remote
          ? null
          : 'No se pudo guardar la extracción en el servidor. Los datos se conservaron en esta sesión.',
      )
      setSavedFields(fields.slice())
      setSavedAt(now)
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
  }, [document, method, fields, documentFields.documentId, documentFields.method])

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
    setDocumentFields({ documentId: document.id, method, fields: [] })
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
      setDocumentFields({ documentId: document.id, method, fields })
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
          setDocumentFields({ documentId: document.id, method, fields: localFields })
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
    if (document) {
      // Regla de eliminación: solo se borra la copia de sesión del método
      // activo (documentId + método). El resultado del otro método no se
      // toca nunca y la copia guardada en el servidor se conserva, porque
      // "Restablecer" sirve para volver a ejecutar la extracción y no debe
      // perder una captura ya guardada. El borrado del servidor
      // (deleteDocumentExtraction) sigue siendo una acción explícita y
      // acotada a (documentId, método).
      clearStoredExtraction(document.id, method, getSessionStorage())
    }
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFallbackNotice(null)
    setSavedFields(null)
    setSavedAt(null)
    setDocumentFields({
      documentId: document?.id ?? null,
      method,
      fields: document && method === 'manual'
        ? buildManualFields(document)
        : initialFields ?? [],
    })
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
    isDirty: isDirty(),
    savedAt,
    isSaving,
  }
}
