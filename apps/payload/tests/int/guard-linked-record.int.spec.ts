import { APIError } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { guardDeletingLinkedRecord, guardHidingLinkedRecord } from '@/hooks/guard-linked-record'

const text = (t: string) => ({ type: 'text', text: t })
const link = (relationTo: string, value: unknown) => ({ type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo, value } } })
const chip = (label: string) => ({ type: 'inlineBlock', fields: { blockType: 'chipLink', label, chip: 'x' } })
const bio = (...children: unknown[]) => ({ root: { type: 'root', children: [{ type: 'paragraph', children }] } })

type Discipline = { id: number; title: string; bio: unknown }

function fakeReq(disciplines: Discipline[], name: string | null = 'Autodoc') {
  return {
    payload: {
      find: vi.fn(async () => ({ docs: disciplines })),
      findByID: vi.fn(async () => (name === null ? Promise.reject(new Error('gone')) : { name })),
    },
  }
}
type FakeReq = ReturnType<typeof fakeReq>

const LINKING = [
  { id: 1, title: 'Software engineer', bio: bio(text('I work at '), link('companies', 7)) },
  { id: 2, title: 'Designer', bio: bio(text('Nothing here'), chip('Autodoc')) },
  { id: 3, title: 'AI engineer', bio: bio(link('companies', { id: 7, name: 'Autodoc' })) },
]

type HideArgs = Parameters<typeof guardHidingLinkedRecord>[0]
const hide = (req: FakeReq, from: string, to: string, slug = 'companies', operation = 'update') =>
  guardHidingLinkedRecord({
    data: { disclosure: to },
    originalDoc: { id: 7, name: 'Autodoc', disclosure: from },
    operation,
    req,
    collection: { slug },
    context: {},
  } as unknown as HideArgs)

const remove = (req: FakeReq, slug = 'companies') =>
  guardDeletingLinkedRecord({ id: 7, req, collection: { slug }, context: {} } as unknown as Parameters<typeof guardDeletingLinkedRecord>[0])

const failure = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err)

describe('guardHidingLinkedRecord', () => {
  it('refuses to hide a record linked from bios, naming the bios', async () => {
    const error = await failure(hide(fakeReq(LINKING), 'public', 'restricted'))
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toBe(
      'Autodoc is linked from the bios of Software engineer, AI engineer; remove those links before hiding it.',
    )
  })

  it('uses singular wording for one bio', async () => {
    const error = await failure(hide(fakeReq([LINKING[0]!]), 'public', 'never'))
    expect((error as APIError).message).toBe('Autodoc is linked from the bio of Software engineer; remove that link before hiding it.')
  })

  it('reads every discipline with depth 0 and overrideAccess', async () => {
    const req = fakeReq([])
    await hide(req, 'public', 'never')
    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'disciplines', depth: 0, overrideAccess: true, pagination: false }),
    )
  })

  it('lets a record with no bio links be hidden', async () => {
    const data = { disclosure: 'restricted' }
    const req = fakeReq([LINKING[1]!])
    await expect(
      guardHidingLinkedRecord({
        data,
        originalDoc: { id: 7, disclosure: 'public' },
        operation: 'update',
        req,
        collection: { slug: 'companies' },
        context: {},
      } as unknown as HideArgs),
    ).resolves.toBe(data)
  })

  it('only matches links to the same collection and id', async () => {
    const req = fakeReq([{ id: 1, title: 'SE', bio: bio(link('projects', 7), link('companies', 8)) }])
    await expect(hide(req, 'public', 'never')).resolves.toBeDefined()
  })

  it('does not query when a public record stays public', async () => {
    const req = fakeReq(LINKING)
    await expect(hide(req, 'public', 'public')).resolves.toBeDefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('does not query when a non-public record changes between non-public tiers', async () => {
    const req = fakeReq(LINKING)
    await expect(hide(req, 'restricted', 'never')).resolves.toBeDefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('does not query when the update leaves disclosure out', async () => {
    const req = fakeReq(LINKING)
    const data = { name: 'Autodoc' }
    await expect(
      guardHidingLinkedRecord({
        data,
        originalDoc: { id: 7, disclosure: 'public' },
        operation: 'update',
        req,
        collection: { slug: 'companies' },
        context: {},
      } as unknown as HideArgs),
    ).resolves.toBe(data)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('ignores creates', async () => {
    const req = fakeReq(LINKING)
    await expect(hide(req, 'public', 'never', 'companies', 'create')).resolves.toBeDefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('guards projects too', async () => {
    const req = fakeReq([{ id: 1, title: 'SE', bio: bio(link('projects', 7)) }])
    const error = await failure(hide(req, 'public', 'restricted', 'projects'))
    expect((error as APIError).message).toBe('Autodoc is linked from the bio of SE; remove that link before hiding it.')
  })

  it('finds links nested inside lists', async () => {
    const nested = {
      root: {
        type: 'root',
        children: [{ type: 'list', children: [{ type: 'listitem', children: [{ type: 'list', children: [{ type: 'listitem', children: [link('companies', 7)] }] }] }] }],
      },
    }
    const error = await failure(hide(fakeReq([{ id: 9, title: 'Writer', bio: nested }]), 'public', 'never'))
    expect((error as APIError).message).toBe('Autodoc is linked from the bio of Writer; remove that link before hiding it.')
  })

  it('finds a link whose value is a populated record', async () => {
    const error = await failure(hide(fakeReq([LINKING[2]!]), 'public', 'never'))
    expect((error as APIError).message).toBe('Autodoc is linked from the bio of AI engineer; remove that link before hiding it.')
  })
})

describe('guardDeletingLinkedRecord', () => {
  it('refuses to delete a record linked from bios, reading its name', async () => {
    const req = fakeReq(LINKING, 'Autodoc')
    const error = await failure(remove(req))
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toBe(
      'Autodoc is linked from the bios of Software engineer, AI engineer; remove those links before deleting it.',
    )
    expect(req.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'companies', id: 7, overrideAccess: true }))
  })

  it('falls back to the id when the name cannot be read', async () => {
    const error = await failure(remove(fakeReq([{ id: 1, title: 'SE', bio: bio(link('projects', 7)) }], null), 'projects'))
    expect((error as APIError).message).toBe('Project 7 is linked from the bio of SE; remove that link before deleting it.')
  })

  it('lets an unlinked record be deleted', async () => {
    const req = fakeReq([LINKING[1]!])
    await expect(remove(req)).resolves.toBeUndefined()
    expect(req.payload.findByID).not.toHaveBeenCalled()
  })
})

describe('wiring', () => {
  it('guards companies and projects against hiding and deleting a linked record', async () => {
    const { Companies } = await import('@/collections/Companies')
    const { Projects } = await import('@/collections/Projects')
    const { guardCompanyDelete } = await import('@/hooks/guard-company-delete')
    expect(Companies.hooks?.beforeChange).toContain(guardHidingLinkedRecord)
    expect(Companies.hooks?.beforeDelete).toEqual([guardCompanyDelete, guardDeletingLinkedRecord])
    expect(Projects.hooks?.beforeChange).toContain(guardHidingLinkedRecord)
    expect(Projects.hooks?.beforeDelete).toEqual([guardDeletingLinkedRecord])
  })
})
