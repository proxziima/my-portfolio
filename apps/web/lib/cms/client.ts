import 'server-only'

export const CMS_TAG = 'cms'
export const cmsBaseUrl = () => process.env.CMS_URL ?? 'http://localhost:3001'

/**
 * The CMS admin's origin as the browser sees it. Live Preview only accepts `postMessage` events from
 * exactly this origin, so it can differ from the server-side `CMS_URL` (e.g. a private network host).
 */
export const cmsAdminOrigin = () => new URL(process.env.NEXT_PUBLIC_CMS_URL || cmsBaseUrl()).origin

export async function cmsGet<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, cmsBaseUrl()), { next: { tags: [CMS_TAG], revalidate: 300 } })
  if (!res.ok) throw new Error(`CMS ${res.status} for ${path}`)
  return (await res.json()) as T
}
