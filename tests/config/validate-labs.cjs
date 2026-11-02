const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const yaml = require('js-yaml')

const root = path.resolve(__dirname, '../..')
const results = []
for (const [part, directory] of [['backend', root], ['frontend', path.resolve(root, '../frontend')]]) {
  const file = path.join(directory, '.github/workflows/ci.yml')
  if (!fs.existsSync(file)) {
    assert.notEqual(part, 'backend', 'Falta workflow del backend')
    results.push({ componente: part, estado: 'No presente en checkout separado; validar en su repositorio' })
    continue
  }
  const doc = yaml.load(fs.readFileSync(file, 'utf8'))
  assert(doc.on.push && doc.on.pull_request === null && doc.on.workflow_dispatch === null)
  assert.equal(doc.permissions.contents, 'read')
  const steps = doc.jobs.verify.steps
  assert(steps.some((s) => s.run?.includes('npm ci')))
  for (const step of steps.filter((s) => s.uses)) assert.match(step.uses, /@[0-9a-f]{40}$/)
  assert(steps.some((s) => s.uses?.startsWith('actions/upload-artifact@') && s.if === 'always()'))
  const scan = steps.find((s) => s.uses?.startsWith('SonarSource/'))
  assert(scan.if.includes("SONAR_ENABLED == 'true'") && scan.if.includes('head.repo.full_name'))
  assert(scan.env.SONAR_TOKEN.includes('secrets.SONAR_TOKEN'))
  if (part === 'backend') assert(steps.some((s) => s.run?.includes('npm run test:ci')))
  else {
    assert(steps.some((s) => s.run?.includes('npm run lint')))
    assert(steps.some((s) => s.run?.includes('npm run build')))
  }
  results.push({ componente: part, yaml: 'Valido', actions_fijadas_por_sha: true, sonar_opcional: true })
}
const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
assert.match(docker, /^FROM node:24-bookworm-slim/m)
assert(docker.includes('npm ci --omit=dev') && docker.includes('USER node'))
assert.match(docker, /CMD \["node", "src\/server.js"\]/)
const copyLines = docker.split('\n').filter((line) => line.startsWith('COPY '))
assert(copyLines.length === 2 && !copyLines.some((line) => /COPY.*\s\.\s/.test(line)))
const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8')
for (const item of ['.env', '.env.*', 'node_modules', 'reports', 'tests']) assert(ignore.split(/\r?\n/).includes(item))
results.push({ componente: 'Docker', validacion_estatica: 'Pasa', construccion: 'No realizada por esta validación estática' })
const collection = JSON.parse(fs.readFileSync(path.join(root, 'tests/postman/GreenWorld.postman_collection.json'), 'utf8'))
assert.equal(collection.item.length, 8)
for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert(collection.item.some((item) => item.request.method === method))
const snapshot = path.resolve(root, '../publicacion-20261013.json')
if (fs.existsSync(snapshot)) {
  const original = JSON.parse(fs.readFileSync(snapshot, 'utf8')).find((item) => item.part === 'frontend')
  const official = original.changes.filter((item) => item.path.startsWith('cypress/e2e/ppi/'))
  assert.equal(official.length, 8)
  for (const item of official) {
    const current = fs.readFileSync(path.resolve(root, '../frontend', item.path), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(current, item.content, `Cypress modificado: ${item.path}`)
  }
  results.push({ componente: 'Cypress oficial', archivos_sin_cambios: 8 })
}
fs.mkdirSync(path.join(root, 'reports'), { recursive: true })
fs.writeFileSync(path.join(root, 'reports/configuration-validation.json'), JSON.stringify({ fecha: new Date().toISOString(), resultados: results }, null, 2))
console.log(JSON.stringify(results, null, 2))
