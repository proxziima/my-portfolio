// @vitest-environment jsdom
import { createElement, useRef, useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderParagraphs } from '@/features/bio/morph/render'
import { useWordMorph } from '@/features/bio/use-word-morph'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const A = ['I am <strong>plumber</strong>.']
const B = ['I am <strong>janitor</strong>.']
const C = ['I am <strong>pilot</strong>.']

interface Props {
  paragraphs: string[]
  animate: boolean
  reduce?: boolean
  onRender: () => void
}

function Harness({ paragraphs, animate, reduce = false, onRender }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [initialHtml] = useState(() => renderParagraphs(paragraphs))
  useWordMorph(ref, paragraphs, { animate, reduce, onRender })
  return createElement('div', { ref, id: 'bio', dangerouslySetInnerHTML: { __html: initialHtml } })
}

let host: HTMLElement
let root: Root
const bio = () => host.querySelector('#bio')!

const mount = (props: Props) =>
  act(() => {
    root.render(createElement(Harness, props))
  })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('useWordMorph', () => {
  it('rewrites synchronously on the non-animated path and reports it', async () => {
    const onRender = vi.fn()
    await mount({ paragraphs: A, animate: false, onRender })
    expect(onRender).not.toHaveBeenCalled()
    await mount({ paragraphs: B, animate: false, onRender })
    expect(bio().innerHTML).toBe(renderParagraphs(B))
    expect(bio().querySelector('.w.in, .w.out')).toBeNull()
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('takes the instant path under reduced motion', async () => {
    const onRender = vi.fn()
    await mount({ paragraphs: A, animate: true, reduce: true, onRender })
    await mount({ paragraphs: B, animate: true, reduce: true, onRender })
    expect(bio().innerHTML).toBe(renderParagraphs(B))
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('fades old words out, swaps after 240ms, then reveals the new ones', async () => {
    const onRender = vi.fn()
    await mount({ paragraphs: A, animate: true, onRender })
    await mount({ paragraphs: B, animate: true, onRender })
    expect(bio().querySelectorAll('.w.out')).toHaveLength(1)
    expect(bio().querySelector('.w.out')!.textContent).toBe('plumber')
    expect(onRender).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTime(239))
    expect(onRender).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTime(1))
    expect(onRender).toHaveBeenCalledTimes(1)
    expect(bio().querySelectorAll('.w.in')).toHaveLength(1)
    expect(bio().textContent).toBe('I am janitor.')

    await act(() => vi.advanceTimersByTime(100))
    expect(bio().querySelector('.w.in')).toBeNull()
    expect(bio().querySelector<HTMLElement>('.w strong')!.parentElement!.style.transitionDelay).toBe('0ms')
  })

  it('flushes a morph in flight and reports it, so the toggle can be resynced', async () => {
    const onRender = vi.fn()
    await mount({ paragraphs: A, animate: true, onRender })
    await mount({ paragraphs: B, animate: true, onRender })
    await act(() => vi.advanceTimersByTime(100))
    expect(onRender).not.toHaveBeenCalled()

    await mount({ paragraphs: C, animate: true, onRender })
    expect(onRender).toHaveBeenCalledTimes(1) // the flush
    // flushed to B, and C's leaving word is already fading
    expect(bio().textContent).toBe('I am janitor.')
    expect(bio().querySelector('.w.out')!.textContent).toBe('janitor')

    await act(() => vi.advanceTimersByTime(240))
    expect(onRender).toHaveBeenCalledTimes(2)
    expect(bio().textContent).toBe('I am pilot.')
    await act(() => vi.advanceTimersByTime(100))
    expect(bio().querySelector('.w.in, .w.out')).toBeNull()
    expect(bio().textContent).toBe('I am pilot.')
  })

  it('ignores a new array with identical content', async () => {
    const onRender = vi.fn()
    await mount({ paragraphs: A, animate: true, onRender })
    const before = bio().innerHTML
    await mount({ paragraphs: [...A], animate: true, onRender })
    await act(() => vi.advanceTimersByTime(500))
    expect(bio().innerHTML).toBe(before)
    expect(onRender).not.toHaveBeenCalled()
  })
})
