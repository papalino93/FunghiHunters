import Link from 'next/link'

import { formatDate } from '@/lib/ui/scale'

/**
 * Il limite del modello, sempre visibile — non richiudibile come il benvenuto — con quanto è
 * fresco il dato e dove si legge come è fatto.
 *
 * Prima compariva solo nell'intestazione della mappa e, una volta sola, nel benvenuto della home
 * (`WelcomeHero`, che si chiude e non si ripresenta più). Chi ha già chiuso il benvenuto non
 * rivedeva più, in home, la frase più importante del progetto — un buco reale nella "fiducia
 * visibile" che questa funzione doveva garantire.
 *
 * L'ora del calcolo è scritta come data e ora fisse nel fuso di Roma (non «oggi»/«ieri»): è lo
 * stesso testo sul server e nel browser, a qualunque ora si apra la pagina.
 */
export function ModelLimitsNotice({
  generatedAt,
  measured,
}: {
  /** `generatedAt` dello snapshot (ISO), o `undefined` per uno snapshot che non lo porta. */
  generatedAt?: string
  /** `true` se la zona del verdetto usa stazioni al suolo, `false` se è solo modello. */
  measured: boolean
}) {
  const when = generatedAt === undefined ? null : calculatedAt(generatedAt)
  return (
    <div className="space-y-1 text-xs leading-snug text-ink-faint">
      <p>
        {when !== null && <>Calcolato {when} · </>}
        {measured ? 'pioggia e temperature misurate da stazioni' : 'stima del solo modello meteo'} ·{' '}
        <Link href="/metodo" className="text-accent underline underline-offset-2">
          come lo calcoliamo
        </Link>
      </p>
      <p>
        L&apos;indice descrive condizioni ambientali compatibili con la fruttificazione, non la
        presenza reale di funghi: non indica quantità, commestibilità né sicurezza della raccolta.
      </p>
    </div>
  )
}

function calculatedAt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${formatDate(`${get('year')}-${get('month')}-${get('day')}`)} alle ${get('hour')}:${get('minute')}`
}
