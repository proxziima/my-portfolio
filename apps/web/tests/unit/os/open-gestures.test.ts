import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { openGestures } from '@/features/os/open-gestures'

const click = (detail: number) => ({ detail }) as MouseEvent

describe('openGestures', () => {
  it('opens on a double click', () => {
    const onOpen = vi.fn()
    openGestures(onOpen).onDoubleClick()
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('opens on a keyboard or screen reader click (detail 0)', () => {
    const onOpen = vi.fn()
    openGestures(onOpen).onClick(click(0))
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('only selects on a single mouse click', () => {
    const onOpen = vi.fn()
    openGestures(onOpen).onClick(click(1))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
