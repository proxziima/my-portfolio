'use client'
import { useSyncExternalStore } from 'react'
import { currentTheme, THEME_STORAGE_KEY, type Theme } from './theme-dom'

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_STORAGE_KEY) cb() }
  addEventListener('storage', onStorage)
  return () => { mo.disconnect(); mq.removeEventListener('change', cb); removeEventListener('storage', onStorage) }
}

/** The `data-theme` attribute (or the system preference) is the single source of truth. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme, () => 'light')
