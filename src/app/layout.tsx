import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import { AuthCallbackNotice } from '@/components/AuthCallbackNotice'
import { BottomNav } from '@/components/BottomNav'
import { ServiceWorker } from '@/components/ServiceWorker'
import { AuthProvider } from '@/lib/auth/context'
import { APP_VERSION, BUILD_TIME } from '@/lib/ui/version'
import './globals.css'

const sans = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const mono = JetBrains_Mono({
  variable: '--font-mono-stack',
  subsets: ['latin'],
  display: 'swap',
})

const DESCRIPTION =
  'Compatibilità delle condizioni ambientali con la possibile fruttificazione del porcino ' +
  'in Toscana. Non indica la presenza di funghi.'

/**
 * Serve un URL assoluto per generare i link `og:image`/`twitter:image` che WhatsApp, Telegram e
 * simili leggono dall'HTML — senza, Next li risolverebbe su `localhost` in produzione. Su Vercel
 * `VERCEL_PROJECT_PRODUCTION_URL` è già il dominio giusto; `NEXT_PUBLIC_SITE_URL` resta il modo
 * per fissarlo a mano su un altro host.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL !== undefined
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'FungiCast Toscana',
  description: DESCRIPTION,
  applicationName: 'FungiCast Toscana',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FungiCast', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'FungiCast Toscana',
    description: DESCRIPTION,
    siteName: 'FungiCast Toscana',
    locale: 'it_IT',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FungiCast Toscana',
    description: DESCRIPTION,
  },
  other: {
    // I dati osservati sono CC-BY-SA: l'attribuzione viaggia anche nei metadati, non solo in UI.
    'dcterms.rights': 'Dati SIR Regione Toscana (CC BY-SA), Open-Meteo (CC BY 4.0)',
    /*
     * Versione della build, nell'HTML e non solo in pagina.
     *
     * Così si può verificare quale copia sta servendo un dispositivo senza toccarlo — basta un
     * `curl -s https://<dominio> | grep fungicast-version` — che è l'unico modo di distinguere
     * "il deploy non è passato" da "il telefono ha ancora la vecchia in cache".
     */
    'fungicast-version': APP_VERSION,
    'fungicast-build-time': BUILD_TIME,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0e16' },
    { media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
  ],
  width: 'device-width',
  initialScale: 1,
  // La mappa gestisce lo zoom da sola: quello del browser sopra crea solo confusione.
  maximumScale: 1,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="it" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="flex h-full flex-col">
        {/* Salto alla navigazione: obbligatorio per chi usa la tastiera su una pagina con mappa. */}
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50
                     focus:rounded-lg focus:bg-surface-3 focus:px-3 focus:py-2 focus:text-sm
                     focus:text-ink"
        >
          Vai al contenuto
        </a>
        <AuthProvider>
          {/* Nulla quando l'accesso non è appena fallito: vedi il commento nel componente. */}
          <AuthCallbackNotice />
          <main id="contenuto" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
