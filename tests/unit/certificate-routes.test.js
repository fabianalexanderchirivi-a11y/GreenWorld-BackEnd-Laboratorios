import { jest, beforeEach, describe, test, expect } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

const model = Object.fromEntries([
  'listarCertificado', 'insertarCertificado', 'editarCertificado', 'eliminarCertificado',
  'crearCertificadoDeCurso', 'buscarCertificadoParaDescarga', 'exigirCursoCompletado',
].map((name) => [name, jest.fn()]))
const generate = jest.fn()
jest.unstable_mockModule('../../src/model/CertificadoModel.js', () => model)
jest.unstable_mockModule('../../src/services/certificatePdf.js', () => ({ generarPdfCertificado: generate }))
const { default: router } = await import('../../src/routes/CertificadoRouter.js')
const app = express().use(express.json()).use('/api', router)
const secret = randomBytes(32).toString('hex')
let authorization
beforeEach(() => {
  jest.resetAllMocks()
  process.env.JWT_SECRET = secret
  authorization = `Bearer ${jwt.sign({ id_usuario: 101, rol: 'usuario' }, secret)}`
})

describe('Rutas de certificado; modelo y render aislados', () => {
  test.each(['certificado', 'certificados'].flatMap((alias) => ['get', 'post', 'put', 'delete'].map((method) => [alias, method])))('protege el CRUD heredado %s %s', async (alias, method) => {
    const route = `/api/${alias}${['put', 'delete'].includes(method) ? '/42' : ''}`
    expect((await request(app)[method](route).send({})).status).toBe(401)
    expect((await request(app)[method](route).set('Authorization', authorization).send({})).status).toBe(403)
    expect(model.insertarCertificado).not.toHaveBeenCalled()
    expect(model.editarCertificado).not.toHaveBeenCalled()
    expect(model.eliminarCertificado).not.toHaveBeenCalled()
  })
  test('ID inválido se rechaza antes de consultar el modelo', async () => {
    expect((await request(app).post('/api/cursos/invalido/certificado').set('Authorization', authorization)).status).toBe(400)
    expect(model.crearCertificadoDeCurso).not.toHaveBeenCalled()
  })
  test.each([[true, 201], [false, 200]])('emisión created=%s devuelve %i y usa identidad del JWT', async (created, status) => {
    model.crearCertificadoDeCurso.mockResolvedValue({ created, certificate: {
      id_certificado: 42, id_inscripcion: 77, codigo_certificado: 'GW-PRUEBA-UNITARIA', fecha_emision: '2026-01-01',
    } })
    const response = await request(app).post('/api/cursos/3/certificado').set('Authorization', authorization)
      .send({ id_usuario: 999, codigo_certificado: 'NO-CONFIABLE' })
    expect(response.status).toBe(status)
    expect(model.crearCertificadoDeCurso).toHaveBeenCalledWith(101, 3)
    expect(response.body.data).toMatchObject({ id_certificado: 42, codigo_certificado: 'GW-PRUEBA-UNITARIA', url_certificado: '/api/certificados/42/descargar' })
  })
  test('rechazo del modelo se propaga como 409', async () => {
    model.crearCertificadoDeCurso.mockRejectedValue(Object.assign(new Error('Curso incompleto'), { status: 409 }))
    const response = await request(app).post('/api/cursos/3/certificado').set('Authorization', authorization)
    expect(response.status).toBe(409)
    expect(response.body.success).toBe(false)
  })
  test('error interno de emisión no expone detalles internos', async () => {
    model.crearCertificadoDeCurso.mockRejectedValue(new Error('Detalle interno controlado'))
    const response = await request(app).post('/api/cursos/3/certificado').set('Authorization', authorization)
    expect(response.status).toBe(500)
    expect(response.body.message).toBe('No se pudo generar el certificado')
    expect(JSON.stringify(response.body)).not.toContain('Detalle interno controlado')
  })
  test('descarga ajena devuelve 404 sin invocar render', async () => {
    model.buscarCertificadoParaDescarga.mockResolvedValue({ id_usuario: 999 })
    const response = await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)
    expect(response.status).toBe(404)
    expect(generate).not.toHaveBeenCalled()
  })
  test('la descarga vuelve a validar la finalización', async () => {
    model.buscarCertificadoParaDescarga.mockResolvedValue({ id_usuario: 101, estado_usuario: 'activo' })
    model.exigirCursoCompletado.mockImplementation(() => { throw Object.assign(new Error('Curso incompleto'), { status: 409 }) })
    const response = await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)
    expect(response.status).toBe(409)
    expect(generate).not.toHaveBeenCalled()
  })
  test('descarga sin sesión no consulta datos', async () => {
    expect((await request(app).get('/api/certificados/42/descargar')).status).toBe(401)
    expect(model.buscarCertificadoParaDescarga).not.toHaveBeenCalled()
  })
  test('ID inválido en descarga devuelve 400', async () => {
    expect((await request(app).get('/api/certificados/0/descargar').set('Authorization', authorization)).status).toBe(400)
    expect(model.buscarCertificadoParaDescarga).not.toHaveBeenCalled()
  })
  test('certificado inexistente devuelve 404', async () => {
    model.buscarCertificadoParaDescarga.mockResolvedValue(null)
    expect((await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)).status).toBe(404)
    expect(generate).not.toHaveBeenCalled()
  })
  test('titular inactivo no descarga aunque conserve JWT firmado', async () => {
    model.buscarCertificadoParaDescarga.mockResolvedValue({ id_usuario: 101, estado_usuario: 'inactivo' })
    expect((await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)).status).toBe(403)
    expect(generate).not.toHaveBeenCalled()
  })
  test('titular activo recibe bytes y cabeceras de descarga del render aislado', async () => {
    const certificate = { id_usuario: 101, estado_usuario: 'activo' }
    model.buscarCertificadoParaDescarga.mockResolvedValue(certificate)
    generate.mockResolvedValue(Buffer.from('%PDF-fixture-unitaria'))
    const response = await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)
    expect(response.status).toBe(200)
    expect(model.exigirCursoCompletado).toHaveBeenCalledWith(certificate)
    expect(generate).toHaveBeenCalledWith(certificate)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toBe('attachment; filename="greenworld-certificado-42.pdf"')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.body.toString()).toBe('%PDF-fixture-unitaria')
  })
  test('fallo de render devuelve 500 sin exponer detalles internos', async () => {
    model.buscarCertificadoParaDescarga.mockResolvedValue({ id_usuario: 101, estado_usuario: 'activo' })
    generate.mockRejectedValue(new Error('Detalle interno del render de prueba'))
    const response = await request(app).get('/api/certificados/42/descargar').set('Authorization', authorization)
    expect(response.status).toBe(500)
    expect(response.body.message).toBe('No se pudo descargar el certificado')
  })
  const admin = () => `Bearer ${jwt.sign({ id_usuario: 102, rol: 'admin' }, secret)}`
  test('administrador puede listar metadatos; error del modelo conserva 500', async () => {
    model.listarCertificado.mockResolvedValue([{ id_certificado: 42 }])
    const response = await request(app).get('/api/certificados').set('Authorization', admin())
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([{ id_certificado: 42 }])
    model.listarCertificado.mockRejectedValue(new Error('Error controlado'))
    expect((await request(app).get('/api/certificados').set('Authorization', admin())).status).toBe(500)
  })
  test('administrador no inserta metadatos sin los campos requeridos', async () => {
    expect((await request(app).post('/api/certificados').set('Authorization', admin()).send({})).status).toBe(400)
    expect(model.insertarCertificado).not.toHaveBeenCalled()
  })
  test('creación administrativa conserva rechazo 409 del modelo', async () => {
    model.insertarCertificado.mockRejectedValue(Object.assign(new Error('Inscripción incompleta'), { status: 409 }))
    const response = await request(app).post('/api/certificados').set('Authorization', admin())
      .send({ id_inscripcion: 77, codigo_certificado: 'GW-UNITARIA', url_certificado: '/unitaria' })
    expect(response.status).toBe(409)
  })
  test('edición administrativa no ignora rechazo de inscripción incompleta', async () => {
    model.editarCertificado.mockRejectedValue(Object.assign(new Error('Inscripción incompleta'), { status: 409 }))
    const response = await request(app).put('/api/certificado/42').set('Authorization', admin())
      .send({ id_inscripcion: 77, codigo_certificado: 'GW-UNITARIA', url_certificado: '/unitaria' })
    expect(response.status).toBe(409)
  })
})
