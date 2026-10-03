import type { ComponentType } from 'react'
import type { Portfolio } from '@/lib/cms/types'
import type { IconName } from './icons'
import type { Size } from './window-geometry'
import { Credits } from './apps/Credits'
import { dosApp } from './apps/dos-app'
import { Showcase } from './apps/Showcase'

export interface OsAppProps {
  data: Portfolio
}

export interface OsApp {
  id: string
  /** A function when the title comes from content (e.g. the owner's name). */
  title: string | ((data: Portfolio) => string)
  /** The desktop label, short like the reference's ("My Showcase"); omitted = the title. */
  shortcut?: string
  icon: IconName
  component: ComponentType<OsAppProps>
  /** Opening size; omitted = fill the desk with a margin. */
  size?: Size
  /** The status bar's text; omitted = the owner's copyright line. */
  status?: string
  /** The active title bar's colour, as the reference's Doom paints its own. */
  barColor?: string
}

/** An app whose title has been resolved against the content, for the chrome that only shows text. */
export type ResolvedApp = Omit<OsApp, 'title'> & { title: string }

/** The chrome every DOS program shares, as the reference's Doom window. */
const DOS_CHROME = { status: 'Powered by JSDOS & DOSBox', barColor: '#1c1c1c' } as const

export const APPS: readonly OsApp[] = [
  // the reference's "Henry Heffernan - Showcase 2022", with our owner and this year
  { id: 'showcase', title: (data) => `${data.profile.name} - Showcase ${new Date().getFullYear()}`, shortcut: 'My Showcase', icon: 'folder', component: Showcase },
  { id: 'credits', title: 'Credits', shortcut: 'Credits', icon: 'document', component: Credits, size: { width: 1100, height: 800 } },
  { id: 'doom', title: 'Doom', shortcut: 'Doom', icon: 'doom', component: dosApp('/doom.jsdos', 'Doom'), size: { width: 980, height: 670 }, ...DOS_CHROME },
  // the window chrome is 10 px across and 58 px down: this leaves exactly its 640×480 VGA screen, unscaled
  {
    id: 'autocad',
    title: 'AutoCAD Release 12',
    shortcut: 'AutoCAD',
    icon: 'autocad',
    component: dosApp('/autocad.jsdos', 'AutoCAD'),
    // 1.5× its 640×480 VGA screen plus the window chrome (10 × 58): readable, and it fits the 1280×1024 desk
    size: { width: 970, height: 778 },
    ...DOS_CHROME,
  },
]

/** The title the title bar and taskbar show (and the shortcut, when the app has no shorter label). */
export const appTitle = (app: OsApp, data: Portfolio): string => (typeof app.title === 'function' ? app.title(data) : app.title)

/** Opened when the desktop boots. */
export const BOOT_APP = 'showcase'
