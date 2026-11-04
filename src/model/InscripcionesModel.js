import { poolPromise, sql } from "../config/db.js"

const listarInscripciones = async () => {
    try {
        const con = await poolPromise
        const result = await con.request().execute("dbo.usp_ListarInscripciones")
        return result.recordset
    } catch (error) {
        throw error
    }
}

const insertarInscripcion = async (inscripcion) => {
    try {
        const con = await poolPromise
        const result = await con.request()
            .input("id_usuario", sql.Int, inscripcion.id_usuario)
            .input("id_curso", sql.Int, inscripcion.id_curso)
            .input("estado", sql.NVarChar(20), inscripcion.estado)
            .input("progreso_general", sql.Decimal(5, 2), inscripcion.progreso_general)
            .input("fecha_ultima_actividad", sql.DateTime2, inscripcion.fecha_ultima_actividad)
            .execute("dbo.usp_InsertarInscripcion")

        return result.recordset
    } catch (error) {
        throw error
    }
}

const editarInscripcion = async (id_inscripcion, inscripcion) => {
    try {
        const con = await poolPromise
        const result = await con.request()
            .input("id_inscripcion", sql.Int, id_inscripcion)
            .input("id_usuario", sql.Int, inscripcion.id_usuario)
            .input("id_curso", sql.Int, inscripcion.id_curso)
            .input("estado", sql.NVarChar(20), inscripcion.estado)
            .input("progreso_general", sql.Decimal(5, 2), inscripcion.progreso_general)
            .input("fecha_ultima_actividad", sql.DateTime2, inscripcion.fecha_ultima_actividad)
            .execute("dbo.usp_EditarInscripcion")

        return result.recordset
    } catch (error) {
        throw error
    }
}

const eliminarInscripcion = async (id_inscripcion) => {
    try {
        const con = await poolPromise
        const result = await con.request()
            .input("id_inscripcion", sql.Int, id_inscripcion)
            .execute("dbo.usp_EliminarInscripcion")

        return result.recordset
    } catch (error) {
        throw error
    }
}

const listarCursosPorUsuario = async (id_usuario) => {
    try {
        const con = await poolPromise
        const result = await con.request()
            .input("id_usuario", sql.Int, id_usuario)
            .query(`
                SELECT
                    i.id_inscripcion,
                    i.id_usuario,
                    i.id_curso,
                    c.titulo,
                    c.descripcion,
                    c.imagen,
                    c.duracion_estimada,
                    c.nivel,
                    c.categoria,
                    c.estado AS estado_curso,
                    CASE WHEN a.total>0 AND a.total=a.completados THEN 'terminado' ELSE 'en_progreso' END AS estado_progreso,
                    CASE WHEN a.total>0 THEN CAST(a.completados*100.0/a.total AS DECIMAL(5,2)) ELSE 0 END AS porcentaje_avance,
                    a.total AS total_modulos,a.completados AS modulos_completados,
                    CASE WHEN a.total>0 AND a.total=a.completados THEN 1 ELSE 0 END AS finalizacion_valida,
                    CASE WHEN i.estado='completado' AND (a.total=0 OR a.total<>a.completados) THEN 1 ELSE 0 END AS finalizacion_historica_sin_validar,
                    CASE WHEN a.total>0 AND a.total=a.completados THEN (SELECT TOP 1 id_certificado FROM dbo.certificados ce WHERE ce.id_inscripcion=i.id_inscripcion) END AS id_certificado,
                    i.fecha_inscripcion AS fecha_inicio,
                    i.fecha_ultima_actividad,
                    i.fecha_finalizacion
                FROM dbo.inscripciones i
                INNER JOIN dbo.cursos c ON c.id_curso = i.id_curso
                OUTER APPLY(SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN pm.completado=1 AND pm.porcentaje=100 THEN 1 ELSE 0 END),0) AS completados FROM dbo.modulos m LEFT JOIN dbo.progreso_modulos pm ON pm.id_modulo=m.id_modulo AND pm.id_inscripcion=i.id_inscripcion WHERE m.id_curso=i.id_curso) a
                WHERE i.id_usuario = @id_usuario
                  AND i.estado IN ('en_progreso', 'completado')
                ORDER BY i.fecha_ultima_actividad DESC, i.fecha_inscripcion DESC
            `)

        return result.recordset
    } catch (error) {
        throw error
    }
}

const listarInscripcionesCursosAdmin = async () => {
    try {
        const con = await poolPromise
        const result = await con.request().query(`
            SELECT
                i.id_inscripcion,
                i.id_usuario,
                u.nombre,
                u.apellido,
                u.correo,
                i.id_curso,
                c.titulo AS curso,
                CASE
                    WHEN i.estado = 'completado' THEN 'terminado'
                    ELSE i.estado
                END AS estado_progreso,
                i.progreso_general AS porcentaje_avance,
                i.fecha_inscripcion AS fecha_inicio,
                i.fecha_finalizacion,
                i.fecha_ultima_actividad
            FROM dbo.inscripciones i
            INNER JOIN dbo.usuarios u ON u.id_usuario = i.id_usuario
            INNER JOIN dbo.cursos c ON c.id_curso = i.id_curso
            ORDER BY i.fecha_ultima_actividad DESC, i.fecha_inscripcion DESC
        `)

        return result.recordset
    } catch (error) {
        throw error
    }
}

const listarInscripcionesRetosAdmin = async () => {
    try {
        const con = await poolPromise
        const result = await con.request().query(`
            SELECT
                ur.id_usuario_reto,
                ur.id_usuario,
                u.nombre,
                u.apellido,
                u.correo,
                ur.id_reto,
                r.titulo AS reto,
                ur.estado_progreso,
                ur.fecha_inicio,
                ur.fecha_finalizacion,
                ur.fecha_ultima_actividad
            FROM dbo.usuario_retos ur
            INNER JOIN dbo.usuarios u ON u.id_usuario = ur.id_usuario
            INNER JOIN dbo.retos r ON r.id_reto = ur.id_reto
            ORDER BY ur.fecha_ultima_actividad DESC, ur.fecha_inicio DESC
        `)

        return result.recordset
    } catch (error) {
        throw error
    }
}

const iniciarCursoUsuario = async (id_usuario, id_curso) => {
    try {
        const con = await poolPromise
        const available=await con.request().input('curso',sql.Int,id_curso).input('usuario',sql.Int,id_usuario).query("SELECT id_curso FROM dbo.cursos WHERE id_curso=@curso AND estado='publicado' AND EXISTS(SELECT 1 FROM dbo.usuarios WHERE id_usuario=@usuario AND estado='activo')")
        if(!available.recordset.length)throw Object.assign(new Error('El curso no está publicado o la cuenta no está activa'),{status:404})
        const result = await con.request()
            .input("id_usuario", sql.Int, id_usuario)
            .input("id_curso", sql.Int, id_curso)
            .query(`
                IF NOT EXISTS (
                    SELECT 1
                    FROM dbo.inscripciones
                    WHERE id_usuario = @id_usuario AND id_curso = @id_curso
                )
                BEGIN
                    INSERT INTO dbo.inscripciones (
                        id_usuario,
                        id_curso,
                        estado,
                        progreso_general,
                        fecha_ultima_actividad
                    )
                    VALUES (
                        @id_usuario,
                        @id_curso,
                        'en_progreso',
                        0,
                        SYSDATETIME()
                    );
                END
                ELSE
                BEGIN
                    UPDATE dbo.inscripciones
                    SET
                        estado = CASE WHEN estado = 'cancelado' THEN 'en_progreso' ELSE estado END,
                        progreso_general = CASE WHEN estado = 'cancelado' THEN 0 ELSE progreso_general END,
                        fecha_ultima_actividad = SYSDATETIME(),
                        fecha_finalizacion = CASE WHEN estado = 'cancelado' THEN NULL ELSE fecha_finalizacion END
                    WHERE id_usuario = @id_usuario AND id_curso = @id_curso;
                END;

                SELECT TOP 1
                    i.id_inscripcion,
                    i.id_usuario,
                    i.id_curso,
                    CASE
                        WHEN i.estado = 'completado' THEN 'terminado'
                        ELSE i.estado
                    END AS estado_progreso,
                    i.progreso_general AS porcentaje_avance,
                    i.fecha_inscripcion AS fecha_inicio,
                    i.fecha_ultima_actividad,
                    i.fecha_finalizacion
                FROM dbo.inscripciones i
                WHERE i.id_usuario = @id_usuario AND i.id_curso = @id_curso;
            `)

        return result.recordset[0] || null
    } catch (error) {
        throw error
    }
}

// El cliente ya no puede fijar porcentajes o crear una finalización directa.
const actualizarProgresoCursoUsuario = async (id_usuario, id_curso, progreso) => {
    if(progreso.estado_progreso !== 'terminado') throw Object.assign(new Error('El progreso se registra completando módulos'),{status:409})
    const {finishLearning}=await import('./LearningModel.js')
    return finishLearning(id_usuario,id_curso)
}

const cancelarCursoUsuario = async (id_usuario, id_curso) => {
    try {
        const con = await poolPromise
        const result = await con.request()
            .input("id_usuario", sql.Int, id_usuario)
            .input("id_curso", sql.Int, id_curso)
            .query(`
                UPDATE dbo.inscripciones
                SET
                    estado = 'cancelado',
                    progreso_general = 0,
                    fecha_ultima_actividad = SYSDATETIME(),
                    fecha_finalizacion = NULL
                WHERE id_usuario = @id_usuario
                  AND id_curso = @id_curso
                  AND estado = 'en_progreso';

                SELECT TOP 1
                    i.id_inscripcion,
                    i.id_usuario,
                    i.id_curso,
                    CASE
                        WHEN i.estado = 'completado' THEN 'terminado'
                        ELSE i.estado
                    END AS estado_progreso,
                    i.progreso_general AS porcentaje_avance,
                    i.fecha_inscripcion AS fecha_inicio,
                    i.fecha_ultima_actividad,
                    i.fecha_finalizacion
                FROM dbo.inscripciones i
                WHERE i.id_usuario = @id_usuario AND i.id_curso = @id_curso;
            `)

        return result.recordset[0] || null
    } catch (error) {
        throw error
    }
}

export {
    listarInscripciones,
    insertarInscripcion,
    editarInscripcion,
    eliminarInscripcion,
    listarCursosPorUsuario,
    listarInscripcionesCursosAdmin,
    listarInscripcionesRetosAdmin,
    iniciarCursoUsuario,
    actualizarProgresoCursoUsuario,
    cancelarCursoUsuario
}
