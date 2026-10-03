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
  title: string
  icon: IconName
  component: ComponentType<OsAppProps>
  /** Opening size; omitted = fill the desk with a margin. */
  size?: Size
}

export const APPS: readonly OsApp[] = [
  { id: 'showcase', title: 'Showcase', icon: 'folder', component: Showcase },
  { id: 'credits', title: 'Credits', icon: 'document', component: Credits, size: { width: 480, height: 360 } },
]

/** Opened when the desktop boots. */
export const BOOT_APP = 'showcase'
