import { describe, expect, it } from 'vitest'
import { clampRect, initialRect, MIN_SIZE, TASKBAR_HEIGHT, WINDOW_CHROME } from '@/features/os/window-geometry'

const bounds = { width: 1280, height: 1024 }

describe('clampRect', () => {
  it('enforces the minimum size', () => {
    expect(clampRect({ x: 10, y: 10, width: 10, height: 10 }, bounds)).toEqual({ x: 10, y: 10, ...MIN_SIZE })
  })
  it('keeps the title bar reachable: never above the top, never fully off the sides', () => {
    expect(clampRect({ x: -500, y: -40, width: 400, height: 300 }, bounds).x).toBe(-400 + 48)
    expect(clampRect({ x: -500, y: -40, width: 400, height: 300 }, bounds).y).toBe(0)
    expect(clampRect({ x: 5000, y: 2000, width: 400, height: 300 }, bounds)).toEqual({ x: 1280 - 48, y: 1024 - TASKBAR_HEIGHT - 24, width: 400, height: 300 })
  })
})

describe('initialRect', () => {
  it('fills the desk with a margin when no size is given', () => {
    expect(initialRect(bounds)).toEqual({ x: 56, y: 24, width: 1280 - 112, height: 1024 - TASKBAR_HEIGHT - 72 })
  })
  it('centres a sized window', () => {
    expect(initialRect(bounds, { width: 400, height: 300 })).toEqual({ x: 440, y: (1024 - TASKBAR_HEIGHT - 300) / 2, width: 400, height: 300 })
  })
  it('clamps a sized window to a small desk', () => {
    const r = initialRect({ width: 360, height: 640 }, { width: 400, height: 300 })
    expect(r.width).toBe(360)
    expect(r.x).toBe(0)
  })
  it('fills the height like the fill window when the shape allows, centred across the desk (4:3)', () => {
    // fill area 1168×920 → content at most 1158×862; 4:3 at 862 tall is 1149.3 wide
    const r = initialRect(bounds, undefined, 4 / 3)
    expect(r).toEqual({ x: 61, y: 24, width: 1159, height: 920 })
    expect((r.width - WINDOW_CHROME.width) / (r.height - WINDOW_CHROME.height)).toBeCloseTo(4 / 3, 2)
  })
  it('fits a wide shape to the fill width instead (16:10)', () => {
    // 16:10 at 862 tall would be 1379 wide: the 1158 content width wins, 723.75 tall
    expect(initialRect(bounds, undefined, 1.6)).toEqual({ x: 56, y: 24, width: 1168, height: 782 })
  })
  it('still fits a small desk', () => {
    const r = initialRect({ width: 800, height: 600 }, undefined, 4 / 3)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(800)
    expect(r.y + r.height).toBeLessThanOrEqual(600 - TASKBAR_HEIGHT)
  })
})
