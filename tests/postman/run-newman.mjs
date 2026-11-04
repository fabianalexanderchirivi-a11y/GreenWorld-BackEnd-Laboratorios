import newman from 'newman'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.GW_API_URL || 'http://127.0.0.1:4000/api'
const target = new URL(baseUrl)
if (target.username || target.password) throw new Error('La URL no debe contener credenciales')
if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(target.hostname) && process.env.GW_ALLOW_REMOTE_TESTS !== 'true') {
  throw new Error('Para usar otro host de integración debes autorizarlo con GW_ALLOW_REMOTE_TESTS=true')
}
const collection = JSON.parse(await readFile(new URL('./GreenWorld.postman_collection.json', import.meta.url), 'utf8'))
const dataset = JSON.parse(await readFile(new URL('./auth-ddt.json', import.meta.url), 'utf8'))
const output = path.resolve(process.env.GW_NEWMAN_REPORT_DIR || 'reports/newman')
await mkdir(output, { recursive: true })
const requests = []
const assertions = []
const { error, summary } = await new Promise((resolve) => {
  const run = newman.run({
    collection, iterationData: dataset,
    environment: { values: [{ key: 'baseUrl', value: baseUrl, enabled: true }] },
    reporters: [], timeoutRequest: 15000, timeoutScript: 10000,
  }, (error, summary) => resolve({ error, summary }))
  run.on('request', (error, args) => {
    requests.push({ caso: dataset[args.cursor.iteration]?.caseId, solicitud: args.item.name,
      metodo: args.request.method, http: args.response?.code ?? null, error: error ? error.name : null })
  })
  run.on('assertion', (error, args) => {
    assertions.push({ caso: dataset[args.cursor.iteration]?.caseId, validacion: args.assertion,
      pasa: !error, error: error ? error.name : null })
  })
})
// No se exporta el summary crudo: contiene contraseñas, cabeceras y JWT en memoria.
const report = { fecha: new Date().toISOString(), tipo: 'Integracion real API + SQL Server; sin mocks',
  escenarios: dataset.length, solicitudes: requests, aserciones: assertions,
  estadisticas: summary?.run?.stats ?? null,
  error_ejecucion: error ? { nombre: error.name } : null,
  pasa: !error && !!summary && summary.run.failures.length === 0 && requests.length === dataset.length * collection.item.length }
await writeFile(path.join(output, 'resultado-sanitizado.json'), `${JSON.stringify(report, null, 2)}\n`)
const log = requests.map((item) => `${item.caso} | ${item.metodo} | ${item.solicitud} | HTTP ${item.http}`).join('\n')
const totals = `Escenarios: ${dataset.length}; solicitudes: ${requests.length}; aserciones: ${assertions.length}; fallos: ${summary?.run?.failures.length ?? 'sin resumen'}; resultado: ${report.pasa ? 'Pasa' : 'Falla de ejecución o validación'}`
await writeFile(path.join(output, 'ejecucion.log'), `${log}\n${totals}\n`)
console.log(totals)
if (!report.pasa) process.exitCode = 1
