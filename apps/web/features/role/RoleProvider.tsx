'use client'
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { Discipline } from '@/lib/cms/types'
import { initialRoleState, roleIndex, roleReducer } from './role-state'
import { useRolePersistence } from './use-role-persistence'

interface RoleContextValue {
  disciplines: Discipline[]
  current: Discipline
  index: number
  /** Unbounded; the drum angle and picker rows derive from it. */
  position: number
  animate: boolean
  step: (delta: number) => void
  select: (slug: string) => void
}

interface Props {
  /** At least one. */
  disciplines: Discipline[]
  defaultSlug: string
  children: ReactNode
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ disciplines, defaultSlug, children }: Props) {
  const slugs = useMemo(() => disciplines.map((d) => d.slug), [disciplines])
  const [state, dispatch] = useReducer(roleReducer, undefined, () =>
    initialRoleState(disciplines.length, Math.max(0, slugs.indexOf(defaultSlug))),
  )
  const index = roleIndex(state)

  const step = useCallback((delta: number) => dispatch({ type: 'step', delta }), [])
  const select = useCallback(
    (slug: string) => {
      const i = slugs.indexOf(slug)
      if (i >= 0) dispatch({ type: 'select', index: i })
    },
    [slugs],
  )
  const hydrate = useCallback(
    (slug: string) => {
      const i = slugs.indexOf(slug)
      if (i >= 0) dispatch({ type: 'hydrate', index: i })
    },
    [slugs],
  )

  useRolePersistence({ slugs, currentSlug: slugs[index] ?? '', hydrate, select })

  const value = useMemo<RoleContextValue>(
    () => ({
      disciplines,
      current: disciplines[index]!,
      index,
      position: state.position,
      animate: state.animate,
      step,
      select,
    }),
    [disciplines, index, state.position, state.animate, step, select],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext)
  if (!value) throw new Error('useRole must be used inside <RoleProvider>')
  return value
}
