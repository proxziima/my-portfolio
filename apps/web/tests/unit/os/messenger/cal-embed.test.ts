// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { embedConfig, formatZoneTime, loadCal, mountInline } from '@/features/os/apps/messenger/cal-embed'

const SCRIPT = 'https://cal.example/embed/embed.js'
const booking = { calOrigin: 'https://cal.example', embedScriptUrl: SCRIPT, calLink: 'owner/intro', bookingRef: 'r.s' }

afterEach(() => {
  delete window.Cal
  document.head.querySelectorAll('script').forEach((s) => s.remove())
})

describe('cal embed', () => {
  it('passes the signed booking ref as metadata and prefills the name', () => {
    expect(embedConfig({ bookingRef: 'r.s', prefillName: 'Ana' })).toEqual({ layout: 'month_view', theme: 'light', 'metadata[bookingRef]': 'r.s', name: 'Ana' })
    expect(embedConfig({ bookingRef: 'r.s' })).toEqual({ layout: 'month_view', theme: 'light', 'metadata[bookingRef]': 'r.s' })
  })

  it('formats a time in a zone for the dialog header', () => {
    expect(formatZoneTime(new Date('2026-10-08T14:00:00Z'), 'America/Sao_Paulo')).toMatch(/11:00/)
  })

  it('queues commands as the official snippet does, loading embed.js once on the first call', () => {
    const cal = loadCal(SCRIPT)
    expect(loadCal(SCRIPT)).toBe(cal)
    expect(document.head.querySelectorAll('script')).toHaveLength(0)
    cal('init', 'a', { origin: 'https://cal.example' })
    cal('init', 'b', { origin: 'https://cal.example' })
    const scripts = document.head.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.getAttribute('src')).toBe(SCRIPT)
    expect(cal.loaded).toBe(true)
    expect(cal.q).toEqual([
      ['initNamespace', 'a'],
      ['initNamespace', 'b'],
    ])
    cal.ns.a?.('inline', { calLink: 'x' })
    expect(cal.ns.a?.q).toEqual([
      ['init', 'a', { origin: 'https://cal.example' }],
      ['inline', { calLink: 'x' }],
    ])
  })

  it('mounts the inline booker once per element, even when an effect runs twice', () => {
    const el = document.createElement('div')
    mountInline(el, 'twin1', booking)
    mountInline(el, 'twin1', booking)
    const api = window.Cal?.ns.twin1
    expect(api?.q.map((c) => c[0])).toEqual(['init', 'inline', 'ui'])
    expect(api?.q[1]).toEqual(['inline', { elementOrSelector: el, calLink: 'owner/intro', config: embedConfig({ bookingRef: 'r.s' }) }])
    const again = document.createElement('div')
    mountInline(again, 'twin1', booking)
    expect(api?.q.map((c) => c[0])).toEqual(['init', 'inline', 'ui', 'inline', 'ui'])
  })
})
