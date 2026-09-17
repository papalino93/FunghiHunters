import { AppShell } from '@/components/AppShell'
import { loadSnapshot } from '@/lib/snapshot/load'

/**
 * La pagina e' un componente server che legge lo snapshot e lo passa al guscio client.
 *
 * Nessun calcolo a richiesta: l'MPI e' gia' stato calcolato dal job giornaliero. La pagina viene
 * rigenerata ogni ora, che e' abbondante per un dato che cambia una volta al giorno e permette
 * comunque di raccogliere un rigenerato snapshot senza aspettare un nuovo deploy.
 */
export const revalidate = 3600

export default async function Page() {
  const snapshot = await loadSnapshot()
  return <AppShell snapshot={snapshot} />
}
