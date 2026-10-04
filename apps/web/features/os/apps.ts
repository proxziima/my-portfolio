import type { ComponentType } from 'react'
import type { Messenger as MessengerData, Portfolio } from '@/lib/cms/types'
import type { IconName } from './icons'
import type { Size } from './window-geometry'
import { Credits } from './apps/Credits'
import { dosApp } from './apps/dos-app'
import { Showcase } from './apps/Showcase'

/** What the OS apps read: the portfolio plus the content only the desktop shows. */
export interface OsData extends Portfolio {
  messenger: MessengerData
}

export interface OsAppProps {
  data: OsData
  /** Opens another app's window, or raises it when open, as the Messenger opens a conversation. */
  open: (appId: string) => void
}

/** Text that is fixed, or that comes from content (e.g. the owner's name). */
type Text = string | ((data: OsData) => string)

export interface OsApp {
  id: string
  title: Text
  /** The desktop label, short like the reference's ("My Showcase"); omitted = the title (resolved by resolveApp). */
  shortcut?: Text
  /** false: no desktop shortcut; another app opens it (the Messenger's conversation). */
  desktop?: false
  icon: IconName
  component: ComponentType<OsAppProps>
  /** Opening size; omitted = fill the desk with a margin. */
  size?: Size
  /** Opening shape instead of a size: content width / height, as tall as the fill window allows. */
  aspect?: number
  /** The status bar's text; omitted = the owner's copyright line. */
  status?: string
  /** The active title bar's colour, as the reference's Doom paints its own. */
  barColor?: string
}

/** An app whose texts have been resolved against the content, for the chrome that only shows text. */
export type ResolvedApp = Omit<OsApp, 'title' | 'shortcut'> & { title: string; shortcut: string }

const resolve = (text: Text, data: OsData): string => (typeof text === 'function' ? text(data) : text)

export const resolveApp = (app: OsApp, data: OsData): ResolvedApp => ({
  ...app,
  title: resolve(app.title, data),
  shortcut: resolve(app.shortcut ?? app.title, data),
})

/** The apps with a desktop shortcut. */
export const desktopApps = <T extends { desktop?: false }>(apps: readonly T[]): T[] => apps.filter((app) => app.desktop !== false)

/** The chrome every DOS program shares, as the reference's Doom window. */
const DOS_CHROME = { status: 'Powered by JSDOS & DOSBox', barColor: '#1c1c1c' } as const

export const APPS: readonly OsApp[] = [
  // the reference's "Henry Heffernan - Showcase 2022", with our owner and this year
  { id: 'showcase', title: (data) => `${data.profile.name} - Showcase ${new Date().getFullYear()}`, shortcut: 'My Showcase', icon: 'folder', component: Showcase },
  {
    id: 'resume',
    title: 'My Resume',
    shortcut: 'My Resume',
    icon: 'resume',
    // Acrobat Reader for DOS opening the résumé (content/resume.md, built in by `bun run resume:pdf`)
    component: dosApp('/resume.jsdos', 'Resume'),
    // its 640×480 VGA screen, as tall as the Showcase window, like AutoCAD
    aspect: 4 / 3,
    ...DOS_CHROME,
  },
  { id: 'credits', title: 'Credits', shortcut: 'Credits', icon: 'document', component: Credits, size: { width: 1100, height: 800 } },
  { id: 'doom', title: 'Doom', shortcut: 'Doom', icon: 'doom', component: dosApp('/doom.jsdos', 'Doom'), size: { width: 980, height: 670 }, ...DOS_CHROME },
  {
    id: 'autocad',
    title: 'AutoCAD Release 12',
    shortcut: 'AutoCAD',
    icon: 'autocad',
    component: dosApp('/autocad.jsdos', 'AutoCAD'),
    // its 640×480 VGA screen, as tall as the Showcase window (about 1149×862 on the 1280×1024 desk)
    aspect: 4 / 3,
    ...DOS_CHROME,
  },
]

/** Opened when the desktop boots. */
export const BOOT_APP = 'showcase'
