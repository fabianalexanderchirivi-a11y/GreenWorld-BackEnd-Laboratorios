import { readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export async function redactLogs(files, secrets) {
  try {
    if (secrets.length !== 2 || secrets.some((secret) => !secret || secret.length < 16)) {
      throw new Error('Faltan valores para sanear los logs efímeros')
    }
    for (const file of files) {
      let content = await readFile(file, 'utf8')
      for (const secret of secrets) content = content.replaceAll(secret, '[REDACTADO]')
      await writeFile(file, content)
    }
  } catch {
    // Solo los archivos de log explícitos de esta ejecución, sin borrado recursivo.
    await Promise.all(files.map((file) => rm(file, { force: true })))
    throw new Error('No se conservaron logs que no pudieron sanearse')
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await redactLogs(process.argv.slice(2), [process.env.GW_CI_SQL_SECRET, process.env.GW_CI_JWT_SECRET])
}
