import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const backend = fileURLToPath(new URL('../', import.meta.url))
const root = path.resolve(backend, '..')
const output = path.join(root, 'ENTREGA_LABORATORIOS_PARA_CHATGPT_20261101')
const files = []
const copy = async (relative) => {
  const source = path.join(root, relative)
  const target = path.join(output, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  const bytes = await readFile(target)
  files.push({ archivo: relative.replaceAll('\\', '/'), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') })
}
const walk = async (relative) => {
  for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, item.name)
    if (item.isDirectory()) await walk(child)
    else await copy(child)
  }
}
for (const relative of [
  'docs/LABORATORIOS_PARA_CHATGPT.md',
  'backend/package.json', 'backend/package-lock.json', 'backend/jest.config.cjs',
  'backend/.github/workflows/ci.yml', 'frontend/.github/workflows/ci.yml',
  'backend/Dockerfile', 'backend/.dockerignore', 'backend/.gitignore', 'frontend/.gitignore',
  'backend/sonar-project.properties', 'frontend/sonar-project.properties',
  'backend/reports/jest-results.json', 'backend/reports/jest-execution.log',
  'backend/reports/coverage/lcov.info', 'backend/reports/coverage/coverage-summary.json',
  'backend/reports/configuration-validation.json', 'backend/reports/configuration-validation.log',
  'backend/reports/npm-ci.log', 'backend/reports/npm-ci-retry.log',
  'frontend/reports/npm-ci.log', 'frontend/reports/eslint.log', 'frontend/reports/build.log',
  'frontend/package.json', 'frontend/package-lock.json',
]) await copy(relative)
for (const directory of ['backend/tests', 'backend/reports/newman']) await walk(directory)

// Los informes de Newman son selectivos. Nunca incluir su summary crudo.
const secretValues = []
for (const relative of ['backend/.env', 'frontend/.env']) {
  const content = await readFile(path.join(root, relative), 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:PASSWORD|JWT_SECRET|CYPRESS_USER_PASSWORD)\s*=\s*(.*?)\s*$/)
    const value = match?.[1].replace(/^['"]|['"]$/g, '')
    if (value?.length > 5) secretValues.push(value)
  }
}
for (const item of files) {
  if (path.basename(item.archivo).startsWith('.env')) throw new Error('Configuración privada no permitida')
  const content = await readFile(path.join(output, item.archivo), 'utf8')
  if (secretValues.some((value) => content.includes(value)) || /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(content)) {
    throw new Error(`Dato sensible detectado en ${item.archivo}`)
  }
}
const tools = {}
for (const name of ['jest', 'supertest', 'newman', 'js-yaml']) {
  tools[name] = JSON.parse(await readFile(path.join(backend, 'node_modules', name, 'package.json'), 'utf8')).version
}
const jest = JSON.parse(await readFile(path.join(backend, 'reports/jest-results.json'), 'utf8'))
const newman = JSON.parse(await readFile(path.join(backend, 'reports/newman/resultado-sanitizado.json'), 'utf8'))
if (!jest.success || !newman.pasa) throw new Error('Las evidencias no confirman aprobación')
const metadata = { fecha: new Date().toISOString(), node: process.version, herramientas: tools,
  unitarias: { suites: jest.numPassedTestSuites, pasan: jest.numPassedTests, fallan: jest.numFailedTests },
  integracion_real: { escenarios: newman.escenarios, solicitudes: newman.solicitudes.length,
    aserciones: newman.aserciones.length, fallos: newman.aserciones.filter((item) => !item.pasa).length },
  github_actions: 'Configurado; no ejecutado en GitHub', docker: 'Validación estática; sin construcción',
  sonarcloud: 'Configurado opcional; sin análisis', archivos: files }
await writeFile(path.join(output, 'MANIFIESTO_SHA256.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ carpeta: output, archivos: files.length + 1, herramientas: tools, secretos_detectados: 0 }, null, 2))
