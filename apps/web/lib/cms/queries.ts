import 'server-only'
import { cache } from 'react'
import type { Contact, Content, Discipline, Experience, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toPortfolio } from './mappers'
import type { Portfolio } from './types'

interface List<T> { docs: T[] }
const list = <T,>(slug: string) => cmsGet<List<T>>(`/api/${slug}?sort=order&limit=100&depth=1`).then((r) => r.docs)
const global = <T,>(slug: string) => cmsGet<T>(`/api/globals/${slug}?depth=1`)

export const getPortfolio = cache(async (): Promise<Portfolio> => {
  const [profile, contact, navigation, settings, disciplines, experiences, projects, content] = await Promise.all([
    global<Profile>('profile'), global<Contact>('contact'), global<Navigation>('navigation'), global<SiteSetting>('site-settings'),
    list<Discipline>('disciplines'), list<Experience>('experiences'), list<Project>('projects'), list<Content>('content'),
  ])
  return toPortfolio({ profile, contact, navigation, settings, disciplines, experiences, projects, content }, cmsBaseUrl())
})
