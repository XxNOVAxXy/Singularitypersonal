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
  extractFromFile,
} from '@/services/extractionService'

export interface NewFieldInput {
  label: string
  kind: FieldKind
}

export function useExtraction(
  document: PolicyDocument | null,
  method: ExtractionMethod,
  attachment: File | null,
  attachmentError: string | null,
) {
  const [fields, setFields] = useState<ExtractionField[]>([])
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
    if (!document) {
      setFields([])
      return
    }
    // El método manual reconstruye los campos; Gemini parte vacío y espera
    // a que el usuario adjunte un documento y ejecute la extracción.
    setFields(method === 'manual' ? buildManualFields(document) : [])
  }, [document, method, attachment, invalidate])

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

  const runGemini = useCallback(async () => {
    if (method !== 'gemini' || !document || !attachment || attachmentError) return
    if (busyRef.current) return

    busyRef.current = true
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'start' })
    setFields([])

    try {
      const result = await extractFromFile(
        { policyType: document.policyType, file: attachment },
        { signal: controller.signal },
      )
      if (requestIdRef.current !== requestId) return
      setFields(result.fields)
      dispatch({ type: 'succeed' })
      setLastRunAt(new Date().toISOString())
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      const message =
        error instanceof ExtractionServiceError
          ? error.message
          : 'Ocurrió un error inesperado al extraer la información.'
      dispatch({ type: 'fail', message })
    } finally {
      busyRef.current = false
    }
  }, [method, document, attachment, attachmentError])

  const reset = useCallback(() => {
    invalidate()
    dispatch({ type: 'reset' })
    setLastRunAt(null)
    setFields(document && method === 'manual' ? buildManualFields(document) : [])
  }, [invalidate, document, method])

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
    method === 'gemini' &&
    Boolean(document) &&
    Boolean(attachment) &&
    !attachmentError &&
    !isExtracting

  return {
    fields,
    grouped,
    summary,
    reviewFields,
    json,
    status: runState.status,
    error: runState.error,
    isExtracting,
    canRun,
    lastRunAt,
    updateField,
    addField,
    removeField,
    runGemini,
    reset,
  }
}
