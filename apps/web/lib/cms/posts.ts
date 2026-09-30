import 'server-only'
import type { Post } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toPostView } from './mappers'
import { CMS_TIMEOUT_MS } from './preview'
import type { PostView } from './types'

interface List<T> { docs: T[] }

export interface PostQuery {
  /** Draft mode: read the latest draft with the editor's own token, never cached. */
  draft: boolean
  /** The editor's `payload-token` cookie value. */
  token?: string
}

const postQuery = (slug: string, draft: boolean) =>
  new URLSearchParams({
    'where[slug][equals]': slug,
    depth: '2',
    limit: '1',
    ...(draft ? { draft: 'true' } : {}),
  }).toString()

async function fetchDraft(slug: string, token: string | undefined): Promise<List<Post>> {
  const res = await fetch(new URL(`/api/posts?${postQuery(slug, true)}`, cmsBaseUrl()), {
    headers: token ? { Authorization: `JWT ${token}` } : {},
    cache: 'no-store',
    signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`CMS ${res.status} for draft post`)
  return (await res.json()) as List<Post>
}

export async function getPostBySlug(slug: string, { draft, token }: PostQuery): Promise<PostView | null> {
  const { docs } = draft
    ? await fetchDraft(slug, token)
    : await cmsGet<List<Post>>(`/api/posts?${postQuery(slug, false)}`)
  const post = docs[0]
  return post ? toPostView(post, cmsBaseUrl()) : null
}
