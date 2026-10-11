import type { Portfolio } from '@/lib/cms/types'

/** schema.org Person + WebSite for the home page: what search engines use for a person's knowledge panel. */
export function personJsonLd(data: Pick<Portfolio, 'profile' | 'disciplines' | 'defaultSlug' | 'contactLinks' | 'settings'>, site: string) {
  const person = `${site}/#person`
  const jobTitle = data.disciplines.find((d) => d.slug === data.defaultSlug)?.title ?? data.disciplines[0]?.title
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: data.profile.name,
        ...(jobTitle ? { jobTitle } : {}),
        url: site,
        ...(data.settings.seo.ogImage ? { image: data.settings.seo.ogImage } : {}),
        sameAs: data.contactLinks.map((l) => l.href).filter((href) => /^https?:\/\//.test(href)),
      },
      { '@type': 'WebSite', '@id': `${site}/#website`, url: site, name: data.settings.seo.title, description: data.settings.seo.description, publisher: { '@id': person } },
    ],
  }
}
