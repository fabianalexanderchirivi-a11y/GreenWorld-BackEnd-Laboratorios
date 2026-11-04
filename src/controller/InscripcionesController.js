import {
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
} from "../model/InscripcionesModel.js"

const obtenerMensajeError = (error) => (
    error.originalError?.info?.message ||
    error.precedingErrors?.[0]?.originalError?.info?.message ||
    error.message
)

const esNoEncontrado = (mensaje) => /no existe|no encontrado|not found/i.test(mensaje || "")

const validarEnteroPositivo = (valor, nombreCampo) => {
    const numero = Number(valor)

    if (!Number.isInteger(numero) || numero <= 0) {
        return { error: `El ${nombreCampo} no es valido` }
    }

    return { valor: numero }
}

const prepararInscripcion = (body) => {
    const idUsuario = validarEnteroPositivo(body.id_usuario, "id_usuario")
    const idCurso = validarEnteroPositivo(body.id_curso, "id_curso")
    const progreso = Number(body.progreso_general)
    const fecha = body.fecha_ultima_actividad ? new Date(body.fecha_ultima_actividad) : null
    const inscripcion = {
        id_usuario: idUsuario.valor,
        id_curso: idCurso.valor,
        estado: body.estado?.trim(),
        progreso_general: progreso,
        fecha_ultima_actividad: fecha
    }
    const errores = []

    if (idUsuario.error) errores.push(idUsuario.error)
    if (idCurso.error) errores.push(idCurso.error)
    if (!inscripcion.estado) errores.push("Falta estado")
    if (!Number.isFinite(progreso)) errores.push("El progreso_general no es valido")
    if (!fecha || Number.isNaN(fecha.getTime())) errores.push("La fecha_ultima_actividad no es valida")

    return { inscripcion, errores }
}

const getInscripciones = async (req, res) => {
    try {
        const inscripciones = await listarInscripciones()

        return res.status(200).json({
            success: true,
            message: "Inscripciones obtenidas correctamente",
            data: inscripciones
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error al obtener las inscripciones",
            error: obtenerMensajeError(error)
        })
    }
}

const addInscripcion = async (req, res) => {
    try {
        const { inscripcion, errores } = prepararInscripcion(req.body)

        if (errores.length > 0) {
            return res.status(400).json({
                success: false,
                message: errores.join(", ")
            })
        }

        const data = await insertarInscripcion(inscripcion)

        return res.status(201).json({
            success: true,
            message: "Inscripcion creada correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)

        return res.status(500).json({
            success: false,
            message: mensajeError || "Error al crear la inscripcion",
            error: mensajeError
        })
    }
}

const updateInscripcion = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_inscripcion")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const { inscripcion, errores } = prepararInscripcion(req.body)

        if (errores.length > 0) {
            return res.status(400).json({
                success: false,
                message: errores.join(", ")
            })
        }

        const data = await editarInscripcion(id.valor, inscripcion)

        return res.status(200).json({
            success: true,
            message: "Inscripcion actualizada correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)
        const status = esNoEncontrado(mensajeError) ? 404 : 500

        return res.status(status).json({
            success: false,
            message: mensajeError || "Error al actualizar la inscripcion",
            error: mensajeError
        })
    }
}

const deleteInscripcion = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_inscripcion")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const data = await eliminarInscripcion(id.valor)

        return res.status(200).json({
            success: true,
            message: "Inscripcion eliminada o desactivada correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)
        const status = esNoEncontrado(mensajeError) ? 404 : 500

        return res.status(status).json({
            success: false,
            message: mensajeError || "Error al eliminar la inscripcion",
            error: mensajeError
        })
    }
}

const getMyCourses = async (req, res) => {
    try {
        const cursos = await listarCursosPorUsuario(req.usuario.id_usuario)

        return res.status(200).json({
            success: true,
            message: "Cursos del usuario obtenidos correctamente",
            data: cursos
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error al obtener tus cursos",
            error: obtenerMensajeError(error)
        })
    }
}

const getAdminCourseEnrollments = async (req, res) => {
    try {
        const inscripciones = await listarInscripcionesCursosAdmin()

        return res.status(200).json({
            success: true,
            message: "Inscripciones de cursos obtenidas correctamente",
            data: inscripciones
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error al obtener las inscripciones de cursos",
            error: obtenerMensajeError(error)
        })
    }
}

const getAdminChallengeEnrollments = async (req, res) => {
    try {
        const inscripciones = await listarInscripcionesRetosAdmin()

        return res.status(200).json({
            success: true,
            message: "Inscripciones de retos obtenidas correctamente",
            data: inscripciones
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error al obtener las inscripciones de retos",
            error: obtenerMensajeError(error)
        })
    }
}

const startCourse = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_curso")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const curso = await iniciarCursoUsuario(req.usuario.id_usuario, id.valor)

        return res.status(200).json({
            success: true,
            message: "Curso iniciado correctamente",
            data: curso
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)

        return res.status(error.status||500).json({
            success: false,
            message: mensajeError || "Error al iniciar el curso",
            error: mensajeError
        })
    }
}

const updateCourseProgress = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_curso")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const estado_progreso = req.body.estado_progreso || "en_progreso"

        if (!["en_progreso", "terminado"].includes(estado_progreso)) {
            return res.status(400).json({
                success: false,
                message: "El estado_progreso no es valido"
            })
        }

        const curso = await actualizarProgresoCursoUsuario(req.usuario.id_usuario, id.valor, {
            estado_progreso,
            porcentaje_avance: req.body.porcentaje_avance
        })

        return res.status(200).json({
            success: true,
            message: "Progreso actualizado correctamente",
            data: curso
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)

        return res.status(error.status||500).json({
            success: false,
            message: error.status ? mensajeError : "No se pudo actualizar el progreso",

        })
    }
}

const cancelCourse = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_curso")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const curso = await cancelarCursoUsuario(req.usuario.id_usuario, id.valor)

        return res.status(200).json({
            success: true,
            message: "Curso cancelado correctamente",
            data: curso
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)

        return res.status(500).json({
            success: false,
            message: mensajeError || "Error al cancelar el curso",
            error: mensajeError
        })
    }
}

export {
    getInscripciones,
    addInscripcion,
    updateInscripcion,
    deleteInscripcion,
    getMyCourses,
    getAdminCourseEnrollments,
    getAdminChallengeEnrollments,
    startCourse,
    updateCourseProgress,
    cancelCourse
}
