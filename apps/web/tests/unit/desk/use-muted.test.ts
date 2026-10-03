// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MUTED_KEY, useMuted } from '@/features/desk/use-muted'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let latest: ReturnType<typeof useMuted> | undefined

function Harness() {
  latest = useMuted()
  return null
}

let host: HTMLElement
let root: Root

const mount = () => {
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  latest = undefined
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  localStorage.clear()
})

describe('useMuted', () => {
  it('is off by default with nothing stored', () => {
    mount()
    expect(latest?.[0]).toBe(false)
  })

  it('toggle mutes and remembers it', () => {
    mount()
    act(() => latest?.[1]())
    expect(latest?.[0]).toBe(true)
    expect(localStorage.getItem(MUTED_KEY)).toBe('1')
  })

  it('reads a stored choice after mount', () => {
    localStorage.setItem(MUTED_KEY, '1')
    mount()
    expect(latest?.[0]).toBe(true)
  })
})
