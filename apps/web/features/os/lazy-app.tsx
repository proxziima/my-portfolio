'use client'
import { lazy, type ComponentType } from 'react'
import type { OsAppProps } from './apps'

/**
 * An app whose code loads with its first window, not with the desktop: the Messenger alone brings
 * eve and zod. The window's Suspense boundary covers the wait.
 */
export function lazyApp(load: () => Promise<{ default: ComponentType<OsAppProps> }>, name: string): ComponentType<OsAppProps> {
  const App = lazy(load)
  const Lazy = (props: OsAppProps) => <App {...props} />
  Lazy.displayName = name
  return Lazy
}
