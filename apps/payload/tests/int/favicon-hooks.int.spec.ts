import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/favicons/discover', () => ({ discoverFavicon: vi.fn() }))
import { discoverFavicon } from '@/favicons/discover'
import { deleteFavicon, syncFavicon, withFaviconHooks } from '@/favicons/hooks'

const discover = vi.mocked(discoverFavicon)
const ICON = { data: Buffer.from([0, 0, 1, 0]), mimetype: 'image/x-icon', ext: 'ico' }
const PARENT_CONTEXT = { skipFavicon: true, disableRevalidate: true }

/** A fake request whose Local API calls reassign `req.context` the way Payload's createLocalReq does. */
function fakeReq(context: Record<string, unknown> = {}, stored: Record<string, unknown> = {}) {
  const req: { context: Record<string, unknown>; payload: Record<string, unknown> } = { context, payload: {} }
  const withContext = (args: { context?: Record<string, unknown> }) => {
    req.context = { ...req.context, ...args.context }
  }
  req.payload = {
    create: vi.fn(async (args: { context?: Record<string, unknown> }) => (withContext(args), { id: 50 })),
    update: vi.fn(async (args: { id: number; context?: Record<string, unknown> }) => (withContext(args), { id: args.id })),
    delete: vi.fn(async () => ({})),
    findByID: vi.fn(async (args: { context?: Record<string, unknown> }) => (withContext(args), stored)),
    logger: { warn: vi.fn() },
  }
  return req
}
type FakeReq = ReturnType<typeof fakeReq>
const calls = (req: FakeReq, method: 'create' | 'update' | 'delete' | 'findByID') =>
  (req.payload[method] as ReturnType<typeof vi.fn>).mock.calls.map(([args]) => args as Record<string, unknown>)
const parentWrites = (req: FakeReq) => calls(req, 'update').filter((args) => args.collection === 'companies')
const faviconCalls = (req: FakeReq, method: 'create' | 'update' | 'delete') =>
  calls(req, method).filter((args) => args.collection === 'favicons')
const warned = (req: FakeReq) => (req.payload.logger as { warn: ReturnType<typeof vi.fn> }).warn

type Args = Parameters<typeof syncFavicon>[0]
function run(
  doc: Record<string, unknown>,
  previousDoc?: Record<string, unknown>,
  context: Record<string, unknown> = {},
  req: FakeReq = fakeReq(context),
) {
  const result = syncFavicon({
    doc,
    previousDoc,
    req,
    context,
    operation: previousDoc ? 'update' : 'create',
    collection: { slug: 'companies' },
  } as unknown as Args)
  return { req, result }
}

beforeEach(() => discover.mockReset())

describe('syncFavicon', () => {
  it('stores the discovered icon on create and writes it to the saved record', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ id: 7, name: 'Autodoc', url: 'https://autodoc.com.br', favicon: null })
    expect(await result).toMatchObject({ id: 7, favicon: 50 })
    expect(faviconCalls(req, 'create')[0]).toMatchObject({
      file: { name: 'companies-7-favicon.ico', mimetype: 'image/x-icon', size: 4 },
    })
    expect(parentWrites(req)).toEqual([
      expect.objectContaining({ id: 7, data: { favicon: 50 }, context: PARENT_CONTEXT, depth: 0 }),
    ])
  })
  it('names the file after the collection and id, never the record name (the file URL is public)', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ id: 7, name: 'Secret Client Ltda', url: 'https://a.dev', favicon: null })
    await result
    const name = (faviconCalls(req, 'create')[0]!.file as { name: string }).name
    expect(name).toBe('companies-7-favicon.ico')
    expect(name).not.toMatch(/secret/i)
  })
  it('keeps the neutral name when replacing the icon in place', async () => {
    discover.mockResolvedValue({ ...ICON, mimetype: 'image/png', ext: 'png' })
    const { req, result } = run(
      { id: 7, name: 'A', url: 'https://b.dev', favicon: 9 },
      { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 },
    )
    await result
    expect(faviconCalls(req, 'update')[0]).toMatchObject({ id: 9, file: { name: 'companies-7-favicon.png' } })
  })
  it('passes overrideAccess on every favicons call (the collection refuses API writes)', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ id: 7, name: 'A', url: 'https://a.dev', favicon: null })
    await result
    const cleared = run({ id: 8, name: 'A', url: null, favicon: 9 }, { id: 8, name: 'A', url: 'https://a.dev', favicon: 9 })
    await cleared.result
    const all = [...faviconCalls(req, 'create'), ...faviconCalls(cleared.req, 'delete')]
    expect(all).toHaveLength(2)
    for (const args of all) expect(args.overrideAccess).toBe(true)
  })
  it('leaves the request context as it found it after writing the record', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ id: 7, name: 'A', url: 'https://a.dev', favicon: null })
    await result
    expect(req.context).toEqual({})
  })
  it('keeps the stored icon when the url is unchanged', async () => {
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 }
    const { req, result } = run(doc, { ...doc })
    expect(await result).toBe(doc)
    expect(discover).not.toHaveBeenCalled()
    expect(calls(req, 'update')).toEqual([])
  })
  it('replaces the icon in place when the url changes, without rewriting the record', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run(
      { id: 7, name: 'A', url: 'https://b.dev', favicon: { id: 9 } },
      { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 },
    )
    await result
    expect(faviconCalls(req, 'update')).toEqual([expect.objectContaining({ id: 9 })])
    expect(parentWrites(req)).toEqual([])
  })
  it('re-fetches an unchanged url when asked to refresh', async () => {
    discover.mockResolvedValue(ICON)
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 }
    const { result } = run(doc, { ...doc }, { refreshFavicon: true })
    await result
    expect(discover).toHaveBeenCalledWith('https://a.dev')
  })
  it('deletes the icon and clears the record when the url is cleared', async () => {
    const { req, result } = run({ id: 7, name: 'A', url: null, favicon: 9 }, { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: null })
    expect(faviconCalls(req, 'delete')).toEqual([expect.objectContaining({ id: 9 })])
    expect(parentWrites(req)).toEqual([expect.objectContaining({ data: { favicon: null } })])
    expect(discover).not.toHaveBeenCalled()
  })
  it('does nothing for a non-http url without an icon', async () => {
    const { req, result } = run({ id: 7, name: 'A', url: 'mailto:a@a.dev', favicon: null })
    await result
    expect(discover).not.toHaveBeenCalled()
    expect(calls(req, 'update')).toEqual([])
    expect(calls(req, 'create')).toEqual([])
  })
  it('saves without an icon when discovery finds nothing on create', async () => {
    discover.mockResolvedValue(null)
    const { req, result } = run({ id: 7, name: 'A', url: 'https://a.dev', favicon: null })
    expect(await result).toMatchObject({ favicon: null })
    expect(parentWrites(req)).toEqual([])
    expect(warned(req)).toHaveBeenCalled()
  })
  it('removes the old icon and clears the record when a changed url yields nothing', async () => {
    discover.mockResolvedValue(null)
    const { req, result } = run(
      { id: 7, name: 'A', url: 'https://b.dev', favicon: 9 },
      { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 },
    )
    expect(await result).toMatchObject({ favicon: null })
    expect(faviconCalls(req, 'delete')).toEqual([expect.objectContaining({ id: 9 })])
    expect(parentWrites(req)).toEqual([expect.objectContaining({ data: { favicon: null } })])
  })
  it('keeps the current icon when refreshing an unchanged url finds nothing', async () => {
    discover.mockResolvedValue(null)
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 }
    const { req, result } = run(doc, { ...doc }, { refreshFavicon: true })
    expect(await result).toBe(doc)
    expect(calls(req, 'delete')).toEqual([])
    expect(calls(req, 'update')).toEqual([])
  })
  it('does not fail the save when storing the icon throws', async () => {
    discover.mockResolvedValue(ICON)
    const req = fakeReq()
    ;(req.payload.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('invalid file'))
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: null }
    const { result } = run(doc, undefined, {}, req)
    expect(await result).toBe(doc)
    expect(warned(req)).toHaveBeenCalled()
  })
  it('removes the icon and clears the record when replacing it in place fails', async () => {
    discover.mockResolvedValue(ICON)
    const req = fakeReq()
    ;(req.payload.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('file locked'))
    const { result } = run(
      { id: 7, name: 'A', url: 'https://b.dev', favicon: 9 },
      { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 },
      {},
      req,
    )
    expect(await result).toMatchObject({ favicon: null })
    expect(faviconCalls(req, 'delete')).toEqual([expect.objectContaining({ id: 9 })])
    expect(parentWrites(req)).toEqual([expect.objectContaining({ data: { favicon: null } })])
  })
  it('removes a freshly stored icon when the record cannot be updated with it', async () => {
    discover.mockResolvedValue(ICON)
    const req = fakeReq()
    ;(req.payload.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'))
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: null }
    const { result } = run(doc, undefined, {}, req)
    expect(await result).toBe(doc)
    expect(faviconCalls(req, 'delete')).toEqual([expect.objectContaining({ id: 50 })])
  })
  describe('when the response was trimmed by `select`', () => {
    const stored = { name: 'A', url: 'https://a.dev', favicon: 9 }
    const previous = { id: 7, name: 'A', url: 'https://a.dev', favicon: 9 }
    it('re-reads the record when the response has no url, and keeps the icon', async () => {
      const req = fakeReq({}, stored)
      const doc = { id: 7, favicon: 9 }
      const { result } = run(doc, previous, {}, req)
      expect(await result).toBe(doc)
      expect(calls(req, 'findByID')).toEqual([
        expect.objectContaining({ collection: 'companies', id: 7, depth: 0, select: { url: true, favicon: true } }),
      ])
      expect(calls(req, 'delete')).toEqual([])
      expect(parentWrites(req)).toEqual([])
      expect(discover).not.toHaveBeenCalled()
      expect(req.context).toEqual({})
    })
    it('re-reads the record when the response has no favicon, and does not duplicate it', async () => {
      const req = fakeReq({}, stored)
      const doc = { id: 7, name: 'A', url: 'https://a.dev' }
      const { result } = run(doc, previous, {}, req)
      expect(await result).toBe(doc)
      expect(calls(req, 'findByID')).toHaveLength(1)
      expect(calls(req, 'create')).toEqual([])
      expect(discover).not.toHaveBeenCalled()
    })
    it('does not re-read a complete response', async () => {
      const req = fakeReq({}, stored)
      const { result } = run({ ...previous }, previous, {}, req)
      await result
      expect(calls(req, 'findByID')).toEqual([])
    })
    it('leaves the record alone when the re-read fails', async () => {
      const req = fakeReq({}, stored)
      ;(req.payload.findByID as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        throw new Error('gone')
      })
      const doc = { id: 7, favicon: 9 }
      const { result } = run(doc, previous, {}, req)
      expect(await result).toBe(doc)
      expect(calls(req, 'delete')).toEqual([])
      expect(warned(req)).toHaveBeenCalled()
    })
  })
  it('does nothing with skipFavicon', async () => {
    const doc = { id: 7, name: 'A', url: 'https://a.dev', favicon: null }
    const { req, result } = run(doc, undefined, { skipFavicon: true })
    expect(await result).toBe(doc)
    expect(discover).not.toHaveBeenCalled()
    expect(calls(req, 'create')).toEqual([])
  })
})

describe('withFaviconHooks', () => {
  it('runs the sync before existing afterChange hooks and adds the delete hook', () => {
    const revalidate = vi.fn()
    const later = vi.fn()
    const hooks = withFaviconHooks({ afterChange: [revalidate], afterDelete: [later], beforeValidate: [later] })
    expect(hooks.afterChange).toEqual([syncFavicon, revalidate])
    expect(hooks.afterDelete).toEqual([later, deleteFavicon])
    expect(hooks.beforeValidate).toEqual([later])
    expect(hooks.beforeChange).toBeUndefined()
  })
})

describe('deleteFavicon', () => {
  it('removes the favicon of a deleted owner', async () => {
    const req = fakeReq()
    await deleteFavicon({ doc: { id: 1, favicon: 9 }, req } as unknown as Parameters<typeof deleteFavicon>[0])
    expect(faviconCalls(req, 'delete')).toEqual([expect.objectContaining({ id: 9 })])
  })
})
