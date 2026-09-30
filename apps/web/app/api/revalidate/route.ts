import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { CMS_TAG } from '@/lib/cms/client'

const digest = (value: string) => createHash('sha256').update(value).digest()

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const provided = request.headers.get('x-revalidate-secret')
  if (!secret || !provided || !timingSafeEqual(digest(provided), digest(secret))) {
    return Response.json({ revalidated: false }, { status: 401 })
  }
  revalidateTag(CMS_TAG, { expire: 0 })
  return Response.json({ revalidated: true })
}
