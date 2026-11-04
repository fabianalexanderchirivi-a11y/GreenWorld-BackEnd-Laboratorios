import {
    listarModulos,
    insertarModulo,
    editarModulo,
    eliminarModulo
} from "../model/ModulosModel.js"

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

const prepararModulo = (body) => {
    const idCurso = validarEnteroPositivo(body.id_curso, "id_curso")
    const ordenModulo = validarEnteroPositivo(body.orden_modulo, "orden_modulo")
    const modulo = {
        id_curso: idCurso.valor,
        titulo: (typeof body.titulo==='string'?body.titulo.trim():''),
        descripcion: (typeof body.descripcion==='string'?body.descripcion.trim():''),
        contenido: typeof body.contenido==='string'?body.contenido.trim():'',
        video_url: typeof body.video_url==='string'?body.video_url.trim():'',
        orden_modulo: ordenModulo.valor,
        duracion_estimada: (typeof body.duracion_estimada==='string'?body.duracion_estimada.trim():''),
        estado: (typeof body.estado==='string'?body.estado.trim():'')
    }

    const errores = []

    if (idCurso.error) errores.push(idCurso.error)
    if (ordenModulo.error) errores.push(ordenModulo.error)

    Object.entries(modulo).forEach(([key, value]) => {
        if (!["contenido","video_url","descripcion","duracion_estimada"].includes(key) && (value === undefined || value === null || value === "")) {
            errores.push(`Falta ${key}`)
        }
    })

    if(!modulo.contenido&&!modulo.video_url)errores.push('Agrega contenido de texto o un video')
    if(modulo.video_url&&!/^https:\/\//i.test(modulo.video_url))errores.push('La dirección del video debe usar HTTPS')
    if(!['disponible','oculto'].includes(modulo.estado))errores.push('El estado debe ser disponible u oculto')
    if((modulo.titulo||'').length>150)errores.push('El título admite hasta 150 caracteres')
    return { modulo, errores }
}

const getModulos = async (req, res) => {
    try {
        const modulos = await listarModulos()

        return res.status(200).json({
            success: true,
            message: "Modulos obtenidos correctamente",
            data: req.usuario?.rol==='admin'?modulos:modulos.filter(m=>m.estado==='disponible').map(({contenido,video_url,...m})=>m)
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error al obtener los modulos",
            error: obtenerMensajeError(error)
        })
    }
}

const addModulo = async (req, res) => {
    try {
        const { modulo, errores } = prepararModulo(req.body)

        if (errores.length > 0) {
            return res.status(400).json({
                success: false,
                message: errores.join(", ")
            })
        }

        const data = await insertarModulo(modulo)

        return res.status(201).json({
            success: true,
            message: "Modulo creado correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)

        return res.status(error.status||500).json({
            success: false,
            message: error.status ? mensajeError : "No se pudo crear el módulo. Revisa los datos e intenta de nuevo."
        })
    }
}

const updateModulo = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_modulo")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const { modulo, errores } = prepararModulo(req.body)

        if (errores.length > 0) {
            return res.status(400).json({
                success: false,
                message: errores.join(", ")
            })
        }

        const data = await editarModulo(id.valor, modulo)

        return res.status(200).json({
            success: true,
            message: "Modulo actualizado correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)
        const status = error.status||(esNoEncontrado(mensajeError) ? 404 : 500)

        return res.status(status).json({
            success: false,
            message: error.status ? mensajeError : "No se pudo actualizar el módulo."
        })
    }
}

const deleteModulo = async (req, res) => {
    try {
        const id = validarEnteroPositivo(req.params.id, "id_modulo")

        if (id.error) {
            return res.status(400).json({
                success: false,
                message: id.error
            })
        }

        const data = await eliminarModulo(id.valor)

        return res.status(200).json({
            success: true,
            message: "Modulo eliminado o desactivado correctamente",
            data
        })
    } catch (error) {
        const mensajeError = obtenerMensajeError(error)
        const status = error.status||(esNoEncontrado(mensajeError) ? 404 : 500)

        return res.status(status).json({
            success: false,
            message: error.status ? mensajeError : "No se pudo desactivar el módulo."
        })
    }
}

export { getModulos, addModulo, updateModulo, deleteModulo }
