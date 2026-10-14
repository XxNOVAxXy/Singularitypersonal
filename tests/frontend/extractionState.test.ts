import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canRunExtraction,
  initialExtractionRunState,
  isExtractionBusy,
  reduceExtractionRunState,
} from '../../src/features/extraction/utils/extractionState.ts'

test('el estado inicial está listo y sin error', () => {
  assert.equal(initialExtractionRunState.status, 'ready')
  assert.equal(initialExtractionRunState.error, null)
})

test('start pasa a extracting y limpia el error previo', () => {
  const failed = reduceExtractionRunState(initialExtractionRunState, {
    type: 'fail',
    message: 'boom',
  })
  const started = reduceExtractionRunState(failed, { type: 'start' })
  assert.equal(started.status, 'extracting')
  assert.equal(started.error, null)
})

test('start es idempotente mientras se está procesando', () => {
  const started = reduceExtractionRunState(initialExtractionRunState, {
    type: 'start',
  })
  const again = reduceExtractionRunState(started, { type: 'start' })
  assert.equal(again, started)
})

test('succeed marca el estado como done', () => {
  const started = reduceExtractionRunState(initialExtractionRunState, {
    type: 'start',
  })
  const done = reduceExtractionRunState(started, { type: 'succeed' })
  assert.equal(done.status, 'done')
  assert.equal(done.error, null)
})

test('fail guarda el mensaje de error', () => {
  const failed = reduceExtractionRunState(initialExtractionRunState, {
    type: 'fail',
    message: 'Servicio no disponible',
  })
  assert.equal(failed.status, 'error')
  assert.equal(failed.error, 'Servicio no disponible')
})

test('reset vuelve al estado inicial', () => {
  const failed = reduceExtractionRunState(initialExtractionRunState, {
    type: 'fail',
    message: 'x',
  })
  const reset = reduceExtractionRunState(failed, { type: 'reset' })
  assert.deepEqual(reset, initialExtractionRunState)
})

test('canRunExtraction es falso solo durante la extracción', () => {
  assert.equal(canRunExtraction({ status: 'ready', error: null }), true)
  assert.equal(canRunExtraction({ status: 'done', error: null }), true)
  assert.equal(canRunExtraction({ status: 'error', error: 'x' }), true)
  assert.equal(canRunExtraction({ status: 'extracting', error: null }), false)
})

test('isExtractionBusy refleja el estado de procesamiento', () => {
  assert.equal(isExtractionBusy({ status: 'extracting', error: null }), true)
  assert.equal(isExtractionBusy({ status: 'ready', error: null }), false)
})
