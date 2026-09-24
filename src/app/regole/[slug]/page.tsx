import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { RulesScreen } from '@/components/regole/RulesScreen'
import { PICKING_RULES, rulesBySlug } from '@/lib/rules'
import { pageMetadata, SITE_URL } from '@/lib/seo/metadata'

export const dynamicParams = false

export function generateStaticParams(): Array<{ slug: string }> {
  return PICKING_RULES.map((r) => ({ slug: r.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const rules = rulesBySlug(slug)
  if (rules === null) return { title: 'Regione non trovata', robots: { index: false } }
  const limit = rules.dailyLimitKg === null ? '' : `${String(rules.dailyLimitKg).replace('.', ',')} kg al giorno, `
  return pageMetadata({
    title: `Raccolta funghi ${rules.name}: tesserino, limiti e orari`,
    description:
      `Le regole per raccogliere funghi e porcini: ${rules.name}. Tesserino e costi, ${limit}` +
      `giorni, orari, divieti e sanzioni secondo ${rules.law}, con le fonti ufficiali.`,
    path: `/regole/${rules.slug}`,
  })
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const rules = rulesBySlug(slug)
  if (rules === null) notFound()
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Regole di raccolta', item: `${SITE_URL}/regole` },
            { '@type': 'ListItem', position: 2, name: rules.name, item: `${SITE_URL}/regole/${rules.slug}` },
          ],
        }}
      />
      <RulesScreen rules={rules} />
    </>
  )
}
