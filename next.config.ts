import type { NextConfig } from 'next'

/*
 * Versione della build, fissata qui e inlinata nel bundle.
 *
 * Serve a rispondere a una domanda che dal telefono non ha altra risposta: "sto guardando
 * l'ultimo aggiornamento o una copia vecchia?". Fra service worker, cache del browser e app
 * installata sulla home, un deploy può essere online da un'ora e il telefono mostrare ancora
 * quello di prima, senza che niente lo dica.
 *
 * Su Vercel `VERCEL_GIT_COMMIT_SHA` è il commit da cui la build è stata prodotta: sette caratteri
 * bastano per confrontarlo con quello annunciato. Fuori da Vercel non esiste, e allora si dichiara
 * "sviluppo" invece di inventare un numero che non corrisponde a niente.
 */
const commit = process.env['VERCEL_GIT_COMMIT_SHA']
const APP_VERSION = commit === undefined || commit === '' ? 'sviluppo' : commit.slice(0, 7)

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

export default nextConfig
