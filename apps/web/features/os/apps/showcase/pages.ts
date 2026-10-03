import type { Discipline, Portfolio } from '@/lib/cms/types'

/** The reference's five routes; Content & community lives on the Projects page. */
export type ShowcasePage = 'home' | 'about' | 'work' | 'projects' | 'contact'

export interface NavItem {
  page: ShowcasePage
  label: string
}

/** The sidebar's links in the reference's order, labelled uppercase like its router links. */
export const navItems = (data: Portfolio): NavItem[] => [
  { page: 'home', label: 'HOME' },
  { page: 'about', label: 'ABOUT' },
  { page: 'work', label: data.settings.sectionLabels.work.toUpperCase() },
  { page: 'projects', label: data.settings.sectionLabels.projects.toUpperCase() },
  { page: 'contact', label: 'CONTACT' },
]

/** The discipline the letter opens on: the Showcase shows that one view, like the page's first paint. */
export const defaultDiscipline = (data: Portfolio): Discipline | undefined =>
  data.disciplines.find((d) => d.slug === data.defaultSlug) ?? data.disciplines[0]
