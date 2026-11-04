import { test, expect } from '@jest/globals'
import { mkdtemp, writeFile, readFile, rm, access, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import yaml from 'js-yaml'
import { spawnSync } from 'node:child_process'
import { redactLogs } from '../integration/redact-logs.mjs'

test('los logs conservan los mensajes útiles y eliminan las dos claves temporales', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'greenworld-log-test-'))
  const file = path.join(dir, 'container.log')
  const secrets = [randomBytes(20).toString('hex'), randomBytes(32).toString('hex')]
  try {
    await writeFile(file, `HTTP 200\n${secrets[0]}\n${secrets[1]}\n${secrets[0]}`)
    await redactLogs([file], secrets)
    const actual = await readFile(file, 'utf8')
    expect(actual).toContain('HTTP 200')
    for (const secret of secrets) expect(actual.includes(secret)).toBe(false)
    expect(actual.match(/\[REDACTADO\]/g)).toHaveLength(3)
  } finally {
    await rm(file, { force: true })
    await rmdir(dir)
  }
})

test('si faltan claves para sanear no conserva el log', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'greenworld-log-test-'))
  const file = path.join(dir, 'container.log')
  try {
    await writeFile(file, 'Log de fixture unitario')
    await expect(redactLogs([file], [undefined, undefined])).rejects.toThrow('No se conservaron logs')
    await expect(access(file)).rejects.toThrow()
  } finally {
    await rmdir(dir)
  }
})

test('el workflow no vuelca a archivos los comandos de enmascarado del smoke', async () => {
  const workflow = yaml.load(await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
  const step = workflow.jobs.verify.steps.find((step) => step.run?.includes('bash tests/integration/docker-smoke.sh'))
  expect(step).toBeDefined()
  expect(/[|>]/.test(step.run)).toBe(false)
})

test('Bash retira los logs incluso si Node no logra arrancar el saneamiento', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'greenworld-shell-test-'))
  const { mkdir } = await import('node:fs/promises')
  await mkdir(path.join(dir, 'reports'))
  try {
    const source = await readFile(new URL('../integration/docker-smoke.sh', import.meta.url), 'utf8')
    const cleanup = source.match(/cleanup\(\) \{[\s\S]*?\n\}/)[0]
    const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
    const execution = spawnSync(shell, ['-c', `
      sql_password=fixture-unitaria-no-real
      jwt_secret=fixture-unitaria-no-real
      docker() { printf 'Log de fixture\n'; return 0; }
      node() { return 23; }
      ${cleanup}
      cleanup
    `], { cwd: dir, encoding: 'utf8' })
    expect(execution.error).toBeUndefined()
    expect(execution.status).toBe(23)
    await expect(access(path.join(dir, 'reports/docker-api.log'))).rejects.toThrow()
    await expect(access(path.join(dir, 'reports/docker-sql.log'))).rejects.toThrow()
  } finally {
    await rm(path.join(dir, 'reports/docker-api.log'), { force: true })
    await rm(path.join(dir, 'reports/docker-sql.log'), { force: true })
    await rmdir(path.join(dir, 'reports'))
    await rmdir(dir)
  }
})
