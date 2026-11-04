import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

config({ path: path.resolve('../frontend/cypress/evidence/private/.env.final'), quiet: true })
config({ quiet: true })
const { poolPromise, sql } = await import('../src/config/db.js')
const output = path.resolve(process.env.GW_EVIDENCE_DIR || '../frontend/cypress/evidence/final-20261009-reintento')
try {
  const loginResponse = await fetch('http://127.0.0.1:4000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: process.env.CYPRESS_USER_EMAIL, contrasena: process.env.CYPRESS_USER_PASSWORD }),
  })
  if (loginResponse.status !== 200) throw new Error(`Login: HTTP ${loginResponse.status}`)
  const session = await loginResponse.json()
  const pool = await poolPromise
  const result = await pool.request().input('id_usuario', sql.Int, session.usuario.id_usuario).query(`
    SELECT i.id_inscripcion,i.id_curso,c.titulo,i.estado,i.progreso_general,i.fecha_finalizacion,
           COUNT(cert.id_certificado) AS cantidad_certificados
    FROM dbo.inscripciones i JOIN dbo.cursos c ON c.id_curso=i.id_curso
    LEFT JOIN dbo.certificados cert ON cert.id_inscripcion=i.id_inscripcion
    WHERE i.id_usuario=@id_usuario
    GROUP BY i.id_inscripcion,i.id_curso,c.titulo,i.estado,i.progreso_general,i.fecha_finalizacion
    ORDER BY i.id_inscripcion;
    SELECT cert.id_certificado,cert.id_inscripcion,cert.codigo_certificado,cert.fecha_emision,cert.url_certificado,
           i.id_curso,i.estado,i.progreso_general,i.fecha_finalizacion
    FROM dbo.certificados cert JOIN dbo.inscripciones i ON i.id_inscripcion=cert.id_inscripcion
    WHERE i.id_usuario=@id_usuario ORDER BY cert.id_certificado;
  `)
  const enrollments = result.recordsets[0]
  const certificates = result.recordsets[1]
  const checks = {
    completados_con_100_y_fecha: enrollments.filter((i) => i.estado === 'completado')
      .every((i) => Number(i.progreso_general) === 100 && i.fecha_finalizacion),
    incompletos_sin_certificados: enrollments.filter((i) => i.estado !== 'completado')
      .every((i) => i.cantidad_certificados === 0),
    maximo_un_certificado_por_inscripcion: enrollments.every((i) => i.cantidad_certificados <= 1),
    certificados_persistidos: certificates.length > 0,
    certificados_con_ruta_de_descarga: certificates.every((c) => c.url_certificado === `/api/certificados/${c.id_certificado}/descargar`),
  }
  const cleanup = await fetch('http://127.0.0.1:4000/api/usuarios/me', {
    method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` },
  })
  const report = { fecha: new Date().toISOString(), inscripciones: enrollments, certificados: certificates,
    comprobaciones: checks, cuenta_prueba_desactivada_http: cleanup.status,
    verificado: Object.values(checks).every(Boolean) && cleanup.status === 200 }
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'persistencia-sql-final.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ comprobaciones: checks, cuenta_prueba_desactivada_http: cleanup.status,
    verificado: report.verificado }, null, 2))
  if (!report.verificado) process.exitCode = 1
} finally {
  const pool = await poolPromise
  await pool.close()
}
