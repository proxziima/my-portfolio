import { describe, expect, it } from 'vitest'
import { desktopApps, resolveApp, withChildren, type OsApp, type OsData } from '@/features/os/apps'

const Noop = () => null
const data = { profile: { name: 'Vinicius Queiroz' }, messenger: { shortcut: 'Messenger' } } as unknown as OsData

describe('resolveApp', () => {
  it('resolves a title and a shortcut that come from content', () => {
    const app: OsApp = { id: 'a', title: (d) => `${d.profile.name} - App`, shortcut: (d) => d.messenger.shortcut, icon: 'folder', component: Noop }
    expect(resolveApp(app, data)).toMatchObject({ title: 'Vinicius Queiroz - App', shortcut: 'Messenger' })
  })
  it('keeps fixed text, and labels a shortcut-less app by its title', () => {
    expect(resolveApp({ id: 'b', title: (d) => `${d.profile.name} - Showcase`, icon: 'folder', component: Noop }, data)).toMatchObject({
      title: 'Vinicius Queiroz - Showcase',
      shortcut: 'Vinicius Queiroz - Showcase',
    })
    expect(resolveApp({ id: 'c', title: 'Credits', icon: 'document', component: Noop }, data)).toMatchObject({ title: 'Credits', shortcut: 'Credits' })
  })
})

const family = [{ id: 'messenger' }, { id: 'conversation', parent: 'messenger' }, { id: 'credits' }]

describe('desktopApps', () => {
  it('leaves out apps another app opens (those with a parent)', () => {
    expect(desktopApps(family).map((a) => a.id)).toEqual(['messenger', 'credits'])
  })
})

describe('withChildren', () => {
  it('closes an app together with the windows it opened', () => {
    expect(withChildren(family, 'messenger')).toEqual(['messenger', 'conversation'])
  })
  it('follows children of children', () => {
    expect(withChildren([...family, { id: 'transfer', parent: 'conversation' }], 'messenger')).toEqual(['messenger', 'conversation', 'transfer'])
  })
  it('closes a child alone', () => {
    expect(withChildren(family, 'conversation')).toEqual(['conversation'])
  })
})
