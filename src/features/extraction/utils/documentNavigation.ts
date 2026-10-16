export interface SearchParamNavigation {
  documentId: string
  clearAttachment: boolean
}

/**
 * Decide si un parámetro `?document=` de la URL debe cambiar el documento
 * activo. Devuelve `null` cuando no hay cambio que aplicar.
 *
 * Al cambiar a un documento distinto, el archivo adjunto previo deja de ser
 * válido para la nueva selección, por lo que la navegación por URL debe
 * invalidarlo igual que hace la selección normal.
 */
export function resolveSearchParamNavigation(
  param: string | null,
  currentDocumentId: string,
  availableDocumentIds: readonly string[],
): SearchParamNavigation | null {
  if (!param) return null
  if (param === currentDocumentId) return null
  if (!availableDocumentIds.includes(param)) return null
  return { documentId: param, clearAttachment: true }
}
