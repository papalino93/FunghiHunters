import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { PICKING_RULES, rulesBySlug } from '@/lib/rules'
import { coverage, formatLongDate } from '@/lib/rules/format'
import { rulesLinksFor } from '@/lib/rules/links'

const index = JSON.parse(readFileSync('public/data/italia-index.json', 'utf8')) as {
  regions: Array<{ slug: string; name: string }>
}

describe('norme di raccolta', () => {
  it('ogni regione dell app ha la sua pagina, e ogni pagina appartiene a una regione', () => {
    const pages = new Set(PICKING_RULES.map((r) => r.slug))
    for (const region of index.regions) {
      for (const link of rulesLinksFor(region.slug, region.name)) {
        expect(pages.has(link.slug), `${region.slug} → ${link.slug}`).toBe(true)
        expect(rulesBySlug(link.slug)?.regionSlug).toBe(region.slug)
      }
    }
    const regions = new Set(index.regions.map((r) => r.slug))
    for (const r of PICKING_RULES) expect(regions.has(r.regionSlug), r.slug).toBe(true)
  })

  it('slug unici, date di verifica valide, collegamenti solo https o http', () => {
    expect(new Set(PICKING_RULES.map((r) => r.slug)).size).toBe(PICKING_RULES.length)
    for (const r of PICKING_RULES) {
      expect(r.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const url of [r.lawUrl, r.officialPageUrl, r.permit.sourceUrl]) {
        if (url !== null) expect(url).toMatch(/^https?:\/\//)
      }
      if (r.dailyLimitKg !== null) expect(r.dailyLimitKg).toBeGreaterThan(0)
    }
  })

  it('la Toscana dice le stesse cose di «Prima di partire»', () => {
    const t = rulesBySlug('toscana')
    expect(t?.dailyLimitKg).toBe(3)
    expect(t?.minSizePorcini).toContain('4 cm')
    expect(t?.permit.cost).toContain('25 €')
    expect(coverage(t!)).toBe('completa')
  })

  it('scrive la data per esteso', () => {
    expect(formatLongDate('2026-09-24')).toBe('24 settembre 2026')
  })
})
