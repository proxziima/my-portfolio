import { describe, expect, it } from 'vitest'
import type { Contact, Content, Discipline as CmsDiscipline, Experience, Media, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { mediaUrl, toContentEntry, toDiscipline, toExperienceEntry, toPortfolio, toProjectEntry, type CmsSnapshot } from '@/lib/cms/mappers'

const discipline = { id: 1, slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9', figureCaption: 'Fig. 1', bio: { root: { children: [] } }, curiousNotes: [{ id: 'n', side: 'left', text: 'x', formula: null }], updatedAt: '', createdAt: '' } as unknown as CmsDiscipline

describe('mappers', () => {
  it('maps a discipline and drops null formulas', () => {
    expect(toDiscipline(discipline)).toEqual({ slug: 'se', title: 'Software engineer', level: 'LV 9', caption: 'Fig. 1', bio: [], notes: [{ side: 'left', text: 'x' }] })
  })
  it('maps an experience with a period and populated disciplines', () => {
    const e = { id: 7, company: 'Autodoc', chip: 'A', url: null, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [discipline], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e)).toEqual({ id: '7', chip: 'A', label: 'Autodoc', href: undefined, meta: 'Senior SE', aside: '2023–', disciplines: ['se'] })
  })
  it('maps a project', () => {
    const p = { id: 3, name: 'Sonda', chip: 'S', url: 'https://x.dev', summary: 'Sampler', disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p)).toEqual({ id: '3', chip: 'S', label: 'Sonda', href: 'https://x.dev', meta: 'Sampler', disciplines: [] })
  })
})

const BASE = 'http://cms.test'

const snapshot = (overrides: Partial<CmsSnapshot> = {}): CmsSnapshot => ({
  profile: { id: 1, name: 'N', headlineTail: 'and builder.', email: 'a@b.dev' } as Profile,
  contact: { id: 1, links: [] } as unknown as Contact,
  navigation: { id: 1, items: [] } as unknown as Navigation,
  settings: {
    id: 1,
    seo: { title: 't', description: 'd', ogImage: null },
    defaultDiscipline: null,
    sectionLabels: { work: 'Work', projects: 'Projects', content: 'Content' },
    pickerHint: 'h',
    pageNotes: { headline: '', columnWidth: '', wallSwitch: '', sectionGap: '', chips: '', role: '' },
  } as unknown as SiteSetting,
  disciplines: [discipline],
  experiences: [],
  projects: [],
  content: [],
  ...overrides,
})

describe('toContentEntry', () => {
  it('maps kind without a venue and the UTC year', () => {
    const c = { id: 4, title: 'Post', kind: 'article', chip: 'P', venue: null, url: 'https://x.dev/p', date: '2024-01-01T00:00:00.000Z', disciplines: [], order: 1 } as unknown as Content
    expect(toContentEntry(c)).toEqual({ id: '4', chip: 'P', label: 'Post', href: 'https://x.dev/p', meta: 'article', aside: '2024', disciplines: [] })
  })
})

describe('toPortfolio', () => {
  it('falls back to the first discipline when the configured default is not listed', () => {
    const missing = { ...discipline, id: 9, slug: 'gone' } as unknown as CmsDiscipline
    const settings = { ...snapshot().settings, defaultDiscipline: missing } as SiteSetting
    expect(toPortfolio(snapshot({ settings }), BASE).defaultSlug).toBe('se')
  })
  it('uses the configured default when it is listed', () => {
    const settings = { ...snapshot().settings, defaultDiscipline: discipline } as SiteSetting
    expect(toPortfolio(snapshot({ settings }), BASE).defaultSlug).toBe('se')
  })
  it('has an empty default slug without disciplines', () => {
    expect(toPortfolio(snapshot({ disciplines: [] }), BASE).defaultSlug).toBe('')
  })
  it('drops unsafe contact and nav links', () => {
    const contact = { id: 1, links: [{ label: 'ok', chip: 'a', url: 'https://ok.dev' }, { label: 'bad', chip: 'b', url: 'javascript:alert(1)' }] } as unknown as Contact
    const navigation = { id: 1, items: [{ label: 'ok', href: '#work' }, { label: 'bad', href: '//evil' }] } as unknown as Navigation
    const p = toPortfolio(snapshot({ contact, navigation }), BASE)
    expect(p.contactLinks).toEqual([{ label: 'ok', chip: 'a', href: 'https://ok.dev' }])
    expect(p.nav).toEqual([{ label: 'ok', href: '#work', newTab: false }])
  })
})

describe('mediaUrl', () => {
  it('is undefined for ids, null and missing urls', () => {
    expect(mediaUrl(5, BASE)).toBeUndefined()
    expect(mediaUrl(null, BASE)).toBeUndefined()
    expect(mediaUrl({ id: 1, alt: '', url: null } as unknown as Media, BASE)).toBeUndefined()
  })
  it('resolves relative urls against the base', () => {
    expect(mediaUrl({ id: 1, alt: '', url: '/api/media/file/a.png' } as unknown as Media, BASE)).toBe('http://cms.test/api/media/file/a.png')
  })
  it('returns undefined instead of throwing on a malformed url', () => {
    expect(mediaUrl({ id: 1, alt: '', url: 'http://[bad' } as unknown as Media, BASE)).toBeUndefined()
  })
  it('keeps absolute http(s) urls', () => {
    expect(mediaUrl({ id: 1, alt: '', url: 'https://cdn.test/a.png' } as unknown as Media, BASE)).toBe('https://cdn.test/a.png')
  })
  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'ftp://x.test/a.png', 'blob:http://x/1'])(
    'rejects the non-web url %s',
    (url) => {
      expect(mediaUrl({ id: 1, alt: '', url } as unknown as Media, BASE)).toBeUndefined()
    },
  )
})
