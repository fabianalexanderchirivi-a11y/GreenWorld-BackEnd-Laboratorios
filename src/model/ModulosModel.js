import { poolPromise,sql } from '../config/db.js'
import { httpError } from '../services/learningRules.js'
const listarModulos=async()=>{const pool=await poolPromise;return(await pool.request().execute('dbo.usp_ListarModulos')).recordset}
// Conserva contenido de cursos con participaciones hasta definir su versionado.
async function mutate(procedure,id,modulo){
 const pool=await poolPromise,tx=new sql.Transaction(pool)
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
 try{
  const current=id?await new sql.Request(tx).input('id',sql.Int,id).query('SELECT id_curso FROM dbo.modulos WITH(UPDLOCK,HOLDLOCK) WHERE id_modulo=@id'):null
  if(id&&!current.recordset.length)throw httpError(404,'El módulo no existe')
  const oldCourse=current?.recordset[0].id_curso||modulo.id_curso
  const blocked=await new sql.Request(tx).input('old',sql.Int,oldCourse).input('new',sql.Int,modulo?.id_curso||oldCourse).query('SELECT id_inscripcion FROM dbo.inscripciones WITH(UPDLOCK,HOLDLOCK) WHERE id_curso IN(@old,@new)')
  if(blocked.recordset.length)throw httpError(409,'Este curso ya tiene participaciones. Conserva sus módulos y crea otra versión del curso para cambiar el contenido.')
  const req=new sql.Request(tx)
  if(id)req.input('id_modulo',sql.Int,id)
  if(modulo){
   req.input('id_curso',sql.Int,modulo.id_curso).input('titulo',sql.NVarChar(150),modulo.titulo)
    .input('descripcion',sql.NVarChar(sql.MAX),modulo.descripcion||'').input('contenido',sql.NVarChar(sql.MAX),modulo.contenido||'')
    .input('video_url',sql.NVarChar(255),modulo.video_url||'').input('orden_modulo',sql.Int,modulo.orden_modulo)
    .input('duracion_estimada',sql.NVarChar(50),modulo.duracion_estimada||'').input('estado',sql.NVarChar(20),modulo.estado)
  }
  const result=await req.execute(procedure);await tx.commit();return result.recordset
 }catch(e){await tx.rollback().catch(()=>{});throw e}
}
const insertarModulo=m=>mutate('dbo.usp_InsertarModulo',null,m)
const editarModulo=(id,m)=>mutate('dbo.usp_EditarModulo',id,m)
const eliminarModulo=id=>mutate('dbo.usp_EliminarModulo',id)
export {listarModulos,insertarModulo,editarModulo,eliminarModulo}
