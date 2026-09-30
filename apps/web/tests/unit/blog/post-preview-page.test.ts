import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostView } from '@/lib/cms/types'

const draft = { isEnabled: false }
const jar = new Map<string, { value: string }>()
vi.mock('next/headers', () => ({ draftMode: async () => draft, cookies: async () => jar }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
const getPostBySlug = vi.fn<(slug: string) => Promise<PostView | null>>()
vi.mock('@/lib/cms/posts', () => ({ getPostBySlug: (slug: string) => getPostBySlug(slug) }))

const { default: PostPreviewPage } = await import('@/app/blog/[slug]/page')
const { RefreshRouteOnSave } = await import('@/features/blog/RefreshRouteOnSave')

const post: PostView = {
  title: 'Hello',
  slug: 'hello',
  content: { root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 } },
  authors: [],
  status: 'draft',
}
const render = () => PostPreviewPage({ params: Promise.resolve({ slug: 'hello' }) } as PageProps<'/blog/[slug]'>)

/** Every element of a server-rendered tree, depth first (enough to find a client component in it). */
const elements = (node: ReactNode): ReactElement[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) ? [child, ...elements(child.props.children)] : [],
  )
const refresher = async () =>
  elements(await render()).find((el) => el.type === RefreshRouteOnSave) as ReactElement<{ cmsOrigin: string }> | undefined

beforeEach(() => {
  draft.isEnabled = true
  jar.clear()
  jar.set('payload-token', { value: 'jwt' })
  getPostBySlug.mockReset().mockResolvedValue(post)
  vi.unstubAllEnvs()
})

describe('/blog/[slug] live preview', () => {
  it('renders the refresher for a draft post, listening to the CMS admin origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', 'http://cms.test/')
    expect((await refresher())?.props.cmsOrigin).toBe('http://cms.test')
  })
  it('is a 404 without draft mode', async () => {
    draft.isEnabled = false
    await expect(render()).rejects.toThrow('NOT_FOUND')
    expect(getPostBySlug).not.toHaveBeenCalled()
  })
  it('is a 404 when the post is missing', async () => {
    getPostBySlug.mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NOT_FOUND')
  })
  it('shows the expired-session notice, without a refresher, when the admin token is gone', async () => {
    jar.clear()
    expect(await refresher()).toBeUndefined()
  })
})
