import { DiaryScreen } from '@/components/diary/DiaryScreen'
import { loadSnapshot } from '@/lib/snapshot/load'

export const metadata = { title: 'Diario uscite · FungiCast' }
export const revalidate = 3600

export default async function DiarioPage() {
  return <DiaryScreen snapshot={await loadSnapshot()} />
}
