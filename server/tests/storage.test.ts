import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scriptPath = fileURLToPath(
  new URL('../../backend/tests/test_storage.py', import.meta.url),
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

test('almacenamiento backend: deduplicación, persistencia y borrado seguro', (t) => {
  if (!hasPython()) {
    t.skip('Python no está disponible en el entorno')
    return
  }
  const result = spawnSync(resolvePython(), [scriptPath], { encoding: 'utf8' })
  assert.equal(
    result.status,
    0,
    `El test de almacenamiento falló:\n${result.stdout}\n${result.stderr}`,
  )
  assert.match(result.stdout, /storage tests passed/)
})
