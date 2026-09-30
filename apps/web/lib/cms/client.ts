import 'server-only'

export const CMS_TAG = 'cms'
export const cmsBaseUrl = () => process.env.CMS_URL ?? 'http://localhost:3001'

export async function cmsGet<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, cmsBaseUrl()), { next: { tags: [CMS_TAG], revalidate: 300 } })
  if (!res.ok) throw new Error(`CMS ${res.status} for ${path}`)
  return (await res.json()) as T
}
