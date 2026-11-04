import { randomUUID } from "node:crypto"
import { poolPromise, sql } from "../config/db.js"
import { completionEvidence } from './LearningModel.js'
import { requireCompletion } from '../services/learningRules.js'

const errorHttp = (status, message) => Object.assign(new Error(message), { status })

const enTransaccion = async (work) => {
    const pool = await poolPromise
    const transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    try {
        const result = await work(transaction)
        await transaction.commit()
        return result
    } catch (error) {
        try {
            await transaction.rollback()
        } catch {
            // SQL Server may already have rolled back the transaction.
        }
        throw error
    }
}

const buscarInscripcionBloqueada = async (transaction, id_inscripcion) => {
    const result = await new sql.Request(transaction)
        .input("id_inscripcion", sql.Int, id_inscripcion)
        .query(`
            SELECT i.id_inscripcion, i.id_usuario, i.id_curso, i.estado,
                   i.progreso_general, i.fecha_finalizacion, u.estado AS estado_usuario
            FROM dbo.inscripciones i WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.usuarios u ON u.id_usuario = i.id_usuario
            WHERE i.id_inscripcion = @id_inscripcion
        `)

    return result.recordset[0] || null
}

const exigirCursoCompletado = (inscripcion) => {
    if (!inscripcion) {
        throw errorHttp(404, "La inscripcion indicada no existe")
    }
    if (inscripcion.estado !== "completado" || Number(inscripcion.progreso_general) !== 100 || !inscripcion.fecha_finalizacion) {
        throw errorHttp(409, "El curso debe estar terminado al 100 % para emitir un certificado")
    }
    if(Object.hasOwn(inscripcion,'total')) requireCompletion(inscripcion)
}

const listarCertificado = async () => {
    const con = await poolPromise
    const result = await con.request().execute("dbo.usp_ListarCertificados")
    return result.recordset
}

const insertarCertificado = async (certificado) => enTransaccion(async (transaction) => {
    exigirCursoCompletado(await buscarInscripcionBloqueada(transaction, certificado.id_inscripcion))
    requireCompletion(await completionEvidence(new sql.Request(transaction), certificado.id_inscripcion))

    const result = await new sql.Request(transaction)
        .input("id_inscripcion", sql.Int, certificado.id_inscripcion)
        .input("codigo_certificado", sql.NVarChar(100), certificado.codigo_certificado)
        .input("url_certificado", sql.NVarChar(255), certificado.url_certificado)
        .execute("dbo.usp_InsertarCertificado")

    return result.recordset
})

const editarCertificado = async (id_certificado, certificado) => enTransaccion(async (transaction) => {
    exigirCursoCompletado(await buscarInscripcionBloqueada(transaction, certificado.id_inscripcion))
    requireCompletion(await completionEvidence(new sql.Request(transaction), certificado.id_inscripcion))

    const result = await new sql.Request(transaction)
        .input("id_certificado", sql.Int, id_certificado)
        .input("id_inscripcion", sql.Int, certificado.id_inscripcion)
        .input("codigo_certificado", sql.NVarChar(100), certificado.codigo_certificado)
        .input("url_certificado", sql.NVarChar(255), certificado.url_certificado)
        .execute("dbo.usp_EditarCertificado")

    return result.recordset
})

const eliminarCertificado = async (id_certificado) => {
    const con = await poolPromise
    const result = await con.request()
        .input("id_certificado", sql.Int, id_certificado)
        .execute("dbo.usp_EliminarCertificado")

    return result.recordset
}

const crearCertificadoDeCurso = async (id_usuario, id_curso) => enTransaccion(async (transaction) => {
    const enrollmentResult = await new sql.Request(transaction)
        .input("id_usuario", sql.Int, id_usuario)
        .input("id_curso", sql.Int, id_curso)
        .query(`
            SELECT i.id_inscripcion, i.id_usuario, i.id_curso, i.estado,
                   i.progreso_general, i.fecha_finalizacion, u.estado AS estado_usuario
            FROM dbo.inscripciones i WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.usuarios u ON u.id_usuario = i.id_usuario
            WHERE i.id_usuario = @id_usuario AND i.id_curso = @id_curso
        `)
    const inscripcion = enrollmentResult.recordset[0]
    exigirCursoCompletado(inscripcion)
    requireCompletion(await completionEvidence(new sql.Request(transaction), inscripcion.id_inscripcion))
    if (String(inscripcion.estado_usuario).toLowerCase() !== "activo") {
        throw errorHttp(403, "La cuenta no esta activa")
    }

    const existingResult = await new sql.Request(transaction)
        .input("id_inscripcion", sql.Int, inscripcion.id_inscripcion)
        .query(`
            SELECT id_certificado, id_inscripcion, codigo_certificado, fecha_emision, url_certificado
            FROM dbo.certificados WITH (UPDLOCK, HOLDLOCK)
            WHERE id_inscripcion = @id_inscripcion
        `)
    const existing = existingResult.recordset[0]
    if (existing) {
        return { created: false, certificate: existing }
    }

    const insertedResult = await new sql.Request(transaction)
        .input("id_inscripcion", sql.Int, inscripcion.id_inscripcion)
        .input("codigo_certificado", sql.NVarChar(100), `GW-${randomUUID()}`)
        .input("url_certificado", sql.NVarChar(255), null)
        .execute("dbo.usp_InsertarCertificado")
    const certificate = insertedResult.recordset[0]
    const downloadUrl = `/api/certificados/${certificate.id_certificado}/descargar`
    await new sql.Request(transaction)
        .input("id_certificado", sql.Int, certificate.id_certificado)
        .input("url_certificado", sql.NVarChar(255), downloadUrl)
        .query(`
            UPDATE dbo.certificados
            SET url_certificado = @url_certificado
            WHERE id_certificado = @id_certificado
        `)

    return { created: true, certificate: { ...certificate, url_certificado: downloadUrl } }
})

const buscarCertificadoParaDescarga = async (id_certificado) => {
    const con = await poolPromise
    const result = await con.request()
        .input("id_certificado", sql.Int, id_certificado)
        .query(`
            SELECT c.id_certificado, c.codigo_certificado, c.fecha_emision,i.id_inscripcion,
                   i.id_usuario, i.estado, i.progreso_general, i.fecha_finalizacion,
                   u.nombre, u.apellido, u.estado AS estado_usuario,
                   cu.titulo AS curso
            FROM dbo.certificados c
            INNER JOIN dbo.inscripciones i ON i.id_inscripcion = c.id_inscripcion
            INNER JOIN dbo.usuarios u ON u.id_usuario = i.id_usuario
            INNER JOIN dbo.cursos cu ON cu.id_curso = i.id_curso
            WHERE c.id_certificado = @id_certificado
        `)

    const certificate=result.recordset[0] || null
    return certificate?{...certificate,...await completionEvidence(con.request(),certificate.id_inscripcion)}:null
}

export {
    listarCertificado,
    insertarCertificado,
    editarCertificado,
    eliminarCertificado,
    crearCertificadoDeCurso,
    buscarCertificadoParaDescarga,
    exigirCursoCompletado
}
