// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const router = { refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

interface LivePreviewProps { refresh: () => void; serverURL: string }
const received: LivePreviewProps[] = []
vi.mock('@payloadcms/live-preview-react', () => ({
  RefreshRouteOnSave: (props: LivePreviewProps) => {
    received.push(props)
    return null
  },
}))

const { RefreshRouteOnSave } = await import('@/features/blog/RefreshRouteOnSave')

let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  received.length = 0
  router.refresh.mockClear()
  root = createRoot(document.createElement('div'))
})
afterEach(() => act(() => root.unmount()))

describe('RefreshRouteOnSave', () => {
  it('listens for the CMS admin origin and refreshes the route on save', () => {
    act(() => root.render(createElement(RefreshRouteOnSave, { cmsOrigin: 'http://cms.test' })))
    const props = received.at(-1)
    expect(props?.serverURL).toBe('http://cms.test')
    expect(router.refresh).not.toHaveBeenCalled()
    props?.refresh()
    expect(router.refresh).toHaveBeenCalledOnce()
  })
  it('keeps the same refresh callback across renders, so the listener is not re-subscribed', () => {
    act(() => root.render(createElement(RefreshRouteOnSave, { cmsOrigin: 'http://cms.test' })))
    act(() => root.render(createElement(RefreshRouteOnSave, { cmsOrigin: 'http://cms.test' })))
    expect(received).toHaveLength(2)
    expect(received[0]?.refresh).toBe(received[1]?.refresh)
  })
})
