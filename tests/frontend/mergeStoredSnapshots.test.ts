import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeSnapshotsByMethod } from '../../src/features/comparison/utils/mergeStoredSnapshots.ts'

function snapshot(method: 'manual' | 'gemini', id: string) {
  return { id, method, label: id }
}

test('una fuente vacía no anula a la otra', () => {
  const backend = [snapshot('manual', 'backend-manual')]
  const merged = mergeSnapshotsByMethod(backend, [])
  assert.deepEqual(merged.map((item) => item.id), ['backend-manual'])
  assert.deepEqual(
    mergeSnapshotsByMethod([], [snapshot('gemini', 'session-gemini')]).map((item) => item.id),
    ['session-gemini'],
  )
})

test('combina por método cuando cada fuente tiene un método distinto', () => {
  const merged = mergeSnapshotsByMethod(
    [snapshot('manual', 'backend-manual')],
    [snapshot('gemini', 'session-gemini')],
  )
  assert.deepEqual(merged.map((item) => item.method), ['manual', 'gemini'])
  assert.deepEqual(merged.map((item) => item.id), ['backend-manual', 'session-gemini'])
})

test('el backend tiene prioridad sobre la sesión en el mismo método', () => {
  const merged = mergeSnapshotsByMethod(
    [snapshot('manual', 'backend-manual')],
    [snapshot('manual', 'session-manual'), snapshot('gemini', 'session-gemini')],
  )
  assert.equal(merged.length, 2)
  assert.equal(merged.find((item) => item.method === 'manual')?.id, 'backend-manual')
  assert.equal(merged.find((item) => item.method === 'gemini')?.id, 'session-gemini')
})

test('un duplicado dentro de la misma fuente no genera dos entradas', () => {
  const merged = mergeSnapshotsByMethod(
    [snapshot('gemini', 'backend-a'), snapshot('gemini', 'backend-b')],
    [snapshot('gemini', 'session-a'), snapshot('gemini', 'session-b')],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'backend-a')
})
