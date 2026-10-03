import type { ComponentType } from 'react'
import type { Portfolio } from '@/lib/cms/types'
import type { IconName } from './icons'
import type { Size } from './window-geometry'
import { Credits } from './apps/Credits'
import { Showcase } from './apps/Showcase'

export interface OsAppProps {
  data: Portfolio
}

export interface OsApp {
  id: string
  /** A function when the title comes from content (e.g. the owner's name). */
  title: string | ((data: Portfolio) => string)
  icon: IconName
  component: ComponentType<OsAppProps>
  /** Opening size; omitted = fill the desk with a margin. */
  size?: Size
}

/** An app whose title has been resolved against the content, for the chrome that only shows text. */
export type ResolvedApp = Omit<OsApp, 'title'> & { title: string }

export const APPS: readonly OsApp[] = [
  { id: 'showcase', title: 'Showcase', icon: 'folder', component: Showcase },
  { id: 'credits', title: 'Credits', icon: 'document', component: Credits, size: { width: 1100, height: 800 } },
]

/** The title the title bar, shortcut and taskbar show. */
export const appTitle =(app: OsApp, data: Portfolio): string => (typeof app.title === 'function' ? app.title(data) : app.title)

/** Opened when the desktop boots. */
export const BOOT_APP = 'showcase'
