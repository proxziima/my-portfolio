import type {
  Contact, Content, Discipline as CmsDiscipline, Experience, Media, Navigation, Profile, Project, SiteSetting,
} from '@repo/cms-types'
import { formatPeriod } from '@/lib/format/period'
import { safeHref } from '@/shared/ui/chip-markup'
import { bioParagraphs } from './bio-html'
import type { Discipline, Entry, LinkItem, NavItem, Portfolio, Settings } from './types'

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

export const filterByDiscipline = (rows: Entry[], slug: string): Entry[] =>
  rows.filter((r) => r.disciplines.length === 0 || r.disciplines.includes(slug))

export const mediaUrl = (m: number | Media | null | undefined, base: string): string | undefined => {
  if (!m || typeof m !== 'object' || !m.url) return undefined
  try {
    return new URL(m.url, base).toString()
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
  splineSceneUrl: s.figure?.splineSceneUrl || '/spline/scene.splinecode',
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
