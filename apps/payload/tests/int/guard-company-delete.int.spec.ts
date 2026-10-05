import { APIError } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { guardCompanyDelete } from '@/hooks/guard-company-delete'

function fakeReq(count: number, name: string | null = 'Autodoc') {
  return {
    payload: {
      count: vi.fn(async () => ({ totalDocs: count })),
      findByID: vi.fn(async () => (name === null ? Promise.reject(new Error('gone')) : { name })),
    },
  }
}

const run = (req: ReturnType<typeof fakeReq>) =>
  guardCompanyDelete({ id: 7, req, collection: { slug: 'companies' }, context: {} } as unknown as Parameters<typeof guardCompanyDelete>[0])

describe('guardCompanyDelete', () => {
  it('lets the delete through when no experience references the company', async () => {
    const req = fakeReq(0)
    await expect(run(req)).resolves.toBeUndefined()
    expect(req.payload.count).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'experiences', where: { company: { equals: 7 } }, overrideAccess: true }),
    )
  })

  it('throws a 400 naming the company when experiences reference it', async () => {
    const error = await run(fakeReq(2)).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toBe('Autodoc is used by 2 experiences; move or delete them first.')
  })

  it('uses singular wording for one experience', async () => {
    const error = await run(fakeReq(1)).catch((err: unknown) => err)
    expect((error as APIError).message).toBe('Autodoc is used by 1 experience; move or delete it first.')
  })

  it('falls back to the id when the name cannot be read', async () => {
    const error = await run(fakeReq(3, null)).catch((err: unknown) => err)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toBe('Company 7 is used by 3 experiences; move or delete them first.')
  })
})
