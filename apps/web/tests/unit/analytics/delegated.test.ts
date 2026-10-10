// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyLink, installDelegatedTracking } from '@/lib/analytics/delegated'

describe('classifyLink', () => {
  const origin = 'https://me.dev'
  it('classifies external links by channel', () => {
    expect(classifyLink('https://github.com/me/repo', origin)).toEqual({ href: 'https://github.com/me/repo', host: 'github.com', kind: 'external', channel: 'github' })
    expect(classifyLink('https://www.linkedin.com/in/me', origin)?.channel).toBe('linkedin')
    expect(classifyLink('https://cal.com/me/30min', origin)?.channel).toBe('calendar')
    expect(classifyLink('https://example.org', origin)?.channel).toBe('other')
  })
  it('classifies mailto as an email conversion without leaking the address host as a site', () => {
    expect(classifyLink('mailto:me@me.dev', origin)).toEqual({ href: 'mailto:me@me.dev', host: 'me.dev', kind: 'mailto', channel: 'email' })
  })
  it('ignores same-origin and relative links', () => {
    expect(classifyLink('/os', origin)).toBeNull()
    expect(classifyLink('https://me.dev/blog', origin)).toBeNull()
    expect(classifyLink('#work', origin)).toBeNull()
  })
})

describe('installDelegatedTracking', () => {
  const track = vi.fn()
  let uninstall: () => void
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="work" aria-labelledby="work-title"><h2 id="work-title">Work</h2>
        <a id="ext" href="https://github.com/me">GitHub</a>
        <button id="cta" data-track="open_desktop"><span id="inner">Open</span></button>
      </section>
      <a id="mail" href="mailto:me@me.dev">Mail</a>
      <a id="local" href="/os">OS</a>`
    uninstall = installDelegatedTracking(track)
  })
  afterEach(() => {
    uninstall()
    track.mockReset()
  })
  const click = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

  it('tracks outbound clicks with the section they sit in', () => {
    click('ext')
    expect(track).toHaveBeenCalledWith('outbound_click', { href: 'https://github.com/me', host: 'github.com', kind: 'external', channel: 'github', section: 'work' })
  })
  it('tracks mailto clicks outside any section', () => {
    click('mail')
    expect(track).toHaveBeenCalledWith('outbound_click', expect.objectContaining({ kind: 'mailto', section: null }))
  })
  it('tracks data-track CTAs from a nested click target', () => {
    click('inner')
    expect(track).toHaveBeenCalledWith('cta_clicked', { cta: 'open_desktop', section: 'work' })
  })
  it('ignores internal links', () => {
    click('local')
    expect(track).not.toHaveBeenCalled()
  })
  it('stops listening after uninstall', () => {
    uninstall()
    click('ext')
    expect(track).not.toHaveBeenCalled()
    uninstall = () => {}
  })
})
