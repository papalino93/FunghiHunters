/**
 * Alias di compatibilità verso `/api/v1/mpi`.
 *
 * Questo indirizzo esisteva prima che l'API avesse un numero di versione: non sappiamo se qualcuno
 * fuori da questo repository lo ha già salvato, quindi resta vivo invece di sparire. Nessuna
 * logica qui: stesso handler, stesso comportamento, un solo posto da mantenere.
 *
 * `revalidate` va ripetuto qui e non ri-esportato: Next.js legge questo campo staticamente dal
 * file della rotta a tempo di build, un `export { revalidate } from '...'` non viene riconosciuto.
 */
export { GET } from '@/app/api/v1/mpi/route'

export const revalidate = 3600
