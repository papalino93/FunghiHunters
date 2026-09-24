import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { INDEXNOW_KEY, indexNowPayload, sitemapUrls } from '@/lib/seo/indexnow'

describe('IndexNow', () => {
  it('pubblica la chiave nel file che il protocollo si aspetta', () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/)
    const file = `public/${INDEXNOW_KEY}.txt`
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8').trim()).toBe(INDEXNOW_KEY)
  })

  it('legge dalla sitemap solo gli indirizzi del sito, senza doppioni', () => {
    const xml = `<urlset><url><loc>https://x.it/</loc></url><url><loc> https://x.it/regole </loc></url>
      <url><loc>https://x.it/regole</loc></url><url><loc>https://altro.it/</loc></url></urlset>`
    expect(sitemapUrls(xml, 'https://x.it')).toEqual(['https://x.it/', 'https://x.it/regole'])
  })

  it('costruisce la richiesta con host e posizione della chiave', () => {
    const p = indexNowPayload('https://x.it', ['https://x.it/'])
    expect(p.host).toBe('x.it')
    expect(p.keyLocation).toBe(`https://x.it/${INDEXNOW_KEY}.txt`)
    expect(p.urlList).toEqual(['https://x.it/'])
  })
})
