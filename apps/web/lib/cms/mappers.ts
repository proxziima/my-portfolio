import type {
  Contact, Content, Discipline as CmsDiscipline, Experience, Media, Messenger as CmsMessenger, Navigation, Post, Profile, Project, SiteSetting,
} from '@repo/cms-types'
import { formatPeriod } from '@/lib/format/period'
import { safeHref } from '@/shared/ui/chip-markup'
import { bioParagraphs } from './bio-html'
import type { Discipline, Entry, LinkItem, Messenger, MessengerPerson, NavItem, Portfolio, PostView, Settings, Spotlight } from './types'

type Related = number | CmsDiscipline

const slugsOf = (list: Related[] | null | undefined): string[] =>
  (list ?? []).flatMap((d) => (typeof d === 'object' ? [d.slug] : []))

export const toDiscipline = (d: CmsDiscipline): Discipline => ({
  slug: d.slug,
  title: d.title,
  level: d.level,
  caption: d.figureCaption,
  bio: bioParagraphs(d.bio),
  notes: (d.curiousNotes ?? []).map((n) => ({ side: n.side, text: n.text, ...(n.formula ? { formula: n.formula } : {}) })),
})

export const toExperienceEntry = (e: Experience): Entry => ({
  id: String(e.id),
  chip: e.chip,
  label: e.company,
  href: safeHref(e.url),
  meta: e.title,
  aside: formatPeriod(e.startYear, e.endYear),
  disciplines: slugsOf(e.disciplines),
})

export const toProjectEntry = (p: Project): Entry => ({
  id: String(p.id),
  chip: p.chip,
  label: p.name,
  href: safeHref(p.url),
  meta: p.summary,
  disciplines: slugsOf(p.disciplines),
})

export const toContentEntry = (c: Content): Entry => ({
  id: String(c.id),
  chip: c.chip,
  label: c.title,
  href: safeHref(c.url),
  meta: [c.kind, c.venue].filter(Boolean).join(' · '),
  aside: String(new Date(c.date).getUTCFullYear()),
  disciplines: slugsOf(c.disciplines),
})

/** An upload document (media…) as a relation returns it: an id at depth 0, the document at depth ≥ 1. */
type Upload = number | Pick<Media, 'url'> | null | undefined

export const mediaUrl = (m: Upload, base: string): string | undefined => {
  if (!m || typeof m !== 'object' || !m.url) return undefined
  try {
    const url = new URL(m.url, base)
    // Only web URLs reach src/href: a stored `javascript:` or `data:` URL resolves to itself.
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const toLinks = (c: Contact): LinkItem[] =>
  (c.links ?? []).flatMap((l) => {
    const href = safeHref(l.url)
    return href ? [{ label: l.label, chip: l.chip, href }] : []
  })

const toNav = (n: Navigation): NavItem[] =>
  (n.items ?? []).flatMap((i) => {
    const href = safeHref(i.href)
    return href ? [{ label: i.label, href, newTab: Boolean(i.newTab) }] : []
  })

const toSettings = (s: SiteSetting, base: string): Settings => ({
  seo: { title: s.seo.title, description: s.seo.description, ogImage: mediaUrl(s.seo.ogImage, base) },
  sectionLabels: s.sectionLabels,
  pickerHint: s.pickerHint,
  pageNotes: s.pageNotes,
})

export interface CmsSnapshot {
  profile: Profile
  contact: Contact
  navigation: Navigation
  settings: SiteSetting
  disciplines: CmsDiscipline[]
  experiences: Experience[]
  projects: Project[]
  content: Content[]
}

export function toPortfolio(snap: CmsSnapshot, base: string): Portfolio {
  const disciplines = snap.disciplines.map(toDiscipline)
  const configuredRef = snap.settings.defaultDiscipline
  const configured = typeof configuredRef === 'object' ? configuredRef?.slug : undefined
  const defaultSlug = disciplines.some((d) => d.slug === configured) ? configured : undefined
  return {
    profile: { name: snap.profile.name, headlineTail: snap.profile.headlineTail, email: snap.profile.email },
    disciplines,
    defaultSlug: defaultSlug ?? disciplines[0]?.slug ?? '',
    work: snap.experiences.map(toExperienceEntry),
    projects: snap.projects.map(toProjectEntry),
    content: snap.content.map(toContentEntry),
    contactLinks: toLinks(snap.contact),
    nav: toNav(snap.navigation),
    settings: toSettings(snap.settings, base),
  }
}

/** Reads only public fields: author names come from `populatedAuthors`, never from the (private) users. */
export function toPostView(p: Post, base: string): PostView {
  const hero = typeof p.heroImage === 'object' ? p.heroImage : null
  const heroUrl = mediaUrl(hero, base)
  return {
    title: p.title,
    slug: p.slug ?? '',
    ...(p.excerpt ? { excerpt: p.excerpt } : {}),
    content: p.content,
    ...(p.publishedAt ? { publishedAt: p.publishedAt } : {}),
    authors: (p.populatedAuthors ?? []).flatMap((a) => (a.name?.trim() ? [a.name.trim()] : [])),
    ...(hero && heroUrl ? { heroImage: { url: heroUrl, alt: hero.alt } } : {}),
    status: p._status === 'published' ? 'published' : 'draft',
  }
}

/** The viewer and the contact share their person fields. */
type CmsPerson = CmsMessenger['viewer'] | CmsMessenger['contact']

const toPerson = (p: CmsPerson, base: string): MessengerPerson => ({
  name: p.name,
  status: p.status,
  personalMessage: p.personalMessage?.trim() || undefined,
  listeningTo: p.listeningTo?.trim() || undefined,
  avatar: mediaUrl(p.avatar, base),
})

const toSpotlight = (s: CmsMessenger['spotlight'], base: string): Spotlight | undefined => {
  const title = s?.title?.trim()
  if (!s || !title) return undefined
  return { title, text: s.text?.trim() || undefined, href: safeHref(s.url), source: s.source?.trim() || undefined, image: mediaUrl(s.image, base) }
}

export function toMessenger(m: CmsMessenger, base: string): Messenger {
  return {
    title: m.title,
    shortcut: m.shortcut,
    viewer: toPerson(m.viewer, base),
    contact: { ...toPerson(m.contact, base), replies: m.contact.replies.map((r) => r.text) },
    labels: { ...m.labels, menu: (m.labels.menu ?? []).map((item) => item.label) },
    whatsNew: (m.whatsNew ?? []).map((w, i) => {
      const href = safeHref(w.url)
      return {
        id: w.id ?? String(i),
        text: w.text,
        link: href ? { label: w.linkLabel?.trim() || href, href } : undefined,
        image: mediaUrl(w.image, base),
      }
    }),
    spotlight: toSpotlight(m.spotlight, base),
  }
}
