import 'server-only'
import { cache } from 'react'
import type { Contact, Content, Discipline, Experience, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toPortfolio } from './mappers'
import type { Portfolio } from './types'

interface List<T> { docs: T[] }
const cmsList = <T>(slug: string) => cmsGet<List<T>>(`/api/${slug}?sort=order&limit=100&depth=1`).then((r) => r.docs)
const cmsGlobal = <T>(slug: string) => cmsGet<T>(`/api/globals/${slug}?depth=1`)

export const getPortfolio = cache(async (): Promise<Portfolio> => {
  const [profile, contact, navigation, settings, disciplines, experiences, projects, content] = await Promise.all([
    cmsGlobal<Profile>('profile'), cmsGlobal<Contact>('contact'), cmsGlobal<Navigation>('navigation'), cmsGlobal<SiteSetting>('site-settings'),
    cmsList<Discipline>('disciplines'), cmsList<Experience>('experiences'), cmsList<Project>('projects'), cmsList<Content>('content'),
  ])
  return toPortfolio({ profile, contact, navigation, settings, disciplines, experiences, projects, content }, cmsBaseUrl())
})
