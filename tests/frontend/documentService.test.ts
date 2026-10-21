import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DocumentServiceError,
  deleteDocument,
  deleteDocumentExtraction,
  getDocumentExtractions,
  getDocuments,
  loadCatalogDocuments,
  registerManualDocument,
  saveDocumentExtraction,
} from '../../src/services/documentService.ts'

type FetchCall = { url: string; init?: RequestInit }

function withFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
): { calls: FetchCall[]; restore: () => void; last: () => FetchCall } {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return handler(call)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
    last: () => calls[calls.length - 1],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('getDocuments lista el catálogo común', async () => {
  const fake = withFetch(() =>
    jsonResponse({ documents: [{ id: 'manual-1', filename: 'p.pdf', origin: 'manual' }] }),
  )
  try {
    const documents = await getDocuments()
    assert.equal(documents.length, 1)
    assert.equal(documents[0].origin, 'manual')
    assert.match(fake.last().url, /\/api\/documents$/)
  } finally {
    fake.restore()
  }
})

test('registerManualDocument envía multipart y devuelve el documento', async () => {
  const fake = withFetch(() =>
    jsonResponse({ id: 'manual-abc', filename: 'p.pdf', origin: 'manual', contentHash: 'abc' }),
  )
  try {
    const file = new File([new Uint8Array([1, 2, 3])], 'p.pdf', { type: 'application/pdf' })
    const document = await registerManualDocument(file)
    assert.equal(document.id, 'manual-abc')
    const call = fake.last()
    assert.equal(call.init?.method, 'POST')
    assert.ok(call.init?.body instanceof FormData)
    assert.match(call.url, /\/api\/documents$/)
  } finally {
    fake.restore()
  }
})

test('saveDocumentExtraction hace PUT con campos y fecha', async () => {
  const fake = withFetch(() =>
    jsonResponse({ extraction: { fields: [], updatedAt: '2026-01-01T00:00:00.000Z' } }),
  )
  try {
    await saveDocumentExtraction('manual-abc', 'gemini', [], '2026-01-01T00:00:00.000Z')
    const call = fake.last()
    assert.equal(call.init?.method, 'PUT')
    assert.match(call.url, /\/api\/documents\/manual-abc\/extractions\/gemini$/)
    const body = JSON.parse(String(call.init?.body))
    assert.equal(body.updatedAt, '2026-01-01T00:00:00.000Z')
  } finally {
    fake.restore()
  }
})

test('getDocumentExtractions devuelve el mapa por método', async () => {
  const fake = withFetch(() =>
    jsonResponse({ extractions: { manual: { fields: [], updatedAt: 't' } } }),
  )
  try {
    const extractions = await getDocumentExtractions('manual-abc')
    assert.ok(extractions.manual)
    assert.match(fake.last().url, /\/api\/documents\/manual-abc\/extractions$/)
  } finally {
    fake.restore()
  }
})

test('deleteDocument propaga el estado 403 de Gmail protegido', async () => {
  const fake = withFetch(() =>
    jsonResponse({ detail: 'Los documentos de Gmail no se pueden eliminar' }, 403),
  )
  try {
    await assert.rejects(
      () => deleteDocument('gmail-fingerprint'),
      (error: unknown) =>
        error instanceof DocumentServiceError &&
        error.status === 403 &&
        /Gmail/.test(error.message),
    )
    assert.equal(fake.last().init?.method, 'DELETE')
  } finally {
    fake.restore()
  }
})

test('deleteDocumentExtraction usa DELETE por método', async () => {
  const fake = withFetch(() => jsonResponse({ remaining: [] }))
  try {
    await deleteDocumentExtraction('manual-abc', 'gemini')
    const call = fake.last()
    assert.equal(call.init?.method, 'DELETE')
    assert.match(call.url, /\/api\/documents\/manual-abc\/extractions\/gemini$/)
  } finally {
    fake.restore()
  }
})

test('un fallo de red produce DocumentServiceError', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('offline')
  }) as typeof fetch
  try {
    await assert.rejects(
      () => getDocuments(),
      (error: unknown) => error instanceof DocumentServiceError,
    )
  } finally {
    globalThis.fetch = original
  }
})

test('loadCatalogDocuments usa el catálogo unificado cuando está disponible', async () => {
  const fake = withFetch(() =>
    jsonResponse({ documents: [{ id: 'manual-1', filename: 'p.pdf', origin: 'manual' }] }),
  )
  try {
    const result = await loadCatalogDocuments()
    assert.equal(result.degraded, false)
    assert.equal(result.documents.length, 1)
    assert.match(fake.last().url, /\/api\/documents$/)
  } finally {
    fake.restore()
  }
})

test('loadCatalogDocuments recurre a la ruta de Gmail si la unificada falla', async () => {
  const fake = withFetch((call) => {
    if (/\/api\/documents$/.test(call.url)) {
      return jsonResponse({ detail: 'not_found' }, 404)
    }
    return jsonResponse({
      documents: [
        { id: 'fp-1', filename: 'póliza.pdf', status: 'extracted', messageId: 'm1', attachmentId: 'a1' },
      ],
    })
  })
  try {
    const result = await loadCatalogDocuments()
    assert.equal(result.degraded, true)
    assert.match(String(result.degradedReason), /not_found/)
    assert.equal(result.documents.length, 1)
    assert.equal(result.documents[0].origin, 'gmail')
    assert.deepEqual(result.documents[0].sources, [{ messageId: 'm1', attachmentId: 'a1' }])
    assert.match(fake.calls[0].url, /\/api\/documents$/)
    assert.match(fake.last().url, /\/api\/gmail\/documents$/)
  } finally {
    fake.restore()
  }
})

test('el fallback de Gmail clasifica como manual lo que no tiene origen de correo', async () => {
  const fake = withFetch((call) => {
    if (/\/api\/documents$/.test(call.url)) {
      return jsonResponse({ detail: 'sin ruta unificada' }, 503)
    }
    return jsonResponse({
      documents: [
        // Documento Gmail: conserva messageId y attachmentId.
        { id: 'fp-g', filename: 'g.pdf', status: 'extracted', messageId: 'm1', attachmentId: 'a1' },
        // Documento manual listado por la ruta de Gmail: sin procedencia de correo.
        { id: 'manual-abc', filename: 'm.pdf', status: 'registered' },
      ],
    })
  })
  try {
    const result = await loadCatalogDocuments()
    assert.equal(result.degraded, true)
    assert.equal(result.documents[0].origin, 'gmail')
    assert.equal(result.documents[1].origin, 'manual')
    assert.deepEqual(result.documents[1].sources, [])
    assert.equal(result.degradedReason, 'sin ruta unificada')
  } finally {
    fake.restore()
  }
})

test('el fallback respeta el origin explicito del backend y protege lo desconocido', async () => {
  const fake = withFetch((call) => {
    if (/\/api\/documents$/.test(call.url)) {
      return jsonResponse({ detail: 'sin ruta unificada' }, 503)
    }
    return jsonResponse({
      documents: [
        // Gmail antiguo sin messageId/attachmentId, pero con origin explícito.
        { id: 'fp-legacy', filename: 'g.pdf', status: 'processing', origin: 'gmail' },
        // Manual con metadatos adicionales.
        {
          id: 'manual-abc',
          filename: 'm.pdf',
          status: 'registered',
          origin: 'manual',
          contentHash: 'abc',
          sizeBytes: 123,
          mimeType: 'application/pdf',
          uploadedAt: '2026-01-01T00:00:00.000Z',
        },
        // Sin origin ni procedencia ni prefijo manual: se protege como Gmail.
        { id: 'desconocido-1', filename: 'x.pdf', status: 'processing' },
      ],
    })
  })
  try {
    const result = await loadCatalogDocuments()
    assert.equal(result.documents[0].origin, 'gmail')
    assert.equal(result.documents[1].origin, 'manual')
    assert.equal(result.documents[1].contentHash, 'abc')
    assert.equal(result.documents[1].sizeBytes, 123)
    assert.equal(result.documents[1].mimeType, 'application/pdf')
    assert.equal(result.documents[1].uploadedAt, '2026-01-01T00:00:00.000Z')
    assert.equal(result.documents[2].origin, 'gmail')
  } finally {
    fake.restore()
  }
})

test('loadCatalogDocuments propaga el error si ambas rutas fallan', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('offline')
  }) as typeof fetch
  try {
    await assert.rejects(
      () => loadCatalogDocuments(),
      (error: unknown) => error instanceof DocumentServiceError,
    )
  } finally {
    globalThis.fetch = original
  }
})
