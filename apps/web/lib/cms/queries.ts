import 'server-only'
import { cache } from 'react'
import type { Company, Contact, Content, Messenger as CmsMessenger, Discipline, Experience, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toMessenger, toPortfolio } from './mappers'
import type { Messenger, Portfolio } from './types'

interface List<T> { docs: T[] }
const cmsList = <T>(slug: string, sort = 'order') => cmsGet<List<T>>(`/api/${slug}?sort=${sort}&limit=100&depth=1`).then((r) => r.docs)
const cmsGlobal = <T>(slug: string) => cmsGet<T>(`/api/globals/${slug}?depth=1`)

export const getPortfolio = cache(async (): Promise<Portfolio> => {
  const [profile, contact, navigation, settings, disciplines, companies, experiences, projects, content] = await Promise.all([
    cmsGlobal<Profile>('profile'), cmsGlobal<Contact>('contact'), cmsGlobal<Navigation>('navigation'), cmsGlobal<SiteSetting>('site-settings'),
    cmsList<Discipline>('disciplines'), cmsList<Company>('companies', 'name'), cmsList<Experience>('experiences'), cmsList<Project>('projects'), cmsList<Content>('content'),
  ])
  return toPortfolio({ profile, contact, navigation, settings, disciplines, companies, experiences, projects, content }, cmsBaseUrl())
})

/** The Messenger app's content; only the OS desktop shows it, so only `/os` fetches it. */
export const getMessenger = cache(async (): Promise<Messenger> => {
  const [messenger, owner] = await Promise.all([cmsGlobal<CmsMessenger>('messenger'), cmsGlobal<Profile>('profile')])
  return toMessenger(messenger, owner, cmsBaseUrl())
})
