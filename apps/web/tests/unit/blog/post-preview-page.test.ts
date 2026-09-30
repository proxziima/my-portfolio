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
const getEditor = vi.fn<(token: string | undefined) => Promise<{ id: string } | null>>()
vi.mock('@/lib/cms/preview', async (original) => ({ ...(await original<object>()), getEditor }))

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
  getEditor.mockReset().mockImplementation(async (token) => (token === 'jwt' ? { id: '1' } : null))
  vi.unstubAllEnvs()
})

const renderSlug = () => SlugPage({ params: Promise.resolve({ slug: 'hello' }) } as PageProps<'/blog/[slug]'>)
const renderLive = () => LivePreviewPage({ params: Promise.resolve({ id: '7' }) } as PageProps<'/blog/preview/[id]'>)

describe.each([
  { page: '/blog/[slug]', render: renderSlug, load: getPostBySlug, loadArgs: ['hello', { draft: true, token: 'jwt' }] },
  { page: '/blog/preview/[id]', render: renderLive, load: getPostById, loadArgs: ['7', { token: 'jwt' }] },
])('$page preview', ({ render, load, loadArgs }) => {
  const tree = async () => elements(await render())

  it('reads the draft with the editor token and renders the refresher on the CMS admin origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', 'http://cms.test/')
    const refresher = find<{ cmsOrigin: string }>(await tree(), RefreshRouteOnSave)
    expect(refresher?.props.cmsOrigin).toBe('http://cms.test')
    expect(load).toHaveBeenCalledWith(...loadArgs)
  })
  it('shows the not-saved notice with the refresher, not a 404, while the post is missing', async () => {
    load.mockResolvedValue(null)
    const elementsOnPage = await tree()
    expect(find<{ title: string }>(elementsOnPage, PreviewNotice)?.props.title).toBe('Not saved yet')
    expect(find(elementsOnPage, RefreshRouteOnSave)).toBeDefined()
  })
})

describe('/blog/[slug] (Preview button): draft mode', () => {
  it('is a 404 without draft mode, even for a signed-in editor', async () => {
    draft.isEnabled = false
    await expect(renderSlug()).rejects.toThrow('NOT_FOUND')
    expect(getPostBySlug).not.toHaveBeenCalled()
  })
  it('shows the expired-session notice, without a refresher, when the admin token is gone', async () => {
    jar.clear()
    const elementsOnPage = elements(await renderSlug())
    expect(find<{ title: string }>(elementsOnPage, PreviewNotice)?.props.title).toBe('Your CMS session has expired')
    expect(find(elementsOnPage, RefreshRouteOnSave)).toBeUndefined()
    expect(getPostBySlug).not.toHaveBeenCalled()
  })
})

describe('/blog/preview/[id] (Live Preview iframe): editor session', () => {
  it('renders for a valid session without draft mode, checking the token with the CMS', async () => {
    draft.isEnabled = false
    expect(find(elements(await renderLive()), RefreshRouteOnSave)).toBeDefined()
    expect(getEditor).toHaveBeenCalledWith('jwt')
  })
  it('is a 404 without a token', async () => {
    jar.clear()
    await expect(renderLive()).rejects.toThrow('NOT_FOUND')
    expect(getPostById).not.toHaveBeenCalled()
  })
  it('is a 404 when the CMS rejects the token', async () => {
    jar.set('payload-token', { value: 'forged' })
    await expect(renderLive()).rejects.toThrow('NOT_FOUND')
    expect(getPostById).not.toHaveBeenCalled()
  })
})
