import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import { getConnection } from "./config/db.js"
import usersRouter from "./routes/UsersRouters.js"
import CoursesRouter from "./routes/CoursesRouter.js"
import CertificadoRouter from "./routes/CertificadoRouter.js"
import ModulosRouter from "./routes/ModulosRouter.js"
import InscripcionesRouter from "./routes/InscripcionesRouter.js"
import RetosRouter from "./routes/RetosRouter.js"
import LearningRouter from "./routes/LearningRouter.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist")

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({extended : true}))
app.use("/api", usersRouter)
app.use("/api", CoursesRouter)
app.use("/api", CertificadoRouter)
app.use("/api", ModulosRouter)
app.use("/api", InscripcionesRouter)
app.use("/api", RetosRouter)
app.use("/api", LearningRouter)
app.use(express.static(frontendDistPath))

app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"))
})

app.listen(PORT, async () => {
    await getConnection()
    console.log(`Conectado a traves del puerto: ${PORT}`)
})
