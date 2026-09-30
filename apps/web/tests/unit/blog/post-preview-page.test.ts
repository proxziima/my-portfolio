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
type Load = (key: string, auth: { token?: string }) => Promise<PostView | null>
const getPostBySlug = vi.fn<Load>()
const getPostById = vi.fn<Load>()
vi.mock('@/lib/cms/posts', () => ({ getPostBySlug, getPostById }))

const { default: SlugPage } = await import('@/app/blog/[slug]/page')
const { default: LivePreviewPage } = await import('@/app/blog/preview/[id]/page')
const { PostPreview } = await import('@/features/blog/PostPreview')
const { PreviewNotice } = await import('@/features/blog/PreviewNotice')
const { RefreshRouteOnSave } = await import('@/features/blog/RefreshRouteOnSave')

const post: PostView = {
  title: 'Hello',
  slug: 'hello',
  content: { root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 } },
  authors: [],
  status: 'draft',
}

/** Every element of a server-rendered tree, depth first, with `PostPreview` (a plain function) rendered in place. */
const elements = (node: ReactNode): ReactElement[] =>
  Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return []
    const inner = child.type === PostPreview ? PostPreview(child.props as { post: PostView | null }) : child.props.children
    return [child, ...elements(inner)]
  })
const find = <P>(tree: ReactElement[], type: unknown) => tree.find((el) => el.type === type) as ReactElement<P> | undefined

beforeEach(() => {
  draft.isEnabled = true
  jar.clear()
  jar.set('payload-token', { value: 'jwt' })
  getPostBySlug.mockReset().mockResolvedValue(post)
  getPostById.mockReset().mockResolvedValue(post)
  vi.unstubAllEnvs()
})

describe.each([
  {
    page: '/blog/[slug]',
    render: () => SlugPage({ params: Promise.resolve({ slug: 'hello' }) } as PageProps<'/blog/[slug]'>),
    load: getPostBySlug,
    loadArgs: ['hello', { draft: true, token: 'jwt' }],
  },
  {
    page: '/blog/preview/[id]',
    render: () => LivePreviewPage({ params: Promise.resolve({ id: '7' }) } as PageProps<'/blog/preview/[id]'>),
    load: getPostById,
    loadArgs: ['7', { token: 'jwt' }],
  },
])('$page preview', ({ render, load, loadArgs }) => {
  const tree = async () => elements(await render())

  it('reads the draft with the editor token and renders the refresher on the CMS admin origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', 'http://cms.test/')
    const refresher = find<{ cmsOrigin: string }>(await tree(), RefreshRouteOnSave)
    expect(refresher?.props.cmsOrigin).toBe('http://cms.test')
    expect(load).toHaveBeenCalledWith(...loadArgs)
  })
  it('is a 404 without draft mode', async () => {
    draft.isEnabled = false
    await expect(render()).rejects.toThrow('NOT_FOUND')
    expect(load).not.toHaveBeenCalled()
  })
  it('shows the not-saved notice with the refresher, not a 404, while the post is missing', async () => {
    load.mockResolvedValue(null)
    const elementsOnPage = await tree()
    expect(find<{ title: string }>(elementsOnPage, PreviewNotice)?.props.title).toBe('Not saved yet')
    expect(find(elementsOnPage, RefreshRouteOnSave)).toBeDefined()
  })
  it('shows the expired-session notice, without a refresher, when the admin token is gone', async () => {
    jar.clear()
    const elementsOnPage = await tree()
    expect(find<{ title: string }>(elementsOnPage, PreviewNotice)?.props.title).toBe('Your CMS session has expired')
    expect(find(elementsOnPage, RefreshRouteOnSave)).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })
})
