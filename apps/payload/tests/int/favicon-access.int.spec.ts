import { describe, expect, it, vi } from 'vitest'
import { faviconRead } from '@/access/favicon-read'
import { Favicons } from '@/collections/Favicons'

type Doc = { id: number; favicon?: unknown }

function fakeReq(user: unknown, owners: { companies?: Doc[]; projects?: Doc[] } = {}) {
  return {
    user,
    payload: {
      find: vi.fn(async ({ collection }: { collection: 'companies' | 'projects' }) => ({ docs: owners[collection] ?? [] })),
    },
  }
}
type FakeReq = ReturnType<typeof fakeReq>
const read = (req: FakeReq) => faviconRead({ req } as unknown as Parameters<typeof faviconRead>[0])

describe('faviconRead', () => {
  it('lets a logged-in user read every favicon without querying', async () => {
    const req = fakeReq({ id: 1 })
    expect(await read(req)).toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('limits anonymous readers to the favicons of public companies and projects', async () => {
    const req = fakeReq(null, {
      companies: [{ id: 1, favicon: 10 }, { id: 2, favicon: { id: 11 } }],
      projects: [{ id: 3, favicon: 12 }, { id: 4, favicon: null }],
    })
    expect(await read(req)).toEqual({ id: { in: [10, 11, 12] } })
    for (const collection of ['companies', 'projects']) {
      expect(req.payload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          where: { and: [{ disclosure: { equals: 'public' } }, { favicon: { exists: true } }] },
          depth: 0,
          overrideAccess: true,
          pagination: false,
          select: { favicon: true },
        }),
      )
    }
  })

  it('denies anonymous readers outright when no public record has a favicon', async () => {
    expect(await read(fakeReq(undefined, { companies: [{ id: 1, favicon: null }] }))).toBe(false)
  })
})

describe('Favicons access', () => {
  const access = Favicons.access!
  const req = { user: { id: 1 } } as never
  it('refuses every API write, even from a logged-in user (only the hooks write, with overrideAccess)', () => {
    for (const op of ['create', 'update', 'delete'] as const) expect(access[op]!({ req })).toBe(false)
  })
  it('reads through faviconRead and stays hidden in the admin', () => {
    expect(access.read).toBe(faviconRead)
    expect(Favicons.admin?.hidden).toBe(true)
  })
})
