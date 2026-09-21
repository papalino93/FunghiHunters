import { AccountScreen } from '@/components/account/AccountScreen'
import { loadSnapshot } from '@/lib/snapshot/load'

export const metadata = { title: 'Account · FungiCast' }
export const revalidate = 3600

export default async function AccountPage() {
  const snapshot = await loadSnapshot()
  return <AccountScreen algorithmVersion={snapshot.algorithmVersion} />
}
