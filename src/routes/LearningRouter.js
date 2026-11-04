import express from 'express'
import { verificarToken } from '../middleware/authMiddleware.js'
import { courseLearning,completeModule,finishLearning,listReviews,saveReview } from '../model/LearningModel.js'
import { positiveId,reviewText } from '../services/learningRules.js'
const router=express.Router()
const action=(work)=>async(req,res)=>{try{return res.json({success:true,data:await work(req)})}catch(e){return res.status(e.status||500).json({success:false,message:e.status?e.message:'No pudimos guardar o consultar la información. Intenta nuevamente.'})}}
router.get('/cursos/:id/aprendizaje',verificarToken,action(req=>courseLearning(req.usuario.id_usuario,positiveId(req.params.id))))
router.put('/cursos/:id/modulos/:module/completar',verificarToken,action(req=>completeModule(req.usuario.id_usuario,positiveId(req.params.id),positiveId(req.params.module))))
router.put('/cursos/:id/finalizar',verificarToken,action(req=>finishLearning(req.usuario.id_usuario,positiveId(req.params.id))))
router.get('/cursos/:id/resenas',action(req=>listReviews(positiveId(req.params.id))))
router.put('/cursos/:id/resena',verificarToken,action(req=>saveReview(req.usuario.id_usuario,positiveId(req.params.id),reviewText(req.body.contenido))))
export default router
