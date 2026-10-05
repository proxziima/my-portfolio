import { describe, expect, it } from 'vitest'
import type { Company, Contact, Content, Discipline as CmsDiscipline, Experience, Media, Messenger as CmsMessenger, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { brandIcon, mediaUrl, toContentEntry, toDiscipline, toExperienceEntry, toMessenger, toPortfolio, toProjectEntry, toRecords, type CmsSnapshot } from '@/lib/cms/mappers'
import type { Records } from '@/lib/cms/records'

const discipline = { id: 1, slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9', figureCaption: 'Fig. 1', bio: { root: { children: [] } }, curiousNotes: [{ id: 'n', side: 'left', text: 'x', formula: null }], updatedAt: '', createdAt: '' } as unknown as CmsDiscipline

describe('mappers', () => {
  it('maps a discipline and drops null formulas', () => {
    expect(toDiscipline(discipline, new Map())).toEqual({ slug: 'se', title: 'Software engineer', level: 'LV 9', caption: 'Fig. 1', bio: [], notes: [{ side: 'left', text: 'x' }] })
  })
})

const BASE = 'http://cms.test'
const media = (url: string) => ({ id: 1, url, alt: '' })
const autodoc = { id: 3, name: 'Autodoc', chip: 'A', url: 'https://autodoc.com.br', logo: null, favicon: { id: 5, url: '/api/favicons/file/a.ico' }, disclosure: 'public' } as unknown as Company

describe('brand icons', () => {
  it('prefers the logo, then the favicon, else none', () => {
    expect(brandIcon({ logo: media('/api/media/file/logo.png'), favicon: { id: 5, url: '/f.ico' } } as never, BASE)).toBe('http://cms.test/api/media/file/logo.png')
    expect(brandIcon({ logo: null, favicon: { id: 5, url: '/f.ico' } } as never, BASE)).toBe('http://cms.test/f.ico')
    expect(brandIcon({ logo: null, favicon: null } as never, BASE)).toBeUndefined()
  })
})

describe('entries through the record lookup', () => {
  const records: Records = toRecords([autodoc], [], BASE)
  it('maps an experience from its company', () => {
    const e = { id: 7, company: 3, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [discipline], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e, records)).toEqual({ id: '7', chip: 'A', label: 'Autodoc', href: 'https://autodoc.com.br', icon: 'http://cms.test/api/favicons/file/a.ico', meta: 'Senior SE', aside: '2023–', disciplines: ['se'] })
  })
  it('drops an experience whose company the site cannot read', () => {
    const e = { id: 8, company: 99, title: 'x', startYear: 2020, endYear: null, disciplines: [], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e, records)).toBeUndefined()
  })
  it('maps a project with its own icon and its company as the aside', () => {
    const p = { id: 3, name: 'Sonda', chip: 'S', url: 'https://x.dev', logo: media('/l.png'), favicon: null, summary: 'Sampler', company: { id: 3 }, disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p, records, BASE)).toEqual({ id: '3', chip: 'S', label: 'Sonda', href: 'https://x.dev', icon: 'http://cms.test/l.png', meta: 'Sampler', aside: 'Autodoc', disciplines: [] })
  })
  it('omits the company aside when the company is not readable', () => {
    const p = { id: 4, name: 'Sonda', chip: 'S', url: null, logo: null, favicon: null, summary: 's', company: 99, disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p, records, BASE)).not.toHaveProperty('aside')
  })
  it('keeps work rows only for readable companies in the portfolio', () => {
    const readable = { id: 7, company: 3, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [], order: 1 } as unknown as Experience
    const hidden = { ...readable, id: 8, company: 99 } as unknown as Experience
    expect(toPortfolio(snapshot({ companies: [autodoc], experiences: [readable, hidden] }), BASE).work.map((w) => w.id)).toEqual(['7'])
  })
})

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
  companies: [],
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

describe('toMessenger', () => {
  const doc = {
    id: 1,
    title: 'Windows Live Messenger',
    shortcut: 'Messenger',
    viewer: { name: 'Visitor', status: 'available', personalMessage: '  ', avatar: null },
    contact: { listeningTo: ' Daft Punk - Digital Love ' },
    labels: {
      search: 's', favorites: 'f', friends: 'fr', whatsNew: 'w', typing: '{name} is typing', conversation: '{name} - Conversation', send: 'Send', listeningTo: 'Listening to:',
      throttled: 't', tooLong: 'tl', ended: 'e', offline: 'o', privacy: 'p', deleteData: 'd', bookingTitle: 'b', yourTime: 'y', myTime: 'my', bookingNotice: 'Booked for {time}',
      menu: [{ id: 'm1', label: 'Photos' }, { id: 'm2', label: 'Files' }],
    },
    spotlight: { title: ' Doom ', text: 'Boots in js-dos.', url: 'javascript:alert(1)', source: 'My Desktop', image: { url: '/api/media/file/d.png' } },
    whatsNew: [
      { id: 'n1', text: 'New post', linkLabel: '', url: '/blog', image: { url: '/api/media/file/t.png' } },
      { id: 'n2', text: 'Unsafe', linkLabel: 'x', url: 'javascript:alert(1)', image: null },
      { id: null, text: 'Repo', linkLabel: ' GitHub ', url: 'https://github.com/x', image: null },
    ],
  } as unknown as CmsMessenger

  const owner = {
    id: 1,
    name: 'Vinicius Queiroz',
    headlineTail: 'and builder.',
    email: 'v@example.com',
    statusMessage: ' building things ',
    avatar: { url: '/api/media/file/v.png' },
  } as unknown as Profile

  it('maps people, trimming empty personal messages away and resolving avatars', () => {
    const m = toMessenger(doc, owner, BASE)
    expect(m.viewer).toEqual({ name: 'Visitor', status: 'available', personalMessage: undefined, avatar: undefined })
    expect(m.contact).toEqual({
      name: 'Vinicius Queiroz',
      status: 'available',
      personalMessage: 'building things',
      listeningTo: 'Daft Punk - Digital Love',
      avatar: 'http://cms.test/api/media/file/v.png',
    })
    expect(m.labels.typing).toBe('{name} is typing')
    expect(m.labels.conversation).toBe('{name} - Conversation')
    expect(m.labels.bookingNotice).toBe('Booked for {time}')
    expect(m.labels.deleteData).toBe('d')
    expect(m.labels.menu).toEqual(['Photos', 'Files'])
    expect(toMessenger({ ...doc, labels: { ...doc.labels, menu: null } } as unknown as CmsMessenger, owner, BASE).labels.menu).toEqual([])
    expect(m.title).toBe('Windows Live Messenger')
    expect(m.shortcut).toBe('Messenger')
  })

  it("keeps What's new items, labels a link by its URL when unlabelled and drops unsafe links", () => {
    expect(toMessenger(doc, owner, BASE).whatsNew).toEqual([
      { id: 'n1', text: 'New post', link: { label: '/blog', href: '/blog' }, image: 'http://cms.test/api/media/file/t.png' },
      { id: 'n2', text: 'Unsafe', link: undefined, image: undefined },
      // a labelled link keeps its (trimmed) label; an item saved without an id is keyed by its position
      { id: '2', text: 'Repo', link: { label: 'GitHub', href: 'https://github.com/x' }, image: undefined },
    ])
  })

  it("tolerates a global saved without What's new", () => {
    expect(toMessenger({ ...doc, whatsNew: null } as unknown as CmsMessenger, owner, BASE).whatsNew).toEqual([])
  })

  it('maps the spotlight, dropping an unsafe link', () => {
    expect(toMessenger(doc, owner, BASE).spotlight).toEqual({
      title: 'Doom',
      text: 'Boots in js-dos.',
      href: undefined,
      source: 'My Desktop',
      image: 'http://cms.test/api/media/file/d.png',
    })
  })

  it('has no spotlight without a title', () => {
    expect(toMessenger({ ...doc, spotlight: { title: '  ', text: 'x' } } as unknown as CmsMessenger, owner, BASE).spotlight).toBeUndefined()
  })
})
