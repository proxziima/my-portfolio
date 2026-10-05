# Companies and Brand Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `companies` collection that experiences, projects and role bios reference. Companies and projects show an icon chosen in this order: the uploaded logo, else a self-hosted favicon fetched from the URL, else the text chip.

**Architecture:** On the CMS side (Payload 3.90, SQLite):
- New `companies` and hidden `favicons` (upload) collections.
- A shared `brandFields()` and favicon hooks for both Companies and Projects.
- A polymorphic `recordLink` inline block for bios.
- A hand-edited migration that carries the owner's data over.

On the web side (Next 16), one lookup keyed `relationTo:id` resolves every reference, and `chipLinkHtml`/`ChipLink` render an `<img class="chip chip-img">` when an icon exists.

**Tech Stack:** Payload CMS 3.90.2 (`@payloadcms/db-sqlite`, lexical), Next.js 16, React 19, vitest, bun workspaces.

**Spec:** `docs/superpowers/specs/2026-10-05-companies-and-brand-icons-design.md`. Read it first.

**Ground rules for every task:**
- Work only inside the worktree `D:\Second Brain\01.PROJETOS\applications\my-portfolio\.claude\worktrees\feat-companies` (branch `feat/companies`). Never `cd` to the main checkout.
- The worktree's `apps/payload/payload.db` is a *copy* of the owner's DB. Never delete or reset it, and never run `bun run seed` against it.
- **Never start `next dev` for the CMS in this worktree before Task 7 is done.** Dev mode pushes the schema and would destroy the copy's experience data before the migration runs.
- Bash guard: run `git add` and `git commit` as separate single commands with literal paths. No `&&`, `;`, heredocs or `$(…)` in any command that contains the word git.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pass it as a second `-m`.
- Commands:
  - CMS tests: `bun run --cwd apps/payload test:int` (vitest; files `apps/payload/tests/int/*.int.spec.ts`; `@/` = `apps/payload/src`).
  - CMS types: `bun run --cwd apps/payload check-types`.
  - Web tests: `bun run --cwd apps/web test`. Web types: `bun run --cwd apps/web check-types`.
  - ESLint has no TS globs (lint is vacuous), so trust types and tests.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/payload/src/fields/disclosure.ts` | modify | + `stricterTier` |
| `apps/payload/src/favicons/discover.ts` | create | Network lookup: page `<link rel=icon>` → `/favicon.ico`, caps, sniffing |
| `apps/payload/src/favicons/hooks.ts` | create | `syncFavicon` (beforeChange), `deleteFavicon` (afterDelete), `withFaviconHooks` |
| `apps/payload/src/fields/brand.ts` | create | `brandFields()` = chip, url, logo, favicon |
| `apps/payload/src/collections/Favicons.ts` | create | Hidden upload collection |
| `apps/payload/src/collections/Companies.ts` | create | Companies |
| `apps/payload/src/collections/Experiences.ts` | modify | company → relationship, drop chip/url |
| `apps/payload/src/collections/Projects.ts` | modify | brandFields, optional company |
| `apps/payload/src/blocks/record-link.ts` | create | `recordLink` inline block |
| `apps/payload/src/editor/bio-editor.ts` | modify | register block |
| `apps/payload/src/uploads/static-dir.ts`, `src/environment.d.ts`, `Dockerfile`, `.gitignore` | modify | `FAVICONS_DIR` |
| `apps/payload/src/payload.config.ts` | modify | register collections |
| `apps/payload/src/mcp/mcp-plugin.ts` | modify | expose companies |
| `apps/payload/src/mcp/twin-corpus.ts`, `twin-tools.ts` | modify | names + effective tiers |
| `apps/payload/src/seed/{lexical,data,run}.ts` | modify | companies + record links |
| `apps/payload/src/migrations/*_companies.{ts,json}`, `index.ts` | create/modify | schema + data |
| `apps/payload/src/scripts/refresh-favicons.ts` + `package.json` script | create | backfill |
| `packages/cms-types/src/payload-types.ts` | regenerate | types |
| `apps/web/shared/ui/{chip-markup.ts,ChipLink.tsx}` | modify | icon slot |
| `apps/web/styles/base.css`, `apps/web/features/os/os.css` | modify | `.chip-img` |
| `apps/web/lib/cms/{records.ts(new),bio-html.ts,mappers.ts,queries.ts,types.ts}` | modify | lookup + resolution |
| `apps/web/features/sections/EntryList.tsx` | modify | pass icon |

---

### Task 1: `stricterTier`

**Files:** Modify `apps/payload/src/fields/disclosure.ts`. Test: `apps/payload/tests/int/disclosure.int.spec.ts`.

- [ ] **Step 1: Write the failing test.** Append inside the existing `describe('disclosure tiers', …)` block and add `stricterTier` to the import from `@/fields/disclosure`:

```ts
  it('combines two tiers into the stricter one', () => {
    expect(stricterTier('public', 'public')).toBe('public')
    expect(stricterTier('public', 'restricted')).toBe('restricted')
    expect(stricterTier('never', 'restricted')).toBe('never')
    expect(stricterTier('restricted', 'public')).toBe('restricted')
  })
```

- [ ] **Step 2:** Run `bun run --cwd apps/payload test:int -- disclosure`. Expected: FAIL (`stricterTier` is not exported).
- [ ] **Step 3: Implement.** Append to `apps/payload/src/fields/disclosure.ts`:

```ts
/** The stricter of two tiers: a fact is only as visible as the least visible thing it reveals. */
export const stricterTier = (a: DisclosureTier, b: DisclosureTier): DisclosureTier =>
  DISCLOSURE_TIERS[Math.max(DISCLOSURE_TIERS.indexOf(a), DISCLOSURE_TIERS.indexOf(b))]!
```

- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit.**
  - `git add apps/payload/src/fields/disclosure.ts apps/payload/tests/int/disclosure.int.spec.ts`
  - `git commit -m "feat(cms): stricterTier combines two disclosure tiers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Favicon discovery (pure, network via injected fetch)

**Files:** Create `apps/payload/src/favicons/discover.ts`. Test: `apps/payload/tests/int/favicon-discover.int.spec.ts`.

- [ ] **Step 1: Write the failing tests.** Create `apps/payload/tests/int/favicon-discover.int.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { discoverFavicon, iconLinks } from '@/favicons/discover'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const ICO = Uint8Array.from([0, 0, 1, 0, 1, 0, 16, 16])

const html = (head: string) => new Response(`<html><head>${head}</head></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const image = (bytes: Uint8Array, type: string) => new Response(bytes, { headers: { 'content-type': type } })
const notFound = () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })

/** A fetch stub answering from a url → response factory table; anything else 404s. */
const stub = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: string | URL | Request) => (routes[String(input)] ?? notFound)())

describe('iconLinks', () => {
  it('ranks declared icons by size, any/svg first, and resolves relative hrefs', () => {
    const page = `
      <link rel="icon" href="/small.png" sizes="16x16">
      <link rel="apple-touch-icon" href="touch.png" sizes="180x180">
      <link rel="stylesheet" href="/x.css">
      <link rel="shortcut icon" href="/legacy.ico">
      <link href='/vector.svg' rel='icon' type='image/svg+xml'>`
    expect(iconLinks(page, 'https://a.dev/en/')).toEqual([
      'https://a.dev/vector.svg',
      'https://a.dev/en/touch.png',
      'https://a.dev/small.png',
      'https://a.dev/legacy.ico',
    ])
  })
  it('ignores non-http hrefs', () => {
    expect(iconLinks('<link rel="icon" href="data:image/png;base64,AAAA">', 'https://a.dev/')).toEqual([])
  })
})

describe('discoverFavicon', () => {
  it('returns the best declared icon', async () => {
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/icon.png" sizes="32x32">'),
      'https://a.dev/icon.png': () => image(PNG, 'image/png'),
    })
    const found = await discoverFavicon('https://a.dev/', fetchImpl)
    expect(found).toMatchObject({ mimetype: 'image/png', ext: 'png' })
    expect(found?.data.length).toBe(PNG.length)
  })
  it('falls back to /favicon.ico at the origin', async () => {
    const fetchImpl = stub({
      'https://a.dev/team': () => html(''),
      'https://a.dev/favicon.ico': () => image(ICO, 'image/x-icon'),
    })
    expect(await discoverFavicon('https://a.dev/team', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('sniffs icons served as application/octet-stream', async () => {
    const fetchImpl = stub({ 'https://a.dev/favicon.ico': () => image(ICO, 'application/octet-stream') })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toMatchObject({ mimetype: 'image/x-icon', ext: 'ico' })
  })
  it('skips non-image and oversize candidates', async () => {
    const big = new Uint8Array(600_000)
    big.set(PNG)
    const fetchImpl = stub({
      'https://a.dev/': () => html('<link rel="icon" href="/big.png"><link rel="icon" href="/page.png">'),
      'https://a.dev/big.png': () => image(big, 'image/png'),
      'https://a.dev/page.png': () => html(''),
    })
    expect(await discoverFavicon('https://a.dev/', fetchImpl)).toBeNull()
  })
  it('returns null for non-http urls without fetching', async () => {
    const fetchImpl = stub({})
    expect(await discoverFavicon('mailto:a@b.dev', fetchImpl)).toBeNull()
    expect(await discoverFavicon('/about', fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('survives network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await discoverFavicon('https://down.dev/', fetchImpl)).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `bun run --cwd apps/payload test:int -- favicon-discover`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Create `apps/payload/src/favicons/discover.ts`:

```ts
/** A favicon ready to store: its bytes, MIME type and file extension. */
export interface FoundFavicon {
  data: Buffer
  mimetype: string
  ext: string
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 5000
const PAGE_LIMIT = 1_000_000
const ICON_LIMIT = 512_000
const USER_AGENT = 'Mozilla/5.0 (compatible; portfolio-favicon/1.0)'

const EXTENSIONS: Record<string, string> = {
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

const isHttp = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:'

/** The body as a Buffer, or null once it passes `limit` bytes (the download is cancelled there). */
async function readCapped(res: Response, limit: number): Promise<Buffer | null> {
  if (Number(res.headers.get('content-length')) > limit) {
    await res.body?.cancel()
    return null
  }
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** ICO and PNG files by their magic bytes, for servers that send icons as octet-stream. */
function sniff(data: Buffer): string | undefined {
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) return 'image/x-icon'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return undefined
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/**
 * Icon URLs a page declares (`rel` icon, shortcut icon, apple-touch-icon), best first: `sizes="any"`
 * and SVG count as largest, then the largest declared size, then document order.
 */
export function iconLinks(html: string, base: string): string[] {
  const found: { href: string; size: number; index: number }[] = []
  for (const [index, match] of [...html.matchAll(/<link\b[^>]*>/gi)].entries()) {
    const tag = match[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue
    const href = attr(tag, 'href')
    if (!href) continue
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    if (!isHttp(url)) continue
    const sizes = (attr(tag, 'sizes') ?? '').toLowerCase()
    const svg = (attr(tag, 'type') ?? '').toLowerCase() === 'image/svg+xml' || url.pathname.toLowerCase().endsWith('.svg')
    const declared = sizes.split(/\s+/).map((s) => Number.parseInt(s, 10)).filter(Number.isFinite)
    const size = sizes === 'any' || svg ? Number.POSITIVE_INFINITY : Math.max(0, ...declared)
    found.push({ href: url.toString(), size, index })
  }
  return found
    .sort((a, b) => (a.size === b.size ? a.index - b.index : b.size > a.size ? 1 : -1))
    .map((c) => c.href)
}

/**
 * Finds a site's icon: the icons its page declares, best first, then `/favicon.ico` at the origin.
 * The first candidate that answers 200 with an image (or ICO/PNG bytes) under 512 KB wins. Every
 * request times out after 5 s. Returns null for non-http(s) URLs or when nothing qualifies; never throws.
 */
export async function discoverFavicon(url: string, fetchImpl: Fetch = fetch): Promise<FoundFavicon | null> {
  let page: URL
  try {
    page = new URL(url)
  } catch {
    return null
  }
  if (!isHttp(page)) return null
  const get = (target: string) =>
    fetchImpl(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
    })

  const candidates: string[] = []
  try {
    const res = await get(page.toString())
    if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      const body = await readCapped(res, PAGE_LIMIT)
      if (body) candidates.push(...iconLinks(body.toString('utf8'), res.url || page.toString()))
    } else {
      await res.body?.cancel()
    }
  } catch {
    // An unreachable page still leaves /favicon.ico to try.
  }
  candidates.push(new URL('/favicon.ico', page.origin).toString())

  for (const candidate of new Set(candidates)) {
    try {
      const res = await get(candidate)
      const declared = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      if (!res.ok || !(declared.startsWith('image/') || declared === 'application/octet-stream' || declared === '')) {
        await res.body?.cancel()
        continue
      }
      const data = await readCapped(res, ICON_LIMIT)
      if (!data || data.length === 0) continue
      const mimetype = declared.startsWith('image/') ? declared : sniff(data)
      if (!mimetype) continue
      return { data, mimetype, ext: EXTENSIONS[mimetype] ?? mimetype.slice('image/'.length).replace(/[^a-z0-9]/g, '') }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}
```

- [ ] **Step 4:** Run `bun run --cwd apps/payload test:int -- favicon-discover`. Expected: PASS, 8 tests.
- [ ] **Step 5: Commit.**
  - `git add apps/payload/src/favicons/discover.ts apps/payload/tests/int/favicon-discover.int.spec.ts`
  - `git commit -m "feat(cms): discover a site's favicon from its declared icons or /favicon.ico" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 3: Favicons collection, favicon hooks, brand fields

**Files:**
- Create `apps/payload/src/favicons/hooks.ts`, `apps/payload/src/fields/brand.ts` and `apps/payload/src/collections/Favicons.ts`.
- Modify `apps/payload/src/uploads/static-dir.ts`, `apps/payload/src/environment.d.ts`, `apps/payload/Dockerfile` and `apps/payload/.gitignore`.
- Test: `apps/payload/tests/int/favicon-hooks.int.spec.ts`.

- [ ] **Step 1: Write the failing tests.** Create `apps/payload/tests/int/favicon-hooks.int.spec.ts`. It drives the hook with a fake `req.payload` and a mocked `discoverFavicon`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/favicons/discover', () => ({ discoverFavicon: vi.fn() }))
import { discoverFavicon } from '@/favicons/discover'
import { deleteFavicon, syncFavicon } from '@/favicons/hooks'

const discover = vi.mocked(discoverFavicon)
const ICON = { data: Buffer.from([0, 0, 1, 0]), mimetype: 'image/x-icon', ext: 'ico' }

function fakeReq() {
  const payload = {
    create: vi.fn(async () => ({ id: 50 })),
    update: vi.fn(async ({ id }: { id: number }) => ({ id })),
    delete: vi.fn(async () => ({})),
    logger: { warn: vi.fn() },
  }
  return { payload, context: {} as Record<string, unknown> }
}

type Args = Parameters<typeof syncFavicon>[0]
const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) => {
  const req = fakeReq()
  req.context = context
  const result = syncFavicon({ data, originalDoc, req, context, operation: originalDoc ? 'update' : 'create' } as unknown as Args)
  return { req, result }
}

beforeEach(() => discover.mockReset())

describe('syncFavicon', () => {
  it('stores the discovered icon on create', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ name: 'Autodoc', url: 'https://autodoc.com.br' })
    expect(await result).toMatchObject({ favicon: 50 })
    expect(req.payload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'favicons',
      file: expect.objectContaining({ name: 'autodoc-favicon.ico', mimetype: 'image/x-icon', size: 4 }),
    }))
  })
  it('keeps the stored icon when the url is unchanged', async () => {
    const { req, result } = run({ name: 'A', url: 'https://a.dev' }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: 9 })
    expect(discover).not.toHaveBeenCalled()
    expect(req.payload.update).not.toHaveBeenCalled()
  })
  it('replaces the icon in place when the url changes', async () => {
    discover.mockResolvedValue(ICON)
    const { req, result } = run({ name: 'A', url: 'https://b.dev' }, { name: 'A', url: 'https://a.dev', favicon: { id: 9 } })
    expect(await result).toMatchObject({ favicon: 9 })
    expect(req.payload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
  it('re-fetches an unchanged url when asked to refresh', async () => {
    discover.mockResolvedValue(ICON)
    const { result } = run({ name: 'A', url: 'https://a.dev' }, { name: 'A', url: 'https://a.dev', favicon: 9 }, { refreshFavicon: true })
    await result
    expect(discover).toHaveBeenCalledWith('https://a.dev')
  })
  it('deletes the icon when the url is cleared', async () => {
    const { req, result } = run({ name: 'A', url: null }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: null })
    expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
  it('saves without an icon when discovery finds nothing', async () => {
    discover.mockResolvedValue(null)
    const { req, result } = run({ name: 'A', url: 'https://a.dev' })
    expect(await result).toMatchObject({ favicon: null })
    expect(req.payload.logger.warn).toHaveBeenCalled()
  })
  it('reads the url from the stored doc on a partial update', async () => {
    const { result } = run({ name: 'Renamed' }, { name: 'A', url: 'https://a.dev', favicon: 9 })
    expect(await result).toMatchObject({ favicon: 9 })
  })
  it('does nothing with skipFavicon', async () => {
    const { req, result } = run({ name: 'A', url: 'https://a.dev' }, undefined, { skipFavicon: true })
    expect(await result).toEqual({ name: 'A', url: 'https://a.dev' })
    expect(discover).not.toHaveBeenCalled()
    expect(req.payload.create).not.toHaveBeenCalled()
  })
})

describe('deleteFavicon', () => {
  it('removes the favicon of a deleted owner', async () => {
    const req = fakeReq()
    await deleteFavicon({ doc: { id: 1, favicon: 9 }, req } as unknown as Parameters<typeof deleteFavicon>[0])
    expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'favicons', id: 9 }))
  })
})
```

- [ ] **Step 2:** Run `bun run --cwd apps/payload test:int -- favicon-hooks`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement the hooks.** Create `apps/payload/src/favicons/hooks.ts`:

```ts
import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig, PayloadRequest } from 'payload'
import { discoverFavicon } from './discover'

const idOf = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number') return (ref as { id: number }).id
  return null
}

const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'

async function removeFavicon(req: PayloadRequest, id: number | null): Promise<void> {
  if (id === null) return
  try {
    await req.payload.delete({ collection: 'favicons', id, req, overrideAccess: true })
  } catch (err) {
    req.payload.logger.warn({ err }, `favicon ${id} could not be deleted`)
  }
}

/**
 * Keeps `favicon` in step with `url`: fetched when the URL changes or none is stored yet, replaced in
 * place, deleted when the URL goes or nothing is found. A failed fetch never blocks the save.
 * `context.skipFavicon` turns it off; `context.refreshFavicon` re-fetches an unchanged URL.
 */
export const syncFavicon: CollectionBeforeChangeHook = async ({ data, originalDoc, req, context }) => {
  if (context.skipFavicon) return data
  const url: unknown = data.url !== undefined ? data.url : originalDoc?.url
  const previous = idOf(originalDoc?.favicon)
  if (originalDoc && url === originalDoc.url && previous !== null && !context.refreshFavicon) {
    data.favicon = previous
    return data
  }
  const found = typeof url === 'string' && url ? await discoverFavicon(url) : null
  if (!found) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) req.payload.logger.warn(`no favicon found for ${url}`)
    data.favicon = null
    await removeFavicon(req, previous)
    return data
  }
  const name = String(data.name ?? originalDoc?.name ?? 'site')
  const file = { data: found.data, mimetype: found.mimetype, name: `${slugOf(name)}-favicon.${found.ext}`, size: found.data.length }
  const doc =
    previous !== null
      ? await req.payload.update({ collection: 'favicons', id: previous, data: {}, file, req, overrideAccess: true })
      : await req.payload.create({ collection: 'favicons', data: {}, file, req, overrideAccess: true })
  data.favicon = doc.id
  return data
}

export const deleteFavicon: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await removeFavicon(req, idOf(doc?.favicon))
}

/** Adds the favicon hooks to a collection's existing hooks. */
export const withFaviconHooks = (hooks: NonNullable<CollectionConfig['hooks']>): NonNullable<CollectionConfig['hooks']> => ({
  ...hooks,
  beforeChange: [...(hooks.beforeChange ?? []), syncFavicon],
  afterDelete: [...(hooks.afterDelete ?? []), deleteFavicon],
})
```

- [ ] **Step 4: Static dir and env.** In `apps/payload/src/uploads/static-dir.ts`:
  - Change the union to `'MEDIA_DIR' | 'SCENES_DIR' | 'FAVICONS_DIR'`.
  - Change the doc comment to mention `$FAVICONS_DIR`.

  In `apps/payload/src/environment.d.ts`, add `FAVICONS_DIR?: string` below `SCENES_DIR?: string`. In `apps/payload/Dockerfile`, change the env block lines 39–40 to:

```
    MEDIA_DIR=/data/media \
    SCENES_DIR=/data/scenes \
    FAVICONS_DIR=/data/favicons
```

  In `apps/payload/.gitignore`, add `public/favicons/` below `public/scenes/`.

- [ ] **Step 5: Favicons collection.** Create `apps/payload/src/collections/Favicons.ts`:

```ts
import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { uploadStaticDir } from '../uploads/static-dir'

/** Site icons fetched from a company's or project's URL (see favicons/hooks.ts). Managed by hooks only. */
export const Favicons: CollectionConfig = {
  slug: 'favicons',
  admin: { hidden: true },
  access: publicContentAccess,
  fields: [],
  upload: {
    staticDir: uploadStaticDir('FAVICONS_DIR', 'favicons'),
    mimeTypes: ['image/*'],
    // ICO and SVG cannot go through sharp; icons are never cropped or resized.
    focalPoint: false,
    crop: false,
  },
}
```

- [ ] **Step 6: Brand fields.** Create `apps/payload/src/fields/brand.ts`:

```ts
import type { Field } from 'payload'
import { chipField } from './chip'
import { urlField } from './link-url'

/**
 * What a company or project shows beside its name: the uploaded logo, else the favicon fetched from
 * `url`, else the text chip.
 */
export const brandFields = (): Field[] => [
  chipField(),
  urlField(),
  { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Shown instead of the favicon and the chip.' } },
  {
    name: 'favicon',
    type: 'upload',
    relationTo: 'favicons',
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'Fetched from the URL on save. Used when there is no logo; the chip is the last fallback.',
    },
  },
]
```

- [ ] **Step 7:** Run `bun run --cwd apps/payload test:int -- favicon-hooks`. Expected: PASS, 9 tests. Do **not** run check-types yet: `relationTo: 'favicons'` is only typed after Task 4 regenerates types.
- [ ] **Step 8: Commit.**
  - `git add apps/payload/src/favicons/hooks.ts apps/payload/src/fields/brand.ts apps/payload/src/collections/Favicons.ts apps/payload/src/uploads/static-dir.ts apps/payload/src/environment.d.ts apps/payload/Dockerfile apps/payload/.gitignore apps/payload/tests/int/favicon-hooks.int.spec.ts`
  - `git commit -m "feat(cms): self-hosted favicons kept in step with a record's url" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 4: Companies, experiences, projects, the record link block, MCP, types

**Files:**
- Create `apps/payload/src/collections/Companies.ts` and `apps/payload/src/blocks/record-link.ts`.
- Modify `apps/payload/src/collections/Experiences.ts`, `apps/payload/src/collections/Projects.ts`, `apps/payload/src/editor/bio-editor.ts`, `apps/payload/src/payload.config.ts` and `apps/payload/src/mcp/mcp-plugin.ts`.
- Regenerate `packages/cms-types/src/payload-types.ts` and possibly `apps/payload/src/app/(payload)/admin/importMap.js`.

- [ ] **Step 1: Companies.** Create `apps/payload/src/collections/Companies.ts`:

```ts
import type { CollectionConfig } from 'payload'
import { disclosureRead } from '../access/disclosure-read'
import { publicContentAccess } from '../access/public-read'
import { brandFields } from '../fields/brand'
import { disclosureField } from '../fields/disclosure'
import { withFaviconHooks } from '../favicons/hooks'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

/**
 * A company written once and referenced by experiences, projects and bio links. Its tier also caps
 * every row that references it: a hidden company hides its experiences and bio links everywhere.
 */
export const Companies: CollectionConfig = {
  slug: 'companies',
  labels: { singular: 'Company', plural: 'Companies' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'url', 'disclosure'] },
  defaultSort: 'name',
  access: { ...publicContentAccess, read: disclosureRead },
  hooks: withFaviconHooks(revalidateCollectionHooks),
  fields: [{ name: 'name', type: 'text', required: true, unique: true }, ...brandFields(), disclosureField()],
}
```

- [ ] **Step 2: Experiences.** Replace the `admin` line and the first three fields in `apps/payload/src/collections/Experiences.ts`:
  - `admin` becomes `admin: { useAsTitle: 'title', defaultColumns: ['title', 'company', 'startYear', 'endYear'] },`
  - Fields: remove `{ name: 'company', type: 'text', required: true }`, `chipField()` and `urlField()`. As the first field, add `{ name: 'company', type: 'relationship', relationTo: 'companies', required: true },`
  - Remove the now-unused `chipField` and `urlField` imports.

- [ ] **Step 3: Projects.** In `apps/payload/src/collections/Projects.ts`:
  - `hooks: withFaviconHooks(revalidateCollectionHooks),` (import from `../favicons/hooks`).
  - Fields become:

```ts
  fields: [
    { name: 'name', type: 'text', required: true },
    ...brandFields(),
    { name: 'summary', type: 'text', required: true },
    { name: 'company', type: 'relationship', relationTo: 'companies', admin: { description: 'Where or for whom it was built (optional).' } },
    disciplinesField('Disciplines this project appears under. Empty = all.'),
    orderField(),
    disclosureField(),
  ],
```

  Replace the `chipField`/`urlField` imports with `import { brandFields } from '../fields/brand'`.

- [ ] **Step 4: Record link block.** Create `apps/payload/src/blocks/record-link.ts`:

```ts
import type { Block } from 'payload'

/** A bio link to a company or project: name, icon and URL come from the record. Bios are public prose, so only public records qualify. */
export const RecordLinkBlock: Block = {
  slug: 'recordLink',
  labels: { singular: 'Company or project link', plural: 'Company or project links' },
  fields: [
    {
      name: 'record',
      type: 'relationship',
      relationTo: ['companies', 'projects'],
      required: true,
      filterOptions: { disclosure: { equals: 'public' } },
      admin: { description: 'Only public companies and projects can be linked.' },
    },
  ],
}
```

  In `apps/payload/src/editor/bio-editor.ts`, import it and change the line to `BlocksFeature({ inlineBlocks: [RecordLinkBlock, ChipLinkBlock, CuriousToggleBlock] }),`. In `apps/payload/src/blocks/chip-link.ts`, change the labels to `{ singular: 'Chip link (free text)', plural: 'Chip links (free text)' }`, so editors reach for the record link first.

- [ ] **Step 5: Register.** In `apps/payload/src/payload.config.ts`, import `Companies` and `Favicons` and set:
  `collections: [Disciplines, Companies, Experiences, Projects, Content, Knowledge, Posts, Categories, Media, Favicons, Scenes, Users],`

- [ ] **Step 6: MCP.** In `apps/payload/src/mcp/mcp-plugin.ts`, add before `experiences`:

```ts
    companies: {
      enabled: crud,
      description: 'Companies referenced by experiences, projects and bio links: name, favicon chip, url, optional logo, disclosure tier. The icon shown is the logo, else the favicon fetched from the url, else the chip.',
    },
```

  Then change the descriptions:
  - experiences: `'Professional background: one row per company (a relationship to companies) + title, with start/end years and the disciplines it belongs to.'`
  - projects: `'Portfolio projects: name, favicon chip, url, optional logo, one-line summary, optional company, disciplines. The icon shown is the logo, else the favicon fetched from the url, else the chip.'`
  - disciplines: append `' Link companies and projects in bios with the recordLink inline block; chipLink is for free-text links only.'` to its description.

- [ ] **Step 7: Generate types and import map.**
  - Run `bun run --cwd apps/payload generate:types`. Expected: `packages/cms-types/src/payload-types.ts` gains `Company` and `Favicon`, and `Experience.company` becomes `number | Company`.
  - Run `bun run --cwd apps/payload generate:importmap`. If it changes `apps/payload/src/app/(payload)/admin/importMap.js`, include that file in the commit.
  - Neither command starts the dev server. If either tries to push to the DB, stop and report.
- [ ] **Step 8: Fix type errors.** Run `bun run --cwd apps/payload check-types`.
  - Expected errors only in `src/seed/run.ts`, `src/seed/data.ts`, `src/mcp/twin-tools.ts` (`company` is no longer a string). Tasks 5 and 6 fix those.
  - Any error elsewhere must be fixed now.
  - Run `bun run --cwd apps/payload test:int` and expect it to pass. vitest does not type-check.
- [ ] **Step 9: Commit.**
  - `git add apps/payload/src/collections apps/payload/src/blocks apps/payload/src/editor/bio-editor.ts apps/payload/src/payload.config.ts apps/payload/src/mcp/mcp-plugin.ts packages/cms-types/src/payload-types.ts`
  - Add `importMap.js` too if it changed.
  - `git commit -m "feat(cms): Companies collection referenced by experiences, projects and a bio record link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 5: Twin corpus — company names and effective tiers

**Files:** Modify `apps/payload/src/mcp/twin-corpus.ts` and `apps/payload/src/mcp/twin-tools.ts`. Test: `apps/payload/tests/int/twin-corpus.int.spec.ts` (and a new `twin-tools.int.spec.ts`).

- [ ] **Step 1: Write failing tests.** Append to `apps/payload/tests/int/twin-corpus.int.spec.ts`:

```ts
  it('names record links through the resolver and drops unresolved ones', () => {
    const bio = { root: { children: [{ type: 'paragraph', children: [
      { type: 'text', text: 'At ' },
      { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'companies', value: 3 } } },
      { type: 'text', text: ' and ' },
      { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'projects', value: 9 } } },
    ] }] } }
    const names = (ref: unknown) => ((ref as { relationTo: string; value: number }).value === 3 ? 'Autodoc' : undefined)
    expect(lexicalText(bio, names)).toBe('At Autodoc and')
  })
```

  Create `apps/payload/tests/int/twin-tools.int.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { loadCorpus, loadIdentity } from '@/mcp/twin-tools'

const companies = [
  { id: 1, name: 'Autodoc', url: 'https://autodoc.com.br', disclosure: 'public' },
  { id: 2, name: 'Stealth Co', url: null, disclosure: 'restricted' },
]
const docs: Record<string, unknown[]> = {
  companies,
  experiences: [
    { id: 10, title: 'AI Engineer', company: 1, startYear: 2024, endYear: null, disclosure: 'public' },
    { id: 11, title: 'Advisor', company: 2, startYear: 2025, endYear: null, disclosure: 'public' },
  ],
  projects: [{ id: 20, name: 'Sonda', summary: 'Sampler', url: null, company: 1, disclosure: 'public' }],
  content: [],
  disciplines: [{ id: 30, title: 'SE', disclosure: 'public', bio: { root: { children: [{ type: 'paragraph', children: [
    { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'companies', value: 1 } } },
    { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'projects', value: 20 } } },
  ] }] } } }],
  knowledge: [],
}

/** Answers `find` from the table above, honouring a `disclosure: { equals: 'public' }` filter anywhere in `where`. */
const fakePayload = () => ({
  find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
    const publicOnly = JSON.stringify(where ?? {}).includes('"equals":"public"')
    const all = (docs[collection] ?? []) as { disclosure?: string }[]
    return { docs: publicOnly ? all.filter((d) => d.disclosure === 'public') : all }
  }),
  findGlobal: vi.fn(async ({ slug }: { slug: string }) => (slug === 'profile' ? { name: 'V', headlineTail: 'x', location: null } : { links: [] })),
}) as unknown as Payload

describe('twin tools', () => {
  it('names the company in experiences and caps their tier by the company', async () => {
    const corpus = await loadCorpus(fakePayload())
    const byId = new Map(corpus.map((e) => [e.item.sourceId, e]))
    expect(byId.get('experiences:10')).toMatchObject({ disclosure: 'public', item: { title: 'AI Engineer at Autodoc', url: 'https://autodoc.com.br' } })
    expect(byId.get('experiences:11')).toMatchObject({ disclosure: 'restricted', item: { title: 'Advisor at Stealth Co' } })
    expect(byId.get('projects:20')?.item.text).toBe('Sampler (at Autodoc)')
    expect(byId.get('disciplines:30')?.item.text).toBe('AutodocSonda')
  })
  it('lists only current roles at public companies in the identity', async () => {
    const identity = await loadIdentity(fakePayload())
    expect(identity.currentRoles).toEqual([{ title: 'AI Engineer', company: 'Autodoc' }])
  })
})
```

- [ ] **Step 2:** Run `bun run --cwd apps/payload test:int -- twin`. Expected: FAIL. `lexicalText` ignores record links, and the experience titles read `at [object Object]` or a number.
- [ ] **Step 3: Implement `lexicalText`.** In `apps/payload/src/mcp/twin-corpus.ts`, replace `lexicalText` with:

```ts
/** A record link's name, or undefined when the record may not be named (not public, or gone). */
export type RecordName = (ref: unknown) => string | undefined

/**
 * Plain text of a Lexical rich-text value (discipline bios), paragraphs separated by newlines. Record
 * links read their name through `recordName`; without one, or when it returns nothing, they read as
 * nothing.
 */
export function lexicalText(value: unknown, recordName: RecordName = () => undefined): string {
  const walk = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const n = node as { text?: unknown; children?: unknown[]; type?: unknown; fields?: { blockType?: unknown; record?: unknown; label?: unknown; word?: unknown } }
    if (typeof n.text === 'string') return n.text
    if (n.type === 'inlineBlock') {
      if (n.fields?.blockType === 'recordLink') return recordName(n.fields.record) ?? ''
      // Free-text chip links and the curious toggle carry their words in their fields.
      const name = n.fields?.label ?? n.fields?.word
      return typeof name === 'string' ? name : ''
    }
    const inner = (n.children ?? []).map(walk).join('')
    return n.type === 'paragraph' ? `${inner}\n` : inner
  }
  return walk((value as { root?: unknown } | null)?.root).trim()
}
```

- [ ] **Step 4: Implement the tools.** In `apps/payload/src/mcp/twin-tools.ts`:
  - Add `import { stricterTier } from '../fields/disclosure'` and `import type { Company } from '@repo/cms-types'`.
  - Add the helpers below.
  - Rewrite `loadCorpus` and `loadIdentity` as shown.
  - Keep everything else (the `json` helper and `twinTools`) unchanged.

```ts
/** A relationship value's id, populated or not. */
const refId = (ref: unknown): number | undefined =>
  typeof ref === 'number' ? ref : ref && typeof ref === 'object' && typeof (ref as { id?: unknown }).id === 'number' ? (ref as { id: number }).id : undefined

/** Every company with its tier, for naming and capping the rows that reference it. */
async function loadCompanies(payload: Payload, where?: Where): Promise<Map<number, Company>> {
  const found = await payload.find({ collection: 'companies', ...(where ? { where } : {}), limit: 1000, depth: 0, overrideAccess: true, pagination: false })
  return new Map(found.docs.map((c) => [c.id, c]))
}

/** Loads every non-never document the twin may search; the corpus is a few hundred docs at most. */
export async function loadCorpus(payload: Payload): Promise<CorpusEntry[]> {
  const opts = { where: NOT_NEVER, limit: 1000, depth: 0, overrideAccess: true, pagination: false } as const
  const [companies, experiences, projects, content, disciplines, knowledge, profile, contact] = await Promise.all([
    loadCompanies(payload),
    payload.find({ collection: 'experiences', ...opts }),
    payload.find({ collection: 'projects', ...opts }),
    payload.find({ collection: 'content', ...opts }),
    payload.find({ collection: 'disciplines', ...opts }),
    payload.find({ collection: 'knowledge', ...opts }),
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: 'contact', depth: 0, overrideAccess: true }),
  ])
  const entry = (item: TwinItem, disclosure: DisclosureTier, category: KnowledgeCategory | null = null): CorpusEntry => ({ item, disclosure, category })
  const companyOf = (ref: unknown) => companies.get(refId(ref) ?? -1)
  const publicProjects = new Map(projects.docs.filter((p) => p.disclosure === 'public').map((p) => [p.id, p.name]))
  // Bios are public prose: a record link is named only while its record is public.
  const recordName: RecordName = (ref) => {
    const { relationTo, value } = (ref ?? {}) as { relationTo?: unknown; value?: unknown }
    const id = refId(value) ?? -1
    if (relationTo === 'companies') {
      const c = companies.get(id)
      return c?.disclosure === 'public' ? c.name : undefined
    }
    return relationTo === 'projects' ? publicProjects.get(id) : undefined
  }
  return [
    entry({ sourceId: 'profile:global', kind: 'profile', title: `Profile: ${profile.name}`, text: [profile.name, profile.headlineTail, profile.location].filter(Boolean).join(' · ') }, 'public'),
    entry({ sourceId: 'contact:global', kind: 'contact', title: 'Contact links', text: (contact.links ?? []).map((l) => `${l.label}: ${l.url}`).join('\n') }, 'public'),
    ...experiences.docs.flatMap((d) => {
      const company = companyOf(d.company)
      if (!company) return []
      const item = { sourceId: `experiences:${d.id}`, kind: 'experience' as const, title: `${d.title} at ${company.name}`, text: `${d.title} at ${company.name}, ${d.startYear}–${d.endYear ?? 'present'}`, url: company.url ?? undefined }
      return [entry(item, stricterTier(d.disclosure, company.disclosure))]
    }),
    ...projects.docs.map((d) => {
      const company = companyOf(d.company)
      const text = company ? `${d.summary} (at ${company.name})` : d.summary
      return entry({ sourceId: `projects:${d.id}`, kind: 'project', title: `Project: ${d.name}`, text, url: d.url ?? undefined }, company ? stricterTier(d.disclosure, company.disclosure) : d.disclosure)
    }),
    ...content.docs.map((d) => entry({ sourceId: `content:${d.id}`, kind: 'content', title: `${d.kind}: ${d.title}`, text: [d.title, d.venue, d.date?.slice(0, 10)].filter(Boolean).join(' · '), url: d.url ?? undefined }, d.disclosure)),
    ...disciplines.docs.map((d) => entry({ sourceId: `disciplines:${d.id}`, kind: 'discipline', title: `Role: ${d.title}`, text: lexicalText(d.bio, recordName) }, d.disclosure)),
    ...knowledge.docs.map((d) => entry({ sourceId: `knowledge:${d.id}`, kind: 'knowledge', title: d.topic, text: d.answer }, d.disclosure, d.category)),
  ]
}
```

  Then `loadIdentity`:

```ts
/** Public identity grounding: profile, current roles at public companies, and `voice` samples written by the owner. */
export async function loadIdentity(payload: Payload): Promise<TwinIdentity> {
  const publicOnly = { disclosure: { equals: 'public' } } as const
  const [profile, current, voice, companies] = await Promise.all([
    payload.findGlobal({ slug: 'profile', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'experiences', where: { and: [publicOnly, { endYear: { exists: false } }] }, limit: 10, depth: 0, overrideAccess: true, pagination: false }),
    payload.find({ collection: 'knowledge', where: { and: [publicOnly, { category: { equals: 'voice' } }] }, limit: 5, depth: 0, overrideAccess: true, pagination: false, sort: 'order' }),
    loadCompanies(payload, publicOnly),
  ])
  return {
    name: profile.name,
    headline: profile.headlineTail ?? null,
    location: profile.location ?? null,
    currentRoles: current.docs.flatMap((d) => {
      const company = companies.get(refId(d.company) ?? -1)
      return company ? [{ title: d.title, company: company.name }] : []
    }),
    voiceSamples: voice.docs.map((d) => d.answer),
  }
}
```

  Update the imports: `import type { Payload, PayloadRequest, Where } from 'payload'` and `import { lexicalText, rankCorpus, type CorpusEntry, type RecordName } from './twin-corpus'`.

  The fake payload honours `"equals":"public"` anywhere in `where`. The real `loadCompanies(payload)` call without `where` returns all tiers, which is intended.

- [ ] **Step 5:** Run `bun run --cwd apps/payload test:int -- twin`. Expected: PASS. Then run `bun run --cwd apps/payload check-types`. Expected: errors only in `src/seed/*`.
- [ ] **Step 6: Commit.**
  - `git add apps/payload/src/mcp/twin-corpus.ts apps/payload/src/mcp/twin-tools.ts apps/payload/tests/int/twin-corpus.int.spec.ts apps/payload/tests/int/twin-tools.int.spec.ts`
  - `git commit -m "feat(cms): the twin names companies from the collection and caps rows by their company's tier" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 6: Seed — companies and record links

**Files:** Modify `apps/payload/src/seed/lexical.ts`, `apps/payload/src/seed/data.ts`, `apps/payload/src/seed/run.ts`. Test: `apps/payload/tests/int/seed-data.int.spec.ts`.

- [ ] **Step 1: Update the seed test first.** In `apps/payload/tests/int/seed-data.int.spec.ts`:
  - Import `companies` and `richText` (from `@/seed/lexical`).
  - Bios are now `Segment[][]`: change the parallel-bios test to `new Set(disciplines.map((d) => d.bio.length))`.
  - Change the curious test to `JSON.stringify(richText(d.bio))`.
  - Add:

```ts
  it('references only seeded companies and projects', () => {
    const companyNames = new Set(companies.map((c) => c.name))
    const projectNames = new Set(projects.map((p) => p.name))
    expect(companyNames.size).toBe(companies.length)
    for (const e of experiences) expect(companyNames.has(e.company)).toBe(true)
    for (const p of projects) if (p.company) expect(companyNames.has(p.company)).toBe(true)
    for (const d of disciplines) {
      for (const segment of d.bio.flat()) {
        if (typeof segment === 'object' && 'record' in segment) {
          expect((segment.record === 'companies' ? companyNames : projectNames).has(segment.name)).toBe(true)
        }
      }
    }
  })
  it('turns record links into recordLink blocks when resolved and plain text otherwise', () => {
    const json = JSON.stringify(richText([[company('Autodoc'), ' / ', project('Nowhere')]], (to, name) => (to === 'companies' && name === 'Autodoc' ? 4 : undefined)))
    expect(json).toContain('"blockType":"recordLink","record":{"relationTo":"companies","value":4}')
    expect(json).toContain('"text":"Nowhere"')
  })
```

  (Import `company` and `project` from `@/seed/lexical` too.)

- [ ] **Step 2:** Run `bun run --cwd apps/payload test:int -- seed-data`. Expected: FAIL.
- [ ] **Step 3: Implement `lexical.ts`.** Replace the `Segment` type, add the helpers, and give `richText` a resolver:

```ts
export type RecordCollection = 'companies' | 'projects'
export type Segment = string | { bold: string } | { chip: string; label: string; url?: string } | { curious: string } | { record: RecordCollection; name: string }
export type ResolveRecord = (relationTo: RecordCollection, name: string) => number | undefined

export const company = (name: string): Segment => ({ record: 'companies', name })
export const project = (name: string): Segment => ({ record: 'projects', name })
```

  `toNode(segment, resolve)` gets a new first branch after the string/bold checks:

```ts
  if ('record' in segment) {
    const id = resolve(segment.record, segment.name)
    return id === undefined ? text(segment.name, 0) : inline({ blockType: 'recordLink', record: { relationTo: segment.record, value: id } })
  }
```

  Then `export function richText(paragraphs: Segment[][], resolve: ResolveRecord = () => undefined)` passes `resolve` through: `segments.map((s) => toNode(s, resolve))`.

- [ ] **Step 4: Implement `data.ts`.**
  - Import `company` and `project` from `./lexical` and `type Segment`.
  - Add `export interface CompanySeed { name: string; chip: string; url?: string }` and:

```ts
export const companies: CompanySeed[] = [
  { name: 'Autodoc', chip: 'A', url: 'https://autodoc.com.br' },
  { name: 'Nexo Labs', chip: 'N' },
  { name: 'Meridiano', chip: 'M' },
  { name: 'Kyte', chip: 'K' },
  { name: 'UFMG', chip: 'U' },
  { name: 'DER-MG', chip: 'D' },
]
```

  - `ExperienceSeed` drops `chip`: `{ company: string; title: string; startYear: number; endYear?: number; disciplines: string[]; order: number }`. Remove every `chip: 'X',` from the experience rows.
  - `ProjectSeed` gains `company?: string`.
  - Each discipline seed's `bio` changes from `richText([...])` to the bare `Segment[][]` array, and its interface field becomes `bio: Segment[][]`.
  - In the bios, replace these calls:
    - `chip('Autodoc', 'A', 'https://autodoc.com.br')` → `company('Autodoc')`
    - `chip('Nexo Labs', 'N')` → `company('Nexo Labs')`
    - `chip('Meridiano', 'M')` → `company('Meridiano')`
    - `chip('DER-MG', 'D')` → `company('DER-MG')`
    - `chip('Pipeline Zero', 'P')`, `chip('Sonda', 'S')`, `chip('Retriever', 'R')`, `chip('Vozes', 'V')`, `chip('Ponte Viva', 'P')`, `chip('Concreto', 'C')` → `project('<same name>')`
  - Keep `chip('Ted Lasso', 'TL')`.
  - Remove `richText` from the import if it is now unused.

- [ ] **Step 5: Implement `run.ts`.** Replace the discipline/experience/project section:

```ts
import { richText, type RecordCollection } from './lexical'

const companyIds = new Map<string, number>()
for (const c of seed.companies) {
  companyIds.set(c.name, await upsert(payload, 'companies', { name: { equals: c.name } }, c))
}
const projectIds = new Map<string, number>()
const resolve = (relationTo: RecordCollection, name: string) => (relationTo === 'companies' ? companyIds : projectIds).get(name)
const companyId = (name: string) => {
  const id = companyIds.get(name)
  if (id === undefined) throw new Error(`Seed references unknown company "${name}"`)
  return id
}

// Bios link projects and projects belong to disciplines: the first pass writes project links as plain
// text on a fresh DB, the last pass rewrites the bios once every project has an id.
const ids = new Map<string, number>()
for (const d of seed.disciplines) {
  ids.set(d.slug, await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, { ...d, bio: richText(d.bio, resolve) }))
}
const rel = /* unchanged */

for (const e of seed.experiences) {
  const company = companyId(e.company)
  await upsert(payload, 'experiences', { and: [{ company: { equals: company } }, { title: { equals: e.title } }] }, { ...e, company, disciplines: rel(e.disciplines) })
}
for (const p of seed.projects) {
  const data = { ...p, company: p.company ? companyId(p.company) : undefined, disciplines: rel(p.disciplines) }
  projectIds.set(p.name, await upsert(payload, 'projects', { name: { equals: p.name } }, data))
}
for (const d of seed.disciplines) {
  await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, { bio: richText(d.bio, resolve) })
}
```

  Keep `rel` exactly as it was. The globals section stays unchanged.

- [ ] **Step 6:** Run `bun run --cwd apps/payload test:int` and `bun run --cwd apps/payload check-types`. Expected: all PASS, with zero type errors. Do NOT run the seed.
- [ ] **Step 7: Commit.**
  - `git add apps/payload/src/seed apps/payload/tests/int/seed-data.int.spec.ts`
  - `git commit -m "feat(cms): seed companies and link them and projects from the bios" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 7: Migration that carries the owner's data, and the favicon refresh script

**Files:**
- Create `apps/payload/src/migrations/<timestamp>_companies.ts` and `.json` (generated, then the `.ts` is hand-edited).
- Modify `apps/payload/src/migrations/index.ts` (generated).
- Create `apps/payload/src/scripts/refresh-favicons.ts`.
- Modify `apps/payload/package.json`.

**Context:** production runs `prodMigrations`, while the owner's dev DB (and the worktree copy) is push-mode: `payload_migrations` holds only `{ name: 'dev', batch: -1 }`. So the migration must work in two ways:
- (a) through `payload migrate` on a DB built from the earlier migrations;
- (b) by calling its `up` directly on a push-mode DB.

The `up` and `down` functions must therefore use **only `db`** (no `payload`, no `req`).

The DB copy holds:
- 12 experiences across Autodoc, Nexo Labs, Meridiano, Kyte, UFMG and DER-MG, all with `url = null`;
- 9 projects with `url = null`;
- 3 disciplines whose `bio` JSON has `chipLink` inline blocks. Autodoc's carries `url: 'https://autodoc.com.br'`.

- [ ] **Step 1: Generate.** Run `bun run --cwd apps/payload payload migrate:create companies`. It diffs the config against `20261005_171116_profile_presence.json` and does not push. Read the generated `.ts` in full. Expect:
  - `CREATE TABLE companies` and `CREATE TABLE favicons` with their indexes;
  - `ALTER TABLE projects ADD logo_id / favicon_id / company_id`;
  - an `experiences` table rebuild (`__new_experiences` … `INSERT INTO … SELECT … FROM experiences`);
  - `payload_locked_documents_rels` gaining `companies_id` and `favicons_id`.
- [ ] **Step 2: Hand-edit `up`.** Keep the generated statements, with these changes:
  1. Order: create `companies` (and its indexes) and `favicons` first.
  2. Right after creating `companies`, insert the companies with a TS block that uses `db.all`/`db.run` with `sql`:

```ts
  type Row = Record<string, unknown>
  const experiences = (await db.all(sql`SELECT "company", "chip", "url", "disclosure" FROM "experiences" ORDER BY "order", "id"`)) as Row[]
  const disciplines = (await db.all(sql`SELECT "id", "bio" FROM "disciplines"`)) as Row[]
  const bioChips = new Map<string, { chip: string; url: string | null }>()
  const walk = (node: unknown, visit: (n: Row) => void) => {
    if (!node || typeof node !== 'object') return
    visit(node as Row)
    for (const child of ((node as Row).children as unknown[] | undefined) ?? []) walk(child, visit)
  }
  for (const d of disciplines) {
    walk(JSON.parse(String(d.bio)).root, (n) => {
      const f = n.fields as Row | undefined
      if (n.type === 'inlineBlock' && f?.blockType === 'chipLink' && typeof f.label === 'string' && !bioChips.has(f.label)) {
        bioChips.set(f.label, { chip: String(f.chip ?? ''), url: typeof f.url === 'string' && f.url ? f.url : null })
      }
    })
  }
  // One company per distinct name: the chip and url of its first row by order, the url falling back to
  // the bio's chip link; its tier is the most visible tier among its experiences.
  const TIERS = ['public', 'restricted', 'never']
  const companies = new Map<string, { chip: string; url: string | null; tier: number }>()
  for (const e of experiences) {
    const name = String(e.company)
    const tier = Math.max(0, TIERS.indexOf(String(e.disclosure)))
    const known = companies.get(name)
    if (known) {
      known.url ??= (e.url as string | null) ?? null
      known.tier = Math.min(known.tier, tier)
    } else {
      companies.set(name, { chip: String(e.chip), url: (e.url as string | null) ?? null, tier })
    }
  }
  for (const [name, c] of companies) {
    const url = c.url ?? bioChips.get(name)?.url ?? null
    await db.run(sql`INSERT INTO "companies" ("name", "chip", "url", "disclosure") VALUES (${name}, ${c.chip}, ${url}, ${TIERS[c.tier]})`)
  }
```

  3. In the `experiences` rebuild, make `company_id` `integer NOT NULL` with its FK to `companies` (as generated). Make the `INSERT … SELECT` fill it with `(SELECT "id" FROM "companies" WHERE "companies"."name" = "experiences"."company")`. Leave out `company`, `chip` and `url`. Keep `PRAGMA foreign_keys=OFF/ON` around the rebuild exactly as the generator does.
  4. At the end, rewrite the bios:

```ts
  const ids = async (table: 'companies' | 'projects') =>
    new Map(((await db.all(sql.raw(`SELECT "id", "name" FROM "${table}"`))) as Row[]).map((r) => [String(r.name), Number(r.id)]))
  const companyIds = await ids('companies')
  const projectIds = await ids('projects')
  for (const d of disciplines) {
    const bio = JSON.parse(String(d.bio))
    walk(bio.root, (n) => {
      const f = n.fields as Row | undefined
      if (n.type !== 'inlineBlock' || f?.blockType !== 'chipLink' || typeof f.label !== 'string') return
      const companyId = companyIds.get(f.label)
      const projectId = companyId === undefined ? projectIds.get(f.label) : undefined
      if (companyId === undefined && projectId === undefined) return
      n.fields = { id: f.id, blockName: f.blockName ?? '', blockType: 'recordLink', record: companyId !== undefined ? { relationTo: 'companies', value: companyId } : { relationTo: 'projects', value: projectId } }
    })
    await db.run(sql`UPDATE "disciplines" SET "bio" = ${JSON.stringify(bio)} WHERE "id" = ${d.id}`)
  }
```

  Change the generated signature to `export async function up({ db }: MigrateUpArgs)` (and the same for `down`), so neither function needs `payload` or `req`.

- [ ] **Step 3: Hand-edit `down`.** Keep the generated reverse statements, but do this before dropping `companies`:
  - (a) Rewrite the bios back. Each `recordLink` becomes `{ id, blockName, blockType: 'chipLink', label: name, chip, url }`, read from `companies` or `projects` by id.
  - (b) Make the generated `experiences` rebuild fill `company`, `chip` and `url` with subqueries on `companies` by `company_id`. The `url` uses the company's url.

  Use the same `walk` helper (duplicate it inside `down`; a migration file is self-contained).
- [ ] **Step 4: Verify the prod path on an empty DB.** Run each command separately. In PowerShell, set `$env:DATABASE_URL = 'file:./tmp-migrate.db'` in the same command line.
  - `bun run --cwd apps/payload payload migrate`
  - `bun run --cwd apps/payload payload migrate:down`
  - `bun run --cwd apps/payload payload migrate`

  Expected: all three succeed. Delete `apps/payload/tmp-migrate.db*` afterwards.
- [ ] **Step 5: Verify the data path on the DB copy.**
  1. Back up the worktree copy: `Copy-Item apps/payload/payload.db apps/payload/payload.db.pre-companies-<yyyyMMddHHmmss>.bak`.
  2. Create a throwaway script `apps/payload/apply-companies.tmp.ts`. It imports `{ up, down }` from the migration, opens the DB with `drizzle(createClient({ url: 'file:./payload.db' }))` (`drizzle-orm/libsql`, `@libsql/client`, both resolvable from `apps/payload` via `@payloadcms/db-sqlite`), and calls `up({ db } as never)` or `down(...)` depending on `process.argv[2]`.
  3. Run `bun apps/payload/apply-companies.tmp.ts up` from `apps/payload`.
  4. Then check with `bun -e` and `bun:sqlite`:
     - `companies` has 6 rows, and Autodoc's url is `https://autodoc.com.br`.
     - Every `experiences.company_id` is non-null and points at the right name. Expect 3 for Autodoc, etc.
     - Every discipline bio has `recordLink` blocks for Autodoc, Nexo Labs, Meridiano, DER-MG and the six projects, and still has a `chipLink` for Ted Lasso.
  5. Run `down`, check the experience columns and the `chipLink`s are back, run `up` again, and check again.
  6. Last check: start the CMS on port 3101 from the worktree: `$env:PORT=3101` then `bun run --cwd apps/payload dev` in the background, or `next dev --port 3101` directly. The dev push must report **no** schema changes and must not prompt. Stop the server.
  7. Keep `apply-companies.tmp.ts` uncommitted: the controller reuses it for the owner's DB.
- [ ] **Step 6: Refresh script.** Create `apps/payload/src/scripts/refresh-favicons.ts`:

```ts
import configPromise from '@payload-config'
import { getPayload } from 'payload'

/** Re-fetches the favicon of every company and project with a URL (backfill after the companies migration, or a refresh). */
const payload = await getPayload({ config: configPromise })
for (const collection of ['companies', 'projects'] as const) {
  const { docs } = await payload.find({ collection, where: { url: { exists: true } }, limit: 1000, depth: 0, pagination: false, overrideAccess: true })
  for (const doc of docs) {
    if (!doc.url) continue
    const saved = await payload.update({ collection, id: doc.id, data: {}, context: { refreshFavicon: true }, overrideAccess: true })
    payload.logger.info(`${collection}/${doc.id} ${doc.url}: ${saved.favicon ? 'favicon stored' : 'no favicon found'}`)
  }
}
process.exit(0)
```

  In `apps/payload/package.json` scripts, add `"favicons:refresh": "cross-env NODE_OPTIONS=--no-deprecation payload run src/scripts/refresh-favicons.ts",`.

  Then run it against the worktree copy: `bun run --cwd apps/payload favicons:refresh`. Expected: `companies/<autodoc id> https://autodoc.com.br: favicon stored`. If no favicon is stored for autodoc.com.br, debug `discoverFavicon` against the live site; don't accept "no favicon" without a reason. Check that the file exists under `apps/payload/public/favicons/`. If Payload rejects the `.ico` upload, fix it at the cause (collection upload options) and report it.

  Note: `payload run` boots Payload in dev mode, which pushes the schema. That is safe now that the copy matches.
- [ ] **Step 7:** Run `bun run --cwd apps/payload test:int` and `bun run --cwd apps/payload check-types`. Expected: PASS.
- [ ] **Step 8: Commit** (not the `.tmp.ts`, the `.bak` or the DB).
  - `git add apps/payload/src/migrations apps/payload/src/scripts/refresh-favicons.ts apps/payload/package.json`
  - `git commit -m "feat(cms): companies migration carries experiences and bio chip links over; favicons:refresh backfills icons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 8: Web — chip icon slot

**Files:**
- Modify `apps/web/shared/ui/chip-markup.ts`, `apps/web/shared/ui/ChipLink.tsx`, `apps/web/styles/base.css`, `apps/web/features/os/os.css` and `apps/web/features/sections/EntryList.tsx`.
- Tests: `apps/web/tests/unit/ui/chip-markup.test.ts` and `apps/web/tests/unit/os/bio-markup.test.ts`.

- [ ] **Step 1: Failing tests.** In `apps/web/tests/unit/ui/chip-markup.test.ts`, convert the existing `chipLinkHtml(label, chip, url)` calls to `chipLinkHtml({ label, chip, href: url })` and add:

```ts
  it('renders the icon image in the chip slot when one is given', () => {
    const html = chipLinkHtml({ label: 'Autodoc', chip: 'A', href: 'https://autodoc.com.br', icon: 'http://cms.test/api/favicons/file/autodoc-favicon.ico' })
    expect(html).toBe(
      '<a class="fav" href="https://autodoc.com.br" target="_blank" rel="noopener noreferrer">' +
        '<img class="chip chip-img" src="http://cms.test/api/favicons/file/autodoc-favicon.ico" alt="" aria-hidden="true" loading="lazy" decoding="async"><span>Autodoc</span></a>',
    )
  })
  it('ignores non-http icons and falls back to the chip', () => {
    expect(chipLinkHtml({ label: 'x', chip: 'X', icon: 'javascript:alert(1)' })).toContain('<i class="chip" aria-hidden="true">X</i>')
  })
```

  Also convert the call in `apps/web/tests/unit/os/bio-markup.test.ts`.
- [ ] **Step 2:** Run `bun run --cwd apps/web test -- chip-markup`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `apps/web/shared/ui/chip-markup.ts`:

```ts
export const CHIP_IMG_CLASS = 'chip-img'

/** A chip link's content: label, text chip, and optionally a link and an icon image (logo or favicon). */
export interface ChipLinkProps {
  label: string
  chip: string
  href?: string | null
  icon?: string
}

/** Only http(s) image URLs reach `src`; anything else falls back to the text chip. */
export const safeIcon = (icon: string | undefined): string | undefined => (icon && isExternal(icon) ? icon : undefined)

export function chipLinkHtml({ label, chip, href: url, icon }: ChipLinkProps): string {
  const href = safeHref(url)
  const attrs = href
    ? ` href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`
    : ''
  const src = safeIcon(icon)
  const mark = src
    ? `<img class="${CHIP_CLASS} ${CHIP_IMG_CLASS}" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`
    : `<i class="${CHIP_CLASS}" aria-hidden="true">${escapeHtml(chip)}</i>`
  return `<a class="${CHIP_LINK_CLASS}"${attrs}>${mark}<span>${escapeHtml(label)}</span></a>`
}
```

  Make sure `isExternal` is declared before `safeIcon` (it already sits above `chipLinkHtml`). In `apps/web/shared/ui/ChipLink.tsx`:

```tsx
import { CHIP_CLASS, CHIP_IMG_CLASS, CHIP_LINK_CLASS, isExternal, safeIcon, type ChipLinkProps } from './chip-markup'

/** The React twin of `chipLinkHtml`: same classes and attributes, so there is one visual source. */
export function ChipLink({ chip, label, href, icon }: ChipLinkProps) {
  const link = href ?? undefined
  const external = link ? isExternal(link) : false
  const src = safeIcon(icon)
  return (
    <a className={CHIP_LINK_CLASS} href={link} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {src ? (
        <img className={`${CHIP_CLASS} ${CHIP_IMG_CLASS}`} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      ) : (
        <i className={CHIP_CLASS} aria-hidden="true">{chip}</i>
      )}
      <span>{label}</span>
    </a>
  )
}
```

  In `apps/web/features/sections/EntryList.tsx`, pass `icon={row.icon}` to `ChipLink`. TS will complain until Task 9 adds `Entry.icon`, so add `icon?: string` to `Entry` in `apps/web/lib/cms/types.ts` now, with the doc comment `/** Logo or favicon URL; the chip shows when absent. */`.
- [ ] **Step 4: CSS.** In `apps/web/styles/base.css`, after the `.chip { … }` rule, add:

```css
/* A logo or favicon in the chip slot: same box as the text chip, no tile behind it. */
.chip-img {
  object-fit: contain;
  background: none;
}
```

  Read `apps/web/features/os/os.css` around its `.chip` rule (line ~48) and add the same `.chip-img` rule after it.
- [ ] **Step 5:** Run `bun run --cwd apps/web test` and `bun run --cwd apps/web check-types`. Expected: the chip tests PASS. `bio-html.ts` still calls the old signature, so update its call now to `chipLinkHtml({ label: str(fields.label), chip: str(fields.chip), href: str(fields.url) || null })`. All PASS, zero type errors.
- [ ] **Step 6: Commit.**
  - `git add apps/web/shared/ui apps/web/styles/base.css apps/web/features/os/os.css apps/web/features/sections/EntryList.tsx apps/web/lib/cms/types.ts apps/web/lib/cms/bio-html.ts apps/web/tests/unit/ui/chip-markup.test.ts apps/web/tests/unit/os/bio-markup.test.ts`
  - `git commit -m "feat(web): chip links show a logo or favicon image in the chip slot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 9: Web — resolve companies and projects through one lookup

**Files:**
- Create `apps/web/lib/cms/records.ts`.
- Modify `apps/web/lib/cms/bio-html.ts`, `apps/web/lib/cms/mappers.ts` and `apps/web/lib/cms/queries.ts`.
- Tests: `apps/web/tests/unit/cms/bio-html.test.ts` and `apps/web/tests/unit/cms/mappers.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `apps/web/tests/unit/cms/bio-html.test.ts` (import `type Records` from `@/lib/cms/records`):

```ts
  it('renders record links from the lookup and drops unresolved ones', () => {
    const records: Records = new Map([['companies:3', { label: 'Autodoc', chip: 'A', href: 'https://autodoc.com.br', icon: 'http://cms.test/f.ico' }]])
    const link = (relationTo: string, value: unknown) => inline({ blockType: 'recordLink', record: { relationTo, value } })
    const [html] = bioParagraphs(doc(p(t('At '), link('companies', 3), t(' and '), link('projects', 9), t('.'))), records)
    expect(html).toBe('At <a class="fav" href="https://autodoc.com.br" target="_blank" rel="noopener noreferrer"><img class="chip chip-img" src="http://cms.test/f.ico" alt="" aria-hidden="true" loading="lazy" decoding="async"><span>Autodoc</span></a> and .')
    const [populated] = bioParagraphs(doc(p(link('companies', { id: 3, name: 'Autodoc' }))), records)
    expect(populated).toContain('<span>Autodoc</span>')
  })
```

  In `apps/web/tests/unit/cms/mappers.test.ts`, replace the experience and project tests and add the following. Import `brandIcon` and `toRecords` from mappers, and `type Records` from records:

```ts
const media = (url: string) => ({ id: 1, url, alt: '' })
const autodoc = { id: 3, name: 'Autodoc', chip: 'A', url: 'https://autodoc.com.br', logo: null, favicon: { id: 5, url: '/api/favicons/file/a.ico' }, disclosure: 'public' } as unknown as Company

describe('brand icons', () => {
  it('prefers the logo, then the favicon, else none', () => {
    expect(brandIcon({ logo: media('/api/media/file/logo.png'), favicon: { id: 5, url: '/f.ico' } } as never, BASE)).toBe('http://cms.test/api/media/file/logo.png')
    expect(brandIcon({ logo: null, favicon: { id: 5, url: '/f.ico' } } as never, BASE)).toBe('http://cms.test/f.ico')
    expect(brandIcon({ logo: null, favicon: null } as never, BASE)).toBeUndefined()
  })
})

describe('entries through the record lookup', () => {
  const records: Records = toRecords([autodoc], [], BASE)
  it('maps an experience from its company', () => {
    const e = { id: 7, company: 3, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [discipline], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e, records)).toEqual({ id: '7', chip: 'A', label: 'Autodoc', href: 'https://autodoc.com.br', icon: 'http://cms.test/api/favicons/file/a.ico', meta: 'Senior SE', aside: '2023–', disciplines: ['se'] })
  })
  it('drops an experience whose company the site cannot read', () => {
    const e = { id: 8, company: 99, title: 'x', startYear: 2020, endYear: null, disciplines: [], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e, records)).toBeUndefined()
  })
  it('maps a project with its own icon and its company as the aside', () => {
    const p = { id: 3, name: 'Sonda', chip: 'S', url: 'https://x.dev', logo: media('/l.png'), favicon: null, summary: 'Sampler', company: { id: 3 }, disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p, records, BASE)).toEqual({ id: '3', chip: 'S', label: 'Sonda', href: 'https://x.dev', icon: 'http://cms.test/l.png', meta: 'Sampler', aside: 'Autodoc', disciplines: [] })
  })
})
```

  Add `Company` to the `@repo/cms-types` import. Delete the two old `maps an experience…` / `maps a project` tests in the first `describe`. In `snapshot()`, add `companies: [],`. Any existing `toPortfolio` test that passes experiences must also pass matching `companies`; update those fixtures accordingly.
- [ ] **Step 2:** Run `bun run --cwd apps/web test -- cms`. Expected: FAIL.
- [ ] **Step 3: `records.ts`.** Create `apps/web/lib/cms/records.ts`:

```ts
/** A company or project as a reference renders it: what a chip link needs. */
export interface Brand {
  label: string
  chip: string
  href?: string
  icon?: string
}

/** Every readable (public) company and project, keyed `relationTo:id`. */
export type Records = ReadonlyMap<string, Brand>

/** A relationship value's id, populated or not. */
const idOf = (ref: unknown): string | undefined => {
  if (typeof ref === 'number' || typeof ref === 'string') return String(ref)
  if (ref && typeof ref === 'object' && 'id' in ref) return idOf((ref as { id: unknown }).id)
  return undefined
}

/** The record a reference points at, or undefined when the site cannot read it. */
export function findRecord(records: Records, relationTo: string, ref: unknown): Brand | undefined {
  const id = idOf(ref)
  return id === undefined ? undefined : records.get(`${relationTo}:${id}`)
}
```

- [ ] **Step 4: `bio-html.ts`.** Import `{ findRecord, type Records }`. Thread `records` through `node` and `inlineBlock`:
  - `function inlineBlock(fields: Record<string, unknown> = {}, records: Records): string`
  - `function node(n: LexicalNode, records: Records): string`, recursing with `records`
  - `export function bioParagraphs(value: RichTextValue | null | undefined, records: Records = new Map()): string[]`

  Add the case:

```ts
    case 'recordLink': {
      const ref = (fields.record ?? {}) as { relationTo?: unknown; value?: unknown }
      const brand = typeof ref.relationTo === 'string' ? findRecord(records, ref.relationTo, ref.value) : undefined
      // A record the site cannot read (not public, or deleted) leaves no link behind.
      return brand ? chipLinkHtml(brand) : ''
    }
```

- [ ] **Step 5: `mappers.ts`.**
  - Import `Company` and `Favicon` types, and `{ findRecord, type Brand, type Records } from './records'`.
  - Widen `Upload` to `type Upload = number | { url?: string | null } | null | undefined` (Media and Favicon both fit).
  - Add the brand helpers and the new entry mappers:

```ts
type BrandDoc = Pick<Company, 'name' | 'chip' | 'url' | 'logo' | 'favicon'>

/** The icon beside a company or project: its uploaded logo, else its fetched favicon. The chip shows otherwise. */
export const brandIcon = (doc: Pick<Company, 'logo' | 'favicon'>, base: string): string | undefined =>
  mediaUrl(doc.logo, base) ?? mediaUrl(doc.favicon, base)

export const toBrand = (doc: BrandDoc, base: string): Brand => ({
  label: doc.name,
  chip: doc.chip,
  href: safeHref(doc.url),
  icon: brandIcon(doc, base),
})

/** The lookup every reference (experience → company, project → company, bio → record) resolves through. */
export const toRecords = (companies: Company[], projects: Project[], base: string): Records =>
  new Map([
    ...companies.map((c) => [`companies:${c.id}`, toBrand(c, base)] as const),
    ...projects.map((p) => [`projects:${p.id}`, toBrand(p, base)] as const),
  ])

export const toDiscipline = (d: CmsDiscipline, records: Records = new Map()): Discipline => ({
  slug: d.slug,
  title: d.title,
  level: d.level,
  caption: d.figureCaption,
  bio: bioParagraphs(d.bio, records),
  notes: (d.curiousNotes ?? []).map((n) => ({ side: n.side, text: n.text, ...(n.formula ? { formula: n.formula } : {}) })),
})

/** A Work row from its company; undefined when the site cannot read that company (it is not public). */
export const toExperienceEntry = (e: Experience, records: Records): Entry | undefined => {
  const company = findRecord(records, 'companies', e.company)
  if (!company) return undefined
  return {
    id: String(e.id),
    chip: company.chip,
    label: company.label,
    href: company.href,
    icon: company.icon,
    meta: e.title,
    aside: formatPeriod(e.startYear, e.endYear),
    disciplines: slugsOf(e.disciplines),
  }
}

export const toProjectEntry = (p: Project, records: Records, base: string): Entry => {
  const brand = toBrand(p, base)
  const company = p.company ? findRecord(records, 'companies', p.company) : undefined
  return {
    id: String(p.id),
    chip: brand.chip,
    label: brand.label,
    href: brand.href,
    icon: brand.icon,
    meta: p.summary,
    ...(company ? { aside: company.label } : {}),
    disciplines: slugsOf(p.disciplines),
  }
}
```

  Then update the snapshot and `toPortfolio`:
  - `CmsSnapshot` gains `companies: Company[]`.
  - In `toPortfolio`: `const records = toRecords(snap.companies, snap.projects, base)`, `const disciplines = snap.disciplines.map((d) => toDiscipline(d, records))`, `work: snap.experiences.flatMap((e) => toExperienceEntry(e, records) ?? [])` and `projects: snap.projects.map((p) => toProjectEntry(p, records, base))`.
  - Remove the unused `Favicon` import if the types compile without it.

- [ ] **Step 6: `queries.ts`.** Give `cmsList` a sort parameter: ``const cmsList = <T>(slug: string, sort = 'order') => cmsGet<List<T>>(`/api/${slug}?sort=${sort}&limit=100&depth=1`).then((r) => r.docs)``. Add `Company` to the type import, fetch `cmsList<Company>('companies', 'name')` in the `Promise.all`, and pass `companies` into `toPortfolio`.
- [ ] **Step 7:** Run `bun run --cwd apps/web test` and `bun run --cwd apps/web check-types`. Expected: PASS, with zero errors. Fix every other caller of `toDiscipline`, `toExperienceEntry` and `toProjectEntry` that the type check reports (grep `apps/web` for them).
- [ ] **Step 8: Commit.**
  - `git add apps/web/lib/cms apps/web/tests/unit/cms`
  - `git commit -m "feat(web): experiences, projects and bio links resolve companies and projects through one lookup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 10 (controller): real-browser E2E in the worktree, then rollout

Done by the controller, not a subagent.

1. Start the CMS from the worktree on 3101 against the migrated copy, and the web app on 3100 with `CMS_URL=http://localhost:3101`. Also check the CMS `WEB_URL`/CORS for 3100.
2. Upload a logo for one company (Nexo Labs) in the admin, through the Local API.
3. Run a Playwright script from `apps/web` against `http://localhost:3100`, covering the fresh visit and a role switch:
   - The Autodoc Work row and the bio link show `img.chip-img` with a favicon `src` that loads (`naturalWidth > 0`).
   - Nexo Labs shows its logo.
   - Kyte shows a text chip.
   - The bio still morphs on a role switch.
   - There are no console errors and no 4xx/5xx responses.
4. Take screenshots and read them.
5. Revert the test logo.
6. Full gates: `bun run --cwd apps/payload test:int`, `bun run --cwd apps/payload check-types`, `bun run --cwd apps/web test`, `bun run --cwd apps/web check-types`.
7. Roll out to the owner's DB (spec, "Rollout"): back up the main checkout's `apps/payload/payload.db` with a timestamp, apply `up` with the tmp script pointed at it, fast-forward `feat/portfolio-twin-agent`, then run `favicons:refresh` in the main checkout. Ask the owner before touching their DB or branch.
