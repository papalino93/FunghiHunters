import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import './globals.css'

const sans = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const mono = JetBrains_Mono({
  variable: '--font-mono-stack',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FungiCast Toscana',
  description:
    'Compatibilità delle condizioni ambientali con la possibile fruttificazione del porcino ' +
    'in Toscana. Non indica la presenza di funghi.',
  applicationName: 'FungiCast Toscana',
  other: {
    // I dati osservati sono CC-BY-SA: l'attribuzione viaggia anche nei metadati, non solo in UI.
    'dcterms.rights': 'Dati SIR Regione Toscana (CC BY-SA), Open-Meteo (CC BY 4.0)',
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
      <body className="h-full">{children}</body>
    </html>
  )
}
