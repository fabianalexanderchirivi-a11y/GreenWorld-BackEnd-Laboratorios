import { jest, beforeAll, beforeEach, describe, test, expect } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

// Se aíslan los modelos: estas pruebas no importan db.js ni conectan a SQL.
const model = Object.fromEntries([
  'listarUsuarios', 'buscarUsuarioPorCorreo', 'insertarUsuario',
  'editarUsuario', 'eliminarUsuario', 'desactivarCuentaUsuario',
].map((name) => [name, jest.fn()]))
jest.unstable_mockModule('../../src/model/UsersModel.js', () => model)
const { default: router } = await import('../../src/routes/UsersRouters.js')
const app = express().use(express.json()).use('/api', router)
const testSecret = randomBytes(32).toString('hex')
const password = randomBytes(16).toString('hex')
let user
beforeAll(async () => {
  user = { id_usuario: 101, nombre: 'Prueba', apellido: 'Unitaria', correo: 'unit@example.test',
    rol: 'usuario', estado: 'Activo', contrasena: await bcrypt.hash(password, 4) }
})
beforeEach(() => {
  jest.resetAllMocks()
  process.env.JWT_SECRET = testSecret
})
const token = (rol = 'usuario') => jwt.sign({ id_usuario: 101, correo: 'unit@example.test', rol }, testSecret)

describe('Rutas de autenticación con modelo aislado', () => {
  test.each([{}, { correo: 'unit@example.test' }, { contrasena: 'incompleta' }])('rechaza campos ausentes: %j', async (body) => {
    const response = await request(app).post('/api/auth/login').send(body)
    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(model.buscarUsuarioPorCorreo).not.toHaveBeenCalled()
  })
  test('usuario inexistente devuelve 401', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue(null)
    const response = await request(app).post('/api/auth/login').send({ correo: 'missing@example.test', contrasena: password })
    expect(response.status).toBe(401)
    expect(response.body).not.toHaveProperty('token')
  })
  test('contraseña incorrecta devuelve 401', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue(user)
    const response = await request(app).post('/api/auth/login').send({ correo: user.correo, contrasena: `${password}-incorrecta` })
    expect(response.status).toBe(401)
    expect(response.body).not.toHaveProperty('token')
  })
  test('cuenta inactiva devuelve 403', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue({ ...user, estado: 'inactivo' })
    const response = await request(app).post('/api/auth/login').send({ correo: user.correo, contrasena: password })
    expect(response.status).toBe(403)
  })
  test('login válido genera JWT verificable y omite el hash', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue(user)
    const response = await request(app).post('/api/auth/login').send({ correo: ` ${user.correo} `, contrasena: password })
    expect(response.status).toBe(200)
    expect(jwt.verify(response.body.token, testSecret)).toMatchObject({ id_usuario: 101, rol: 'usuario' })
    expect(response.body.usuario).not.toHaveProperty('contrasena')
    expect(model.buscarUsuarioPorCorreo).toHaveBeenCalledWith(user.correo)
  })
  test('error del modelo devuelve 500 sin sesión', async () => {
    model.buscarUsuarioPorCorreo.mockRejectedValue(new Error('Error controlado del modelo de prueba'))
    const response = await request(app).post('/api/auth/login').send({ correo: user.correo, contrasena: password })
    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
    expect(response.body).not.toHaveProperty('token')
  })
  test.each([undefined, 'Bearer invalido'])('exige JWT para listar usuarios: %s', async (authorization) => {
    let operation = request(app).get('/api/users')
    if (authorization) operation = operation.set('Authorization', authorization)
    expect((await operation).status).toBe(401)
    expect(model.listarUsuarios).not.toHaveBeenCalled()
  })
  test('usuario común no puede listar cuentas', async () => {
    expect((await request(app).get('/api/users').auth(token(), { type: 'bearer' })).status).toBe(403)
    expect(model.listarUsuarios).not.toHaveBeenCalled()
  })
  test('administrador autorizado puede listar cuentas', async () => {
    model.listarUsuarios.mockResolvedValue([{ id_usuario: 101, nombre: 'Prueba' }])
    const response = await request(app).get('/api/users').auth(token('admin'), { type: 'bearer' })
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([{ id_usuario: 101, nombre: 'Prueba' }])
  })
  test('registro valida longitud antes de escribir', async () => {
    const response = await request(app).post('/api/auth/register').send({ nombre: 'Prueba', apellido: 'Test', correo: user.correo, contrasena: 'corta' })
    expect(response.status).toBe(400)
    expect(model.insertarUsuario).not.toHaveBeenCalled()
  })
  test('registro duplicado devuelve 409 sin insertar', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue(user)
    const response = await request(app).post('/api/auth/register').send({ nombre: 'Prueba', apellido: 'Test', correo: user.correo, contrasena: password })
    expect(response.status).toBe(409)
    expect(model.insertarUsuario).not.toHaveBeenCalled()
  })
  test('registro exitoso cifra la contraseña antes de insertar', async () => {
    model.buscarUsuarioPorCorreo.mockResolvedValue(null)
    model.insertarUsuario.mockResolvedValue([])
    const response = await request(app).post('/api/auth/register').send({ nombre: 'Prueba', apellido: 'Test', correo: user.correo, contrasena: password })
    expect(response.status).toBe(201)
    const inserted = model.insertarUsuario.mock.calls[0][0]
    expect(inserted.contrasena).not.toBe(password)
    expect(await bcrypt.compare(password, inserted.contrasena)).toBe(true)
  })
  test('perfil vacío no modifica el modelo', async () => {
    const response = await request(app).put('/api/usuarios/me').auth(token(), { type: 'bearer' }).send({})
    expect(response.status).toBe(400)
    expect(model.editarUsuario).not.toHaveBeenCalled()
  })
})
