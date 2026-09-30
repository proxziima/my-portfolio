import { revalidateTag } from 'next/cache'
import { CMS_TAG } from '@/lib/cms/client'

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret || request.headers.get('x-revalidate-secret') !== secret) {
    return Response.json({ revalidated: false }, { status: 401 })
  }
  revalidateTag(CMS_TAG, { expire: 0 })
  return Response.json({ revalidated: true })
}
