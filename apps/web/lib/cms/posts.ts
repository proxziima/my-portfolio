import 'server-only'
import type { Post } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toPostView } from './mappers'
import { CMS_TIMEOUT_MS } from './preview'
import type { PostView } from './types'

interface List<T> { docs: T[] }

/** The editor's `payload-token` cookie value, for reading drafts as that editor. */
export interface DraftAuth { token?: string }

export interface PostQuery extends DraftAuth {
  /** Draft mode: read the latest draft with the editor's own token, never cached. */
  draft: boolean
}

const POST_DEPTH = '2'
const DRAFT = { draft: 'true' }

const postQuery = (slug: string, draft: boolean) =>
  new URLSearchParams({ 'where[slug][equals]': slug, depth: POST_DEPTH, limit: '1', ...(draft ? DRAFT : {}) }).toString()

/** An uncached, time-limited read as the editor. `null` when the CMS has no such document (404). */
async function fetchDraft<T>(path: string, { token }: DraftAuth): Promise<T | null> {
  const res = await fetch(new URL(path, cmsBaseUrl()), {
    headers: token ? { Authorization: `JWT ${token}` } : {},
    cache: 'no-store',
    signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`CMS ${res.status} for draft post`)
  return (await res.json()) as T
}

const toView = (post: Post | null | undefined): PostView | null => (post ? toPostView(post, cmsBaseUrl()) : null)

export async function getPostBySlug(slug: string, { draft, token }: PostQuery): Promise<PostView | null> {
  const path = `/api/posts?${postQuery(slug, draft)}`
  const list = draft ? await fetchDraft<List<Post>>(path, { token }) : await cmsGet<List<Post>>(path)
  return toView(list?.docs[0])
}

/** The latest draft by id: the Live Preview key, stable while the slug still follows the title. */
export async function getPostById(id: string, auth: DraftAuth): Promise<PostView | null> {
  const query = new URLSearchParams({ depth: POST_DEPTH, ...DRAFT }).toString()
  return toView(await fetchDraft<Post>(`/api/posts/${encodeURIComponent(id)}?${query}`, auth))
}
