import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/favicons/discover', () => ({ discoverFavicon: vi.fn() }))
import { discoverFavicon } from '@/favicons/discover'
import { deleteFavicon, syncFavicon } from '@/favicons/hooks'

const discover = vi.mocked(discoverFavicon)
const ICON = { data: Buffer.from([0, 0, 1, 0]), mimetype: 'image/x-icon', ext: 'ico' }

function fakeReq() {
  const payload = {
    create: vi.fn(async () => ({ id: 50 })),
    update: vi.fn(async ({ id }: { id: number }) => ({ id })),
    delete: vi.fn(async () => ({})),
    logger: { warn: vi.fn() },
  }
  return { payload, context: {} as Record<string, unknown> }
}

type Args = Parameters<typeof syncFavicon>[0]
const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) => {
  const req = fakeReq()
  req.context = context
  const result = syncFavicon({ data, originalDoc, req, context, operation: originalDoc ? 'update' : 'create' } as unknown as Args)
  return { req, result }
}

beforeEach(() => discover.mockReset())

describe('syncFavicon', () => {
  it('stores the discovered icon on create', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ name: 'Autodoc', url: 'https://autodoc.com.br' })
    expect(await result).toMatchObject({ favicon: 50 })
    expect(req.payload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'favicons',
      file: expect.objectContaining({ name: 'autodoc-favicon.ico', mimetype: 'image/x-icon', size: 4 }),
    }))
  })
  it('keeps the stored icon when the url is unchanged', async () => {
    const { req, result } = run({ name: 'A', url: 'https://a.dev' }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: 9 })
    expect(discover).not.toHaveBeenCalled()
    expect(req.payload.update).not.toHaveBeenCalled()
  })
  it('replaces the icon in place when the url changes', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ name: 'A', url: 'https://b.dev' }, { name: 'A', url: 'https://a.dev', favicon: { id: 9 } })
    expect(await result).toMatchObject({ favicon: 9 })
    expect(req.payload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
  it('re-fetches an unchanged url when asked to refresh', async () => {
    discover.mockResolvedValue(ICON)
    const { result } = run({ name: 'A', url: 'https://a.dev' }, { name: 'A', url: 'https://a.dev', favicon: 9 }, { refreshFavicon: true })
    await result
    expect(discover).toHaveBeenCalledWith('https://a.dev')
  })
  it('deletes the icon when the url is cleared', async () => {
    const { req, result } = run({ name: 'A', url: null }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: null })
    expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
  it('saves without an icon when discovery finds nothing', async () => {
    discover.mockResolvedValue(null)
    const { req, result } = run({ name: 'A', url: 'https://a.dev' })
    expect(await result).toMatchObject({ favicon: null })
    expect(req.payload.logger.warn).toHaveBeenCalled()
  })
  it('reads the url from the stored doc on a partial update', async () => {
    const { result } = run({ name: 'Renamed' }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: 9 })
  })
  it('does nothing with skipFavicon', async () => {
    const { req, result } = run({ name: 'A', url: 'https://a.dev' }, undefined, { skipFavicon: true })
    expect(await result).toEqual({ name: 'A', url: 'https://a.dev' })
    expect(discover).not.toHaveBeenCalled()
    expect(req.payload.create).not.toHaveBeenCalled()
  })
})

describe('deleteFavicon', () => {
  it('removes the favicon of a deleted owner', async () => {
    const req = fakeReq()
    await deleteFavicon({ doc: { id: 1, favicon: 9 }, req } as unknown as Parameters<typeof deleteFavicon>[0])
    expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
})
