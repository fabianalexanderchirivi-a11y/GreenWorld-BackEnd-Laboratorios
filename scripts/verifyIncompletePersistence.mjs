import { config } from 'dotenv'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

config({ quiet: true })
const { poolPromise, sql } = await import('../src/config/db.js')
const base = 'http://127.0.0.1:4000/api'
const request = async (method, route, token, body) => {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: response.status, data: await response.json() }
}
let session
let courseId
let report
try {
  const correo = `ppi-negativo-${randomUUID()}@example.test`
  const contrasena = randomBytes(24).toString('base64url')
  const registration = await request('POST', '/auth/register', null, { nombre: 'Prueba', apellido: 'Bloqueo PPI', correo, contrasena })
  if (registration.status !== 201) throw new Error(`Registro: HTTP ${registration.status}`)
  const login = await request('POST', '/auth/login', null, { correo, contrasena })
  if (login.status !== 200) throw new Error(`Login: HTTP ${login.status}`)
  session = login.data
  const courses = await request('GET', '/courses')
  courseId = courses.data.data[0].id_curso
  const started = await request('POST', `/cursos/${courseId}/iniciar`, session.token)
  if (started.status !== 200) throw new Error(`Iniciar: HTTP ${started.status}`)
  const rejected = await request('POST', `/cursos/${courseId}/certificado`, session.token)
  const pool = await poolPromise
  const persisted = await pool.request().input('id_usuario', sql.Int, session.usuario.id_usuario).input('id_curso', sql.Int, courseId)
    .query(`SELECT i.id_inscripcion,i.id_curso,i.estado,i.progreso_general,i.fecha_finalizacion,
                   COUNT(c.id_certificado) AS certificados
            FROM dbo.inscripciones i LEFT JOIN dbo.certificados c ON c.id_inscripcion=i.id_inscripcion
            WHERE i.id_usuario=@id_usuario AND i.id_curso=@id_curso
            GROUP BY i.id_inscripcion,i.id_curso,i.estado,i.progreso_general,i.fecha_finalizacion`)
  const row = persisted.recordset[0]
  report = { fecha: new Date().toISOString(), inicio_http: started.status, emision_http: rejected.status,
    mensaje: rejected.data.message, persistencia_sql_tras_rechazo: row,
    verificado: rejected.status === 409 && row.estado === 'en_progreso' && row.certificados === 0 }
} finally {
  if (session) {
    const cancel = await request('PUT', `/cursos/${courseId}/cancelar`, session.token)
    const deactivate = await request('DELETE', '/usuarios/me', session.token)
    if (report) {
      report.cancelacion_http = cancel.status
      report.cuenta_desactivada_http = deactivate.status
      report.verificado = report.verificado && cancel.status === 200 && deactivate.status === 200
      const output = path.resolve(process.env.GW_EVIDENCE_DIR || '../frontend/cypress/evidence/final-20261009-reintento')
      await writeFile(path.join(output, 'bloqueo-persistencia-sql.json'), JSON.stringify(report, null, 2))
      console.log(JSON.stringify(report, null, 2))
      if (!report.verificado) process.exitCode = 1
    }
  }
  const pool = await poolPromise
  await pool.close()
}
