'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navigazione principale, in basso.
 *
 * In basso e non in alto perché l'app si usa con una mano, spesso in piedi, spesso con i guanti.
 * I bersagli sono da 56 px di altezza: sopra i 44 raccomandati, perché qui si tocca male.
 */

interface Tab {
  readonly href: string
  readonly label: string
  readonly icon: React.ReactNode
}

const TABS: readonly Tab[] = [
  {
    href: '/',
    label: 'Dove vado',
    icon: (
      <path
        d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5c0 3.9 5.5 9.5 5.5 9.5s5.5-5.6 5.5-9.5A5.5 5.5 0 0 0 10 2.5Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
        fill="currentColor"
      />
    ),
  },
  {
    href: '/mappa',
    label: 'Mappa',
    icon: (
      <path
        d="M7.3 2.7 2.8 4.4A1 1 0 0 0 2.2 5.3v11c0 .7.7 1.2 1.4 1L7.3 16l5.4 1.9 4.5-1.7c.4-.2.6-.5.6-.9v-11c0-.7-.7-1.2-1.4-1L12.7 4 7.3 2.7Zm0 1.9 5.4 1.9v9L7.3 14.6v-10Z"
        fill="currentColor"
      />
    ),
  },
  {
    href: '/italia',
    label: 'Italia',
    icon: (
      <path
        d="M10 1.8a1 1 0 0 1 1 1v14.4a1 1 0 0 1-2 0V2.8a1 1 0 0 1 1-1Z
           M3.2 6.2a8.5 8.5 0 0 1 13.6 0M3.2 13.8a8.5 8.5 0 0 0 13.6 0
           M10 1.8a12 12 0 0 1 0 16.4M10 1.8a12 12 0 0 0 0 16.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    ),
  },
  {
    href: '/diario',
    label: 'Diario',
    icon: (
      <path
        d="M5 2.5h8.5A1.5 1.5 0 0 1 15 4v12.5a1 1 0 0 1-1.5.9L10 15.5l-3.5 1.9A1 1 0 0 1 5 16.5V2.5Zm2 2v9.6l3-1.6 3 1.6V4.5H7Z"
        fill="currentColor"
      />
    ),
  },
  {
    href: '/meteo',
    label: 'Meteo',
    icon: (
      <path
        d="M6.5 15.5a3.5 3.5 0 0 1-.7-6.93 4.5 4.5 0 0 1 8.73-1.9A3.75 3.75 0 0 1 14 15.5h-7.5Z
           M6 17.3v.2M9 17.3v.7M12 17.3v.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/account',
    label: 'Account',
    icon: (
      <path
        d="M10 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4 17.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navigazione principale"
      className="shrink-0 border-t border-edge bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="flex">
        {TABS.map((tab) => {
          // Anche le pagine figlie accendono la loro voce: `/italia/toscana` è dentro "Italia",
          // e lasciare la barra spenta mentre ci si sta dentro farebbe perdere il segno.
          const active =
            pathname === tab.href || (tab.href !== '/' && pathname.startsWith(`${tab.href}/`))
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1
                            text-[11px] font-medium transition-colors focus:outline-none
                            focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                              active ? 'text-accent' : 'text-ink-faint hover:text-ink-dim'
                            }`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
