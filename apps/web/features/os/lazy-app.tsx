'use client'
import { createContext, lazy, useContext, type ComponentType, type LazyExoticComponent } from 'react'
import type { OsAppProps } from './apps'

/** A lazily loaded module that never arrived (offline, or a tab older than the deploy), told apart from an app's own crash. */
export class AppLoadError extends Error {
  constructor(cause: unknown) {
    super('An OS app failed to load', { cause })
    this.name = 'AppLoadError'
  }
}

/**
 * Identifies the current mount or retry of a window's boundary. A load that failed under an older
 * one is imported again; under the same one the failure stands, so React's re-render of an error
 * cannot turn into an import loop.
 */
export const LoadAttempt = createContext<object | null>(null)

/**
 * `React.lazy` that can be retried: `lazy` caches a rejected import for good, so after a failure a
 * new attempt (Retry, or the window reopened) gets a fresh one. A loaded module stays cached.
 */
export function retryableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  let Current: LazyExoticComponent<ComponentType<P>> | null = null
  // the attempt the current import failed under; undefined while it has not failed
  let failedUnder: object | null | undefined
  const make = (attempt: object | null) =>
    lazy(() =>
      load().catch((error: unknown) => {
        failedUnder = attempt
        throw new AppLoadError(error)
      }),
    )
  return function Retryable(props: P) {
    const attempt = useContext(LoadAttempt)
    if (!Current || (failedUnder !== undefined && failedUnder !== attempt)) {
      failedUnder = undefined
      Current = make(attempt)
    }
    return <Current {...props} />
  }
}

/**
 * An app whose code loads with its first window, not with the desktop: the Messenger alone brings
 * eve and zod. The window's Suspense boundary covers the wait, its error boundary a failed load.
 */
export function lazyApp(load: () => Promise<{ default: ComponentType<OsAppProps> }>, name: string): ComponentType<OsAppProps> {
  const Lazy = retryableLazy(load)
  Lazy.displayName = name
  return Lazy
}
