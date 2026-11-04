export const httpError=(status,message)=>Object.assign(new Error(message),{status})
export function requireCompletion({total,completados}) {
 if (!Number(total) || Number(completados)!==Number(total)) throw httpError(409,'Completa todos los módulos del curso antes de finalizar o solicitar el certificado')
}
export function reviewText(value) {
 if(typeof value!=='string'||!value.trim()||value.trim().length>2000) throw httpError(400,'Escribe una reseña de entre 1 y 2000 caracteres')
 return value.trim()
}
export function positiveId(value) {
 const id=Number(value)
 if(!Number.isSafeInteger(id)||id<=0)throw httpError(400,'El identificador no es válido')
 return id
}
