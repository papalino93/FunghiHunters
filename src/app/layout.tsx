import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'

import { AuthCallbackNotice } from '@/components/AuthCallbackNotice'
import { BottomNav } from '@/components/BottomNav'
import { ServiceWorker } from '@/components/ServiceWorker'
import { AuthProvider } from '@/lib/auth/context'
import {
  BASE_OPEN_GRAPH,
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  TITLE_SUFFIX,
} from '@/lib/seo/metadata'
import { APP_VERSION, BUILD_TIME } from '@/lib/ui/version'
import { WELCOME_BOOT_SCRIPT } from '@/lib/ui/welcome'
import './globals.css'

const sans = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const mono = JetBrains_Mono({
  variable: '--font-mono-stack',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  /*
   * Serve un URL assoluto per i link `og:image`/`twitter:image` che WhatsApp, Telegram e simili
   * leggono dall'HTML, e per i canonical che ogni pagina dichiara con un percorso relativo (vedi
   * `pageMetadata`). Da dove arriva l'indirizzo è spiegato in `lib/seo/metadata.ts`.
   */
  metadataBase: new URL(SITE_URL),
  /*
   * Il template aggiunge " · FungiCast" ai titoli delle pagine figlie, invece di lasciarlo
   * scrivere a mano a ognuna: così nessuna resta senza (com'era `/italia`), e nessuna lo ripete.
   * Non vale per la home, che sta nello stesso segmento del layout e si chiama FungiCast e basta.
   */
  title: { default: SITE_NAME, template: `%s${TITLE_SUFFIX}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: 'FungiCast',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FungiCast', statusBarStyle: 'black-translucent' },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FungiCast',
    description: DEFAULT_DESCRIPTION,
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
  /*
   * Niente `maximumScale: 1`: impediva a chi ha bisogno di ingrandire testo o interfaccia di
   * farlo, che è una barriera di accessibilità reale, non un dettaglio — su un telefono al sole,
   * con gli occhiali sbagliati o no, è la differenza fra leggere l'app e non leggerla. La mappa
   * (`MapView`) gestisce comunque il proprio zoom internamente, senza bisogno di questo blocco.
   */
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    /*
     * `suppressHydrationWarning` solo per l'attributo `data-welcome`, che lo script qui sotto può
     * aggiungere a `<html>` prima dell'idratazione: React lo vedrebbe come una differenza dal
     * markup del server. Vale per gli attributi di questo elemento, non per i figli.
     */
    <html
      lang="it"
      className={`${sans.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col">
        {/*
         * Deve girare prima che il browser disegni la home: per questo è in linea e in cima al
         * body, e non un `next/script` (che parte dopo). Vedi `lib/ui/welcome.ts`.
         */}
        <script dangerouslySetInnerHTML={{ __html: WELCOME_BOOT_SCRIPT }} />
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
        {/*
         * Widget flottante di Buy Me a Coffee: script ufficiale, caricato dopo tutto il resto
         * (`lazyOnload`) perché non è mai necessario all'uso dell'app. Un'unica istanza qui basta
         * per tutte le pagine: la navigazione fra schede è lato client, non ricarica il body.
         */}
        <Script
          src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
          strategy="lazyOnload"
          data-name="BMC-Widget"
          data-cfasync="false"
          data-id="papalino"
          data-description="Support me on Buy me a coffee!"
          data-message=""
          data-color="#BD5FFF"
          data-position="Right"
          data-x_margin="18"
          data-y_margin="18"
        />
      </body>
    </html>
  )
}
