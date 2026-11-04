import express from "express"
import { verificarToken,verificarAdmin } from '../middleware/authMiddleware.js'
import {
    getModulos,
    addModulo,
    updateModulo,
    deleteModulo
} from "../controller/ModulosController.js"

const router = express.Router()

router.get("/modulos", getModulos)
router.get('/modulos/admin',verificarToken,verificarAdmin,getModulos)
router.post("/modulos", verificarToken,verificarAdmin,addModulo)
router.put("/modulos/:id", verificarToken,verificarAdmin,updateModulo)
router.delete("/modulos/:id", verificarToken,verificarAdmin,deleteModulo)

export default router
