import { mod, shortestDelta } from './role-cycle'

/**
 * The single source of truth for the role: an unbounded `position`. The role is
 * `order[mod(position, count)]`; the drum angle and the picker rows derive from
 * it, so both loop forever without renormalising.
 */
export interface RoleState {
  position: number
  count: number
  /** false after a hydrate, so the restored role lands without a roll. */
  animate: boolean
}

export type RoleAction =
  | { type: 'step'; delta: number }
  | { type: 'select'; index: number }
  | { type: 'hydrate'; index: number }

export const initialRoleState = (count: number, index: number): RoleState => ({
  position: index,
  count,
  animate: false,
})

export const roleIndex = (s: RoleState): number => mod(s.position, s.count)

/** Pure: no persistence or DOM work here (Q2). */
export function roleReducer(state: RoleState, action: RoleAction): RoleState {
  switch (action.type) {
    case 'step':
      return action.delta === 0 || state.count <= 1
        ? state
        : { ...state, position: state.position + action.delta, animate: true }
    case 'select': {
      const delta = shortestDelta(roleIndex(state), action.index, state.count)
      return delta === 0 ? state : { ...state, position: state.position + delta, animate: true }
    }
    case 'hydrate':
      return action.index === roleIndex(state)
        ? state
        : { ...state, position: action.index, animate: false }
  }
}
