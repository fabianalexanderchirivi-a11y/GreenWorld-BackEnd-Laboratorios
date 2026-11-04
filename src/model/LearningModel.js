import { poolPromise,sql } from '../config/db.js'
import { httpError,requireCompletion } from '../services/learningRules.js'

const bind=(request,user,course)=>request.input('usuario',sql.Int,user).input('curso',sql.Int,course)
export async function completionEvidence(request,enrollment) {
 const result=await request.input('enrollment',sql.Int,enrollment).query(`
 SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN p.completado=1 AND p.porcentaje=100 THEN 1 ELSE 0 END),0) AS completados
 FROM dbo.inscripciones i JOIN dbo.modulos m ON m.id_curso=i.id_curso
 LEFT JOIN dbo.progreso_modulos p ON p.id_inscripcion=i.id_inscripcion AND p.id_modulo=m.id_modulo
 WHERE i.id_inscripcion=@enrollment`)
 return result.recordset[0]
}
async function transaction(work){
 const pool=await poolPromise,tx=new sql.Transaction(pool)
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
 try{const result=await work(tx);await tx.commit();return result}catch(e){await tx.rollback().catch(()=>{});throw e}
}
async function ownEnrollment(tx,user,course){
 const r=await bind(new sql.Request(tx),user,course).query(`SELECT i.* FROM dbo.inscripciones i WITH(UPDLOCK,HOLDLOCK) JOIN dbo.usuarios u ON u.id_usuario=i.id_usuario JOIN dbo.cursos c ON c.id_curso=i.id_curso WHERE i.id_usuario=@usuario AND i.id_curso=@curso AND u.estado='activo' AND c.estado='publicado' AND i.estado<>'cancelado'`)
 if(!r.recordset[0])throw httpError(404,'Primero inscríbete en un curso publicado con una cuenta activa')
 return r.recordset[0]
}
export async function courseLearning(user,course){
 const pool=await poolPromise
 const r=await bind(pool.request(),user,course).query(`SELECT m.id_modulo,m.titulo,m.descripcion,m.contenido,m.video_url,m.orden_modulo,m.estado,COALESCE(p.completado,0) AS completado,COALESCE(p.porcentaje,0) AS porcentaje
 FROM dbo.modulos m JOIN dbo.cursos c ON c.id_curso=m.id_curso
 LEFT JOIN dbo.inscripciones i ON i.id_curso=m.id_curso AND i.id_usuario=@usuario AND i.estado<>'cancelado'
 LEFT JOIN dbo.progreso_modulos p ON p.id_inscripcion=i.id_inscripcion AND p.id_modulo=m.id_modulo
 WHERE m.id_curso=@curso AND c.estado='publicado' AND m.estado='disponible' AND i.id_inscripcion IS NOT NULL
 AND EXISTS(SELECT 1 FROM dbo.usuarios WHERE id_usuario=@usuario AND estado='activo') ORDER BY m.orden_modulo,m.id_modulo`)
 return r.recordset
}
export async function completeModule(user,course,module){
 return transaction(async tx=>{
  const e=await ownEnrollment(tx,user,course)
  const m=await new sql.Request(tx).input('modulo',sql.Int,module).input('curso',sql.Int,course).query(`SELECT id_modulo FROM dbo.modulos WITH(UPDLOCK,HOLDLOCK) WHERE id_modulo=@modulo AND id_curso=@curso AND estado='disponible' AND (LEN(LTRIM(RTRIM(COALESCE(contenido,''))))>0 OR LEN(LTRIM(RTRIM(COALESCE(video_url,''))))>0)`)
  if(!m.recordset.length)throw httpError(409,'El módulo no está disponible o todavía no tiene contenido')
  await new sql.Request(tx).input('inscripcion',sql.Int,e.id_inscripcion).input('modulo',sql.Int,module).query(`IF NOT EXISTS(SELECT 1 FROM dbo.progreso_modulos WHERE id_inscripcion=@inscripcion AND id_modulo=@modulo) INSERT dbo.progreso_modulos(id_inscripcion,id_modulo) VALUES(@inscripcion,@modulo)`)
  // Reutiliza el procedimiento existente: módulos completados / módulos totales.
  await new sql.Request(tx).input('id_inscripcion',sql.Int,e.id_inscripcion).input('id_modulo',sql.Int,module).input('porcentaje',sql.Decimal(5,2),100).input('completado',sql.Bit,true).execute('dbo.usp_ActualizarProgresoModulo')
  await new sql.Request(tx).input('id',sql.Int,e.id_inscripcion).query(`UPDATE dbo.inscripciones SET fecha_finalizacion=COALESCE(fecha_finalizacion,SYSDATETIME()) WHERE id_inscripcion=@id AND estado='completado' AND progreso_general=100`)
  return {modulo:module,...await completionEvidence(new sql.Request(tx),e.id_inscripcion)}
 })
}
export async function finishLearning(user,course){
 return transaction(async tx=>{
  const e=await ownEnrollment(tx,user,course)
  requireCompletion(await completionEvidence(new sql.Request(tx),e.id_inscripcion))
  await new sql.Request(tx).input('id_inscripcion',sql.Int,e.id_inscripcion).execute('dbo.usp_RecalcularProgresoInscripcion')
  const r=await new sql.Request(tx).input('id',sql.Int,e.id_inscripcion).query(`UPDATE dbo.inscripciones SET fecha_finalizacion=COALESCE(fecha_finalizacion,SYSDATETIME()) WHERE id_inscripcion=@id; SELECT id_inscripcion,id_curso,'terminado' AS estado_progreso,progreso_general AS porcentaje_avance,fecha_finalizacion FROM dbo.inscripciones WHERE id_inscripcion=@id`)
  return r.recordset[0]
 })
}
export async function listReviews(course){
 const pool=await poolPromise
 const r=await pool.request().input('curso',sql.Int,course).query(`SELECT r.id_resena,r.id_usuario,r.contenido,r.fecha_actualizacion,u.nombre AS autor FROM dbo.resenas_cursos r JOIN dbo.usuarios u ON u.id_usuario=r.id_usuario JOIN dbo.cursos c ON c.id_curso=r.id_curso WHERE r.id_curso=@curso AND c.estado='publicado' AND u.estado='activo' ORDER BY r.fecha_actualizacion DESC`)
 return r.recordset
}
export async function saveReview(user,course,text){
 return transaction(async tx=>{
  await ownEnrollment(tx,user,course)
  const r=await bind(new sql.Request(tx),user,course).input('texto',sql.NVarChar(2000),text).query(`IF EXISTS(SELECT 1 FROM dbo.resenas_cursos WITH(UPDLOCK,HOLDLOCK) WHERE id_usuario=@usuario AND id_curso=@curso) UPDATE dbo.resenas_cursos SET contenido=@texto,fecha_actualizacion=SYSDATETIME() WHERE id_usuario=@usuario AND id_curso=@curso; ELSE INSERT dbo.resenas_cursos(id_usuario,id_curso,contenido) VALUES(@usuario,@curso,@texto); SELECT id_resena,contenido FROM dbo.resenas_cursos WHERE id_usuario=@usuario AND id_curso=@curso`)
  return r.recordset[0]
 })
}
