import { expect, test } from '@playwright/test'

test('the blog preview is closed to visitors', async ({ request }) => {
  const post = await request.get('/blog/anything', { maxRedirects: 0 })
  expect(post.status()).toBe(404)

  const preview = await request.get('/api/preview?previewSecret=wrong&path=/blog/x', { maxRedirects: 0 })
  expect(preview.status()).toBe(403)
})
