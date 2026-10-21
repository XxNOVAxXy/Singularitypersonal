import { MAX_DOCUMENT_BYTES, SUPPORTED_MIME_TYPES } from '../../shared/api.ts'
import type { SupportedMimeType } from '../../shared/api.ts'

export const ACCEPTED_MIME_TYPES = SUPPORTED_MIME_TYPES
export const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_BYTES

const EXTENSION_TO_MIME: Record<string, SupportedMimeType> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export interface DocumentInput {
  name: string
  mimeType: SupportedMimeType
  dataBase64: string
}

export interface DocumentValidation {
  ok: boolean
  message?: string
}

/**
 * Determina el tipo MIME soportado a partir del declarado por el navegador
 * o, si no es fiable, de la extensión del archivo.
 */
export function resolveMimeType(
  fileName: string,
  declared?: string,
): SupportedMimeType | null {
  if (
    declared &&
    (SUPPORTED_MIME_TYPES as readonly string[]).includes(declared)
  ) {
    return declared as SupportedMimeType
  }
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TO_MIME[extension] ?? null
}

export function validateDocumentFile(file: {
  name: string
  type: string
  size: number
}): DocumentValidation {
  if (!resolveMimeType(file.name, file.type)) {
    return {
      ok: false,
      message: 'Formato no compatible. Usa PDF, PNG, JPG o WEBP.',
    }
  }
  if (file.size === 0) {
    return { ok: false, message: 'El archivo está vacío.' }
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      message: `El archivo supera el límite de ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`,
    }
  }
  return { ok: true }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function fileToDocumentInput(file: File): Promise<DocumentInput> {
  const mimeType = resolveMimeType(file.name, file.type)
  if (!mimeType) {
    throw new Error('Formato de archivo no compatible.')
  }
  const buffer = await file.arrayBuffer()
  return {
    name: file.name,
    mimeType,
    dataBase64: arrayBufferToBase64(buffer),
  }
}
