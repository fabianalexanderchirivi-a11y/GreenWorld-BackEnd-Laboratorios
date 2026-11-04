import {jest,describe,test,expect,beforeEach} from '@jest/globals'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import {randomBytes} from 'node:crypto'
import {requireCompletion,reviewText,positiveId} from '../../src/services/learningRules.js'
const names=['courseLearning','completeModule','finishLearning','listReviews','saveReview']
const model=Object.fromEntries(names.map(n=>[n,jest.fn()]))
jest.unstable_mockModule('../../src/model/LearningModel.js',()=>model)
const {default:router}=await import('../../src/routes/LearningRouter.js')
const app=express().use(express.json()).use('/api',router)
let auth
beforeEach(()=>{jest.resetAllMocks();process.env.JWT_SECRET=randomBytes(32).toString('hex');auth='Bearer '+jwt.sign({id_usuario:101,rol:'usuario'},process.env.JWT_SECRET)})
describe('Aprendizaje y reseñas: contrato y permisos (modelos aislados)',()=>{
 test.each([['get','/cursos/1/aprendizaje'],['put','/cursos/1/modulos/2/completar'],['put','/cursos/1/finalizar'],['put','/cursos/1/resena']])('sin sesión %s %s',async(method,url)=>{expect((await request(app)[method]('/api'+url).send({})).status).toBe(401)})
 test('completar usa la identidad del JWT e ignora porcentajes y titulares del body',async()=>{model.completeModule.mockResolvedValue({total:2,completados:1});const r=await request(app).put('/api/cursos/3/modulos/7/completar').set('Authorization',auth).send({id_usuario:999,porcentaje:100});expect(r.status).toBe(200);expect(model.completeModule).toHaveBeenCalledWith(101,3,7)})
 test('no permite ruta con ID inválido',async()=>{expect((await request(app).put('/api/cursos/3/modulos/0/completar').set('Authorization',auth)).status).toBe(400);expect(model.completeModule).not.toHaveBeenCalled()})
 test('reseña solo puede guardar el autor autenticado',async()=>{model.saveReview.mockResolvedValue({id_resena:8});await request(app).put('/api/cursos/3/resena').set('Authorization',auth).send({id_usuario:999,contenido:'  Mi experiencia  '});expect(model.saveReview).toHaveBeenCalledWith(101,3,'Mi experiencia')})
 test.each(['','  ',null,42,'x'.repeat(2001)])('rechaza reseña inválida %#',async text=>{expect((await request(app).put('/api/cursos/3/resena').set('Authorization',auth).send({contenido:text})).status).toBe(400);expect(model.saveReview).not.toHaveBeenCalled()})
 test('rechazo de finalización se conserva',async()=>{model.finishLearning.mockRejectedValue(Object.assign(new Error('Completa los módulos'),{status:409}));expect((await request(app).put('/api/cursos/3/finalizar').set('Authorization',auth)).status).toBe(409)})
 test('errores internos no exponen SQL',async()=>{model.listReviews.mockRejectedValue(new Error('SQL password detalle'));const r=await request(app).get('/api/cursos/3/resenas');expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('SQL password')})
 test.each([{total:0,completados:0},{total:2,completados:1},{total:2,completados:3}])('no certifica progreso incompleto %#',e=>expect(()=>requireCompletion(e)).toThrow())
 test('admite todos los módulos completados',()=>expect(()=>requireCompletion({total:2,completados:2})).not.toThrow())
 test('validaciones puras',()=>{expect(reviewText('ok')).toBe('ok');expect(positiveId('3')).toBe(3);expect(()=>positiveId('1.2')).toThrow()})
})
