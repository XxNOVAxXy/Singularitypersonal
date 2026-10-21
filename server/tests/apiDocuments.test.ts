import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scriptPath = fileURLToPath(
  new URL('../../backend/tests/test_api_documents.py', import.meta.url),
)

function resolvePython(): string {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const candidate = process.platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'python.exe')
    : join(root, '.venv', 'bin', 'python')
  return existsSync(candidate) ? candidate : 'python'
}

function hasPython(): boolean {
  const python = resolvePython()
  return spawnSync(python, ['--version'], { encoding: 'utf8' }).status === 0
}

test('rutas de documentos (integración FastAPI)', (t) => {
  if (!hasPython()) {
    t.skip('Python no está disponible en el entorno')
    return
  }
  const result = spawnSync(resolvePython(), [scriptPath], { encoding: 'utf8' })
  assert.equal(
    result.status,
    0,
    `La prueba de integración falló:\n${result.stdout}\n${result.stderr}`,
  )
  if (/SKIP:/.test(result.stdout)) {
    t.skip(result.stdout.trim())
    return
  }
  assert.match(result.stdout, /api documents tests passed/)
})
