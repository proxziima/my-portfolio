import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Portfolio } from '@/lib/cms/types'
import { personJsonLd } from '@/lib/seo/json-ld'

afterEach(() => vi.unstubAllEnvs())

const data = {
  profile: { name: 'Ada Lovelace', headlineTail: 'builds things', email: 'ada@x.dev' },
  disciplines: [{ slug: 'eng', title: 'Software engineer', level: '', caption: '', bio: [], notes: [] }],
  defaultSlug: 'eng',
  contactLinks: [
    { label: 'GitHub', chip: 'GH', href: 'https://github.com/ada' },
    { label: 'Email', chip: '@', href: 'mailto:ada@x.dev' },
  ],
  settings: { seo: { title: 'Ada', description: 'Engineer', ogImage: 'https://cms.x.dev/og.png' } },
} as unknown as Portfolio

describe('siteUrl', () => {
  it('uses SITE_URL without a trailing slash, else localhost', async () => {
    const { siteUrl } = await import('@/lib/site')
    vi.stubEnv('SITE_URL', 'https://ada.dev/')
    expect(siteUrl()).toBe('https://ada.dev')
    vi.stubEnv('SITE_URL', '')
    expect(siteUrl()).toBe('http://localhost:3000')
  })
})

describe('personJsonLd', () => {
  it('describes the owner and the site, with web profiles only', () => {
    const graph = personJsonLd(data, 'https://ada.dev')
    expect(graph).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Person', '@id': 'https://ada.dev/#person', name: 'Ada Lovelace', jobTitle: 'Software engineer', url: 'https://ada.dev', image: 'https://cms.x.dev/og.png', sameAs: ['https://github.com/ada'] },
        { '@type': 'WebSite', '@id': 'https://ada.dev/#website', url: 'https://ada.dev', name: 'Ada', description: 'Engineer', publisher: { '@id': 'https://ada.dev/#person' } },
      ],
    })
  })
})

describe('robots and sitemap', () => {
  it('keeps crawlers off private paths and points to the sitemap', async () => {
    vi.stubEnv('SITE_URL', 'https://ada.dev')
    const { default: robots } = await import('@/app/robots')
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/relay/', '/blog/preview/', '/os'] },
      sitemap: 'https://ada.dev/sitemap.xml',
      host: 'https://ada.dev',
    })
  })
  it('lists the home page', async () => {
    vi.stubEnv('SITE_URL', 'https://ada.dev')
    const { default: sitemap } = await import('@/app/sitemap')
    expect(sitemap()).toEqual([{ url: 'https://ada.dev/', changeFrequency: 'monthly', priority: 1 }])
  })
})
