# Portfolio Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the portfolio in `apps/web` from scratch with the template's UI/UX/motion, fed by a portfolio-specific Payload CMS (`apps/payload`) that is also exposed over MCP.

**Architecture:** `apps/payload` (package `cms`, port 3001) is a headless Payload 3 + SQLite CMS: collections for disciplines, experiences, projects, content; globals for profile, contact, navigation, site settings; MCP plugin. Types are generated into `packages/cms-types`. `apps/web` (Next 16, port 3000) fetches the CMS over REST in server components (tag `cms`, revalidated by a Payload hook), maps documents into view models, and renders client features (role drum + picker, word morph, wall switch, blowout, curious mode, Spline figure) that share state through small React contexts — no event bus.

**Tech Stack:** Bun 1.3 workspaces, Turborepo 2.11, Next 16.3, React 19.2, TypeScript 7, CSS Modules, Payload 3.90 (SQLite, Lexical, plugin-mcp), Vitest 4, Playwright, `@splinetool/runtime` 2 (used directly, not through `@splinetool/react-spline`; see spec §6.8).

**Spec:** `docs/superpowers/specs/2026-09-29-portfolio-rewrite-design.md` — read it first. QA findings Q1–Q6 are referenced below.

**Reference (behaviour source of truth, never copy files):** `docs/template-portfolio/reference/parts/*.js`, `docs/template-portfolio/app/globals.css`, `docs/template-portfolio/CONTEXT.md`.

---

## Conventions for every task

- Package manager is **bun**. Run workspace scripts with `bun run --cwd <dir> <script>` from repo root `D:/Second Brain/01.PROJETOS/applications/my-portfolio`.
- Web imports use the alias `@/` → `apps/web/` (configured in Task 9).
- No `any`, no `@ts-nocheck`, no side effects inside React state updaters, no default exports except Next.js file conventions (`page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, configs).
- One responsibility per file. If a file passes ~150 lines, split it.
- Commit after each task with a conventional message ending in:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Ports: web dev **3000** in `package.json`, but for verification during implementation run web on **3100** (`bun run --cwd apps/web dev -- --port 3100`) because the user's template dev server occupies 3000. CMS on **3001**.

## File map

```
packages/cms-types/            package.json, src/index.ts, src/payload-types.ts (generated)
apps/payload/                  package "cms"
  src/payload.config.ts
  src/access/{public-read,authenticated}.ts
  src/fields/{chip,order,disciplines-relation,link-url}.ts
  src/hooks/revalidate-web.ts
  src/blocks/{chip-link,curious-toggle}.ts
  src/editor/bio-editor.ts
  src/collections/{Users,Media,Disciplines,Experiences,Projects,Content}.ts
  src/globals/{Profile,Contact,Navigation,SiteSettings}.ts
  src/mcp/mcp-plugin.ts
  src/types/payload-augment.d.ts
  src/seed/{lexical,data,run,upsert}.ts
  tests/int/seed-data.int.spec.ts
apps/web/
  app/{layout,page,error}.tsx, app/globals.css, app/api/revalidate/route.ts
  styles/{tokens,base}.css
  lib/cms/{client,queries,mappers,bio-html,types}.ts
  lib/audio/{context,click,bulb,thud,poof}.ts
  lib/dom/{page-rect,use-reduced-motion}.ts
  lib/format/period.ts
  shared/ui/{chip-markup.ts,ChipLink.tsx,Section.tsx,Section.module.css}
  features/role/{role-cycle.ts,role-state.ts,RoleProvider.tsx,use-role-persistence.ts,RoleDrum.tsx,RoleDrum.module.css,RolePicker.tsx,RolePicker.module.css,use-wheel-step.ts,RoleHeadline.tsx}
  features/bio/{morph/tokenize.ts,morph/lcs.ts,morph/render.ts,use-word-morph.ts,Bio.tsx,Bio.module.css}
  features/theme/{theme-dom.ts,use-theme.ts,ThemeScript.tsx,rocker-atlas.ts,use-rocker.ts,WallSwitch.tsx,WallSwitch.module.css}
  features/blowout/{physics.ts,click-window.ts,sequence.ts,use-blowout.ts,blowout.css}
  features/curious/{CuriousProvider.tsx,guides.ts,CuriousOverlay.tsx,CuriousOverlay.module.css,use-layout-signal.ts}
  features/figure/{Figure.tsx,SplineScene.tsx,Figure.module.css}
  features/sections/{EntryList.tsx,EntryList.module.css,ContactLinks.tsx,FooterNav.tsx}
  features/portfolio/Portfolio.tsx
  tests/unit/**.test.ts, tests/e2e/**.spec.ts
  vitest.config.ts, playwright.config.ts
```

---

# Phase A — CMS

### Task 1: Workspace hygiene and shared types package

**Files:**
- Modify: `apps/payload/package.json`
- Delete: `apps/payload/pnpm-workspace.yaml`, `apps/payload/.npmrc`
- Modify: `apps/payload/.env`, `apps/payload/.env.example`
- Create: `packages/cms-types/package.json`, `packages/cms-types/src/index.ts`, `packages/cms-types/tsconfig.json`

- [ ] **Step 1: Rename package, fix ports, drop pnpm-only scripts.** In `apps/payload/package.json` set `"name": "cms"`, remove `ii`, `reinstall`, `dev:prod`, `postbuild` scripts and the `engines.pnpm` + `pnpm` keys, and change:

```json
"dev": "cross-env NODE_OPTIONS=--no-deprecation next dev --port 3001",
"start": "cross-env NODE_OPTIONS=--no-deprecation next start --port 3001",
"seed": "cross-env NODE_OPTIONS=--no-deprecation payload run src/seed/run.ts",
"check-types": "tsc --noEmit",
"test": "bun run test:int",
```

Also remove `next-sitemap` from dependencies and delete `next-sitemap.config.cjs`.

- [ ] **Step 2: Delete pnpm files.** `git rm apps/payload/pnpm-workspace.yaml apps/payload/.npmrc`

- [ ] **Step 3: Environment.** Generate a secret with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. In `apps/payload/.env` set `NEXT_PUBLIC_SERVER_URL=http://localhost:3001`, add `WEB_URL=http://localhost:3000` and `REVALIDATE_SECRET=<generated>`; keep the existing `DATABASE_URL=file:...` line and delete the commented postgres line. Mirror the keys (placeholder values) in `.env.example`:

```
DATABASE_URL=file:./payload.db
PAYLOAD_SECRET=YOUR_SECRET_HERE
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
WEB_URL=http://localhost:3000
REVALIDATE_SECRET=YOUR_SHARED_REVALIDATE_SECRET
CRON_SECRET=YOUR_CRON_SECRET_HERE
PREVIEW_SECRET=YOUR_SECRET_HERE
```

- [ ] **Step 4: Create `packages/cms-types`.**

`packages/cms-types/package.json`:
```json
{
  "name": "@repo/cms-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```
`packages/cms-types/src/index.ts`:
```ts
export type * from './payload-types'
```
`packages/cms-types/tsconfig.json`:
```json
{ "extends": "@repo/typescript-config/base.json", "include": ["src"] }
```
Create an empty placeholder `packages/cms-types/src/payload-types.ts` containing `export interface Config {}` (regenerated in Task 7).

- [ ] **Step 5: Install and commit.** Run `bun install` at repo root (expect success). Commit `chore(cms): rename package, move to port 3001, add cms-types package`.

---

### Task 2: Strip the website template down to a headless core

**Files:**
- Delete: `apps/payload/src/app/(frontend)/`, `src/blocks/`, `src/heros/`, `src/Header/`, `src/Footer/`, `src/search/`, `src/providers/`, `src/components/` (all), `src/collections/{Pages,Posts,Categories}*`, `src/endpoints/`, `src/hooks/{populatePublishedAt,revalidateRedirects}.ts`, `src/plugins/`, `src/fields/{link,linkGroup,defaultLexical}.ts`, `src/utilities/` (all except `getURL.ts`), `src/cssVariables.js`, `redirects.ts`, `components.json`, `tailwind.config.mjs`, `postcss.config.js`, `tests/e2e/`, `tests/int/*` (template tests)
- Modify: `apps/payload/src/payload.config.ts`, `apps/payload/next.config.ts`, `apps/payload/src/collections/Users/index.ts` → move to `src/collections/Users.ts`, `src/collections/Media.ts`, `apps/payload/package.json` (dependencies)
- Create: `apps/payload/src/access/public-read.ts`, `apps/payload/src/access/authenticated.ts`

- [ ] **Step 1: Delete template-only code** (list above) with `git rm -r`. Keep `src/app/(payload)/` intact.

- [ ] **Step 2: Access helpers.**

`src/access/authenticated.ts`:
```ts
import type { Access } from 'payload'

export const authenticated: Access = ({ req }) => Boolean(req.user)
```
`src/access/public-read.ts`:
```ts
import type { Access } from 'payload'

export const publicRead: Access = () => true
```
Delete the old `src/access/{anyone,authenticatedOrPublished}.ts` and update `Users`/`Media` imports to these helpers.

- [ ] **Step 3: Minimal `Media`.** Rewrite `src/collections/Media.ts`:
```ts
import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticated } from '../access/authenticated'
import { publicRead } from '../access/public-read'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: publicRead, create: authenticated, update: authenticated, delete: authenticated },
  fields: [{ name: 'alt', type: 'text', required: true }],
  upload: { staticDir: path.resolve(dirname, '../../public/media'), mimeTypes: ['image/*'] },
}
```

- [ ] **Step 4: Minimal config.** Rewrite `src/payload.config.ts` (collections/globals added in Tasks 4–6):
```ts
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Media } from './collections/Media'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: dirname } },
  collections: [Users, Media],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? '' } }),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, '../../../packages/cms-types/src/payload-types.ts'),
    declare: false,
  },
})
```

- [ ] **Step 5: Type augmentation** so the Local API stays typed even though the generated file no longer declares it. Create `src/types/payload-augment.d.ts`:
```ts
import type { Config } from '@repo/cms-types'

declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}
```
Add `"@repo/cms-types": "*"` to `apps/payload/package.json` dependencies.

- [ ] **Step 6: `next.config.ts`** — remove the redirects import and image remote-pattern boilerplate tied to the frontend; keep:
```ts
import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default withPayload(nextConfig, { devBundleServerPackages: false })
```

- [ ] **Step 7: Prune dependencies.** Remove from `apps/payload/package.json`: `@payloadcms/admin-bar`, `@payloadcms/live-preview-react`, `@payloadcms/plugin-form-builder`, `@payloadcms/plugin-nested-docs`, `@payloadcms/plugin-redirects`, `@payloadcms/plugin-search`, `@payloadcms/plugin-seo`, all `@radix-ui/*`, `class-variance-authority`, `clsx`, `geist`, `lucide-react`, `prism-react-renderer`, `react-hook-form`, `tailwind-merge`; devDeps `@tailwindcss/*`, `tailwindcss`, `tw-animate-css`, `autoprefixer`, `postcss`, `@playwright/test`, `@testing-library/react`, `@types/escape-html`. Delete `playwright.config.ts`. Run `bun install`.

- [ ] **Step 8: Stop the running CMS, reset the DB, regenerate import map.** The user's CMS dev server is running on 3001 and locks `payload.db`. Find and stop it: `netstat -ano | grep ':3001 ' | grep LISTEN` → `taskkill //PID <pid> //F`. Then:
```bash
mv apps/payload/payload.db apps/payload/payload.db.bak
bun run --cwd apps/payload generate:importmap
bun run --cwd apps/payload check-types
```
Expected: import map regenerated; type check passes (fix any leftover imports of deleted files).

- [ ] **Step 9: Boot check.** Start `bun run --cwd apps/payload dev` in the background, wait for "Ready", then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/admin` → `200`. Stop the server.

- [ ] **Step 10: Commit** `refactor(cms): strip website template to headless core`.

---

### Task 3: Shared fields, revalidation hook and bio editor

**Files:**
- Create: `apps/payload/src/fields/{chip,order,disciplines-relation,link-url}.ts`, `apps/payload/src/hooks/revalidate-web.ts`, `apps/payload/src/blocks/{chip-link,curious-toggle}.ts`, `apps/payload/src/editor/bio-editor.ts`

- [ ] **Step 1: Field factories (DRY across collections).**

`src/fields/chip.ts`:
```ts
import type { TextField } from 'payload'

export const chipField = (): TextField => ({
  name: 'chip',
  type: 'text',
  required: true,
  maxLength: 3,
  admin: { description: 'Up to 3 characters shown in the 16px favicon chip (e.g. "A", "TL", "gh").' },
})
```
`src/fields/order.ts`:
```ts
import type { NumberField } from 'payload'

export const orderField = (): NumberField => ({
  name: 'order',
  type: 'number',
  required: true,
  defaultValue: 0,
  index: true,
  admin: { position: 'sidebar', description: 'Lower numbers come first.' },
})
```
`src/fields/disciplines-relation.ts`:
```ts
import type { RelationshipField } from 'payload'

export const disciplinesField = (description: string): RelationshipField => ({
  name: 'disciplines',
  type: 'relationship',
  relationTo: 'disciplines',
  hasMany: true,
  admin: { position: 'sidebar', description },
})
```
`src/fields/link-url.ts`:
```ts
import type { TextField } from 'payload'

const ALLOWED = /^(https?:\/\/|mailto:|\/|#)/i

export const urlField = (name = 'url', required = false): TextField => ({
  name,
  type: 'text',
  required,
  validate: (value: string | null | undefined) =>
    !value || ALLOWED.test(value) || 'Use an http(s)://, mailto:, / or # link.',
})
```

- [ ] **Step 2: Revalidation hook.** `src/hooks/revalidate-web.ts`:
```ts
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook, PayloadRequest } from 'payload'

async function notifyWeb(req: PayloadRequest): Promise<void> {
  const { WEB_URL, REVALIDATE_SECRET } = process.env
  if (!WEB_URL || !REVALIDATE_SECRET || req.context.disableRevalidate) return
  try {
    const res = await fetch(`${WEB_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': REVALIDATE_SECRET },
    })
    if (!res.ok) req.payload.logger.warn(`web revalidate responded ${res.status}`)
  } catch (error) {
    req.payload.logger.warn({ err: error }, 'web revalidate failed')
  }
}

export const revalidateAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  await notifyWeb(req)
  return doc
}
export const revalidateAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await notifyWeb(req)
  return doc
}
export const revalidateGlobal: GlobalAfterChangeHook = async ({ doc, req }) => {
  await notifyWeb(req)
  return doc
}
```

- [ ] **Step 3: Inline blocks.** `src/blocks/chip-link.ts`:
```ts
import type { Block } from 'payload'
import { chipField } from '../fields/chip'
import { urlField } from '../fields/link-url'

export const ChipLinkBlock: Block = {
  slug: 'chipLink',
  labels: { singular: 'Chip link', plural: 'Chip links' },
  fields: [{ name: 'label', type: 'text', required: true }, chipField(), urlField()],
}
```
`src/blocks/curious-toggle.ts`:
```ts
import type { Block } from 'payload'

export const CuriousToggleBlock: Block = {
  slug: 'curiousToggle',
  labels: { singular: 'Curious toggle', plural: 'Curious toggles' },
  fields: [{ name: 'word', type: 'text', required: true, defaultValue: 'curious' }],
}
```

- [ ] **Step 4: Bio editor.** `src/editor/bio-editor.ts`:
```ts
import {
  BlocksFeature,
  BoldFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
  ParagraphFeature,
} from '@payloadcms/richtext-lexical'
import { ChipLinkBlock } from '../blocks/chip-link'
import { CuriousToggleBlock } from '../blocks/curious-toggle'

export const bioEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    BlocksFeature({ inlineBlocks: [ChipLinkBlock, CuriousToggleBlock] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})
```

- [ ] **Step 5: Type check** `bun run --cwd apps/payload check-types` → passes. Commit `feat(cms): shared fields, revalidate hook and bio editor`.

---

### Task 4: Portfolio collections

**Files:**
- Create: `apps/payload/src/collections/{Disciplines,Experiences,Projects,Content}.ts`
- Modify: `apps/payload/src/payload.config.ts`

- [ ] **Step 1: A tiny shared config helper** — add to `src/access/public-read.ts`:
```ts
import { authenticated } from './authenticated'

export const publicContentAccess = {
  read: publicRead,
  create: authenticated,
  update: authenticated,
  delete: authenticated,
}
```
and `src/hooks/revalidate-web.ts` export:
```ts
export const revalidateCollectionHooks = {
  afterChange: [revalidateAfterChange],
  afterDelete: [revalidateAfterDelete],
}
```

- [ ] **Step 2: `Disciplines`.**
```ts
import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { bioEditor } from '../editor/bio-editor'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Disciplines: CollectionConfig = {
  slug: 'disciplines',
  labels: { singular: 'Discipline', plural: 'Disciplines (roles)' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', 'order'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'Shown on the headline drum, e.g. "Software engineer".' } },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar', description: 'URL hash, e.g. "se" → /#se.' } },
    orderField(),
    { name: 'level', type: 'text', required: true, admin: { description: 'Picker meta, e.g. "LV 9 · backend".' } },
    {
      name: 'bio',
      type: 'richText',
      required: true,
      editor: bioEditor,
      admin: {
        description:
          'One paragraph per block. Keep the SAME sentence skeleton in every discipline and change only the vocabulary — the page animates just the words that differ.',
      },
    },
    { name: 'figureCaption', type: 'text', required: true },
    {
      name: 'curiousNotes',
      type: 'array',
      admin: { description: 'Handwritten notes beside the figure in curious mode.' },
      fields: [
        { name: 'side', type: 'select', required: true, defaultValue: 'right', options: ['left', 'right'] },
        { name: 'text', type: 'text', required: true },
        { name: 'formula', type: 'text' },
      ],
    },
  ],
}
```

- [ ] **Step 3: `Experiences`.**
```ts
import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  labels: { singular: 'Experience', plural: 'Professional background' },
  admin: { useAsTitle: 'company', defaultColumns: ['company', 'title', 'startYear', 'endYear'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'company', type: 'text', required: true },
    chipField(),
    urlField(),
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'startYear', type: 'number', required: true, min: 1990, max: 2100 },
        { name: 'endYear', type: 'number', min: 1990, max: 2100, admin: { description: 'Leave empty for current.' } },
      ],
    },
    disciplinesField('Disciplines this entry appears under. Empty = all.'),
    orderField(),
  ],
}
```

- [ ] **Step 4: `Projects`.**
```ts
import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const Projects: CollectionConfig = {
  slug: 'projects',
  labels: { singular: 'Project', plural: 'Portfolio' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'summary', 'order'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'name', type: 'text', required: true },
    chipField(),
    urlField(),
    { name: 'summary', type: 'text', required: true },
    disciplinesField('Disciplines this project appears under. Empty = all.'),
    orderField(),
  ],
}
```

- [ ] **Step 5: `Content`.**
```ts
import type { CollectionConfig } from 'payload'
import { publicContentAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { disciplinesField } from '../fields/disciplines-relation'
import { urlField } from '../fields/link-url'
import { orderField } from '../fields/order'
import { revalidateCollectionHooks } from '../hooks/revalidate-web'

export const CONTENT_KINDS = ['article', 'talk', 'podcast', 'open-source', 'community'] as const

export const Content: CollectionConfig = {
  slug: 'content',
  labels: { singular: 'Content item', plural: 'Content & community' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'kind', 'date'] },
  defaultSort: 'order',
  access: publicContentAccess,
  hooks: revalidateCollectionHooks,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'kind', type: 'select', required: true, options: [...CONTENT_KINDS] },
    chipField(),
    { name: 'venue', type: 'text' },
    urlField('url', true),
    { name: 'date', type: 'date', required: true },
    disciplinesField('Disciplines this item appears under. Empty = all.'),
    orderField(),
  ],
}
```

- [ ] **Step 6: Register** in `payload.config.ts`: `collections: [Disciplines, Experiences, Projects, Content, Media, Users]`.

- [ ] **Step 7:** `bun run --cwd apps/payload generate:importmap && bun run --cwd apps/payload check-types` → pass. Commit `feat(cms): portfolio collections`.

---

### Task 5: Globals

**Files:**
- Create: `apps/payload/src/globals/{Profile,Contact,Navigation,SiteSettings}.ts`
- Modify: `apps/payload/src/payload.config.ts`

- [ ] **Step 1: Shared global access** — add to `src/access/public-read.ts`:
```ts
export const publicGlobalAccess = { read: publicRead, update: authenticated }
```
and to `src/hooks/revalidate-web.ts`:
```ts
export const revalidateGlobalHooks = { afterChange: [revalidateGlobal] }
```

- [ ] **Step 2: `Profile`.**
```ts
import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Profile: GlobalConfig = {
  slug: 'profile',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'headlineTail', type: 'text', required: true, defaultValue: 'and builder.', admin: { description: 'Text after the role drum in the headline.' } },
    { name: 'email', type: 'email', required: true },
    { name: 'location', type: 'text' },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
  ],
}
```

- [ ] **Step 3: `Contact`.**
```ts
import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { chipField } from '../fields/chip'
import { urlField } from '../fields/link-url'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Contact: GlobalConfig = {
  slug: 'contact',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'links',
      type: 'array',
      admin: { description: 'The row of links under the figure.' },
      fields: [{ name: 'label', type: 'text', required: true }, chipField(), urlField('url', true)],
    },
  ],
}
```

- [ ] **Step 4: `Navigation`.**
```ts
import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'items',
      type: 'array',
      admin: { description: 'Footer navigation. Section anchors: #work, #projects, #content.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        urlField('href', true),
        { name: 'newTab', type: 'checkbox', defaultValue: false },
      ],
    },
  ],
}
```

- [ ] **Step 5: `SiteSettings`.**
```ts
import type { GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

const text = (name: string, defaultValue: string, description?: string) => ({
  name,
  type: 'text' as const,
  required: true,
  defaultValue,
  admin: description ? { description } : undefined,
})

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    {
      name: 'seo',
      type: 'group',
      fields: [
        text('title', 'Vinicius Queiroz — engineer and builder'),
        text('description', 'One letter, three disciplines.'),
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
      ],
    },
    { name: 'defaultDiscipline', type: 'relationship', relationTo: 'disciplines' },
    {
      name: 'figure',
      type: 'group',
      fields: [
        {
          name: 'splineSceneUrl',
          type: 'text',
          admin: { description: 'Spline → Export → Code → copy the .splinecode URL. Empty = /spline/scene.splinecode.' },
        },
      ],
    },
    {
      name: 'sectionLabels',
      type: 'group',
      fields: [text('work', 'Work'), text('projects', 'Projects'), text('content', 'Content & community')],
    },
    text('pickerHint', 'scroll to change class'),
    {
      name: 'pageNotes',
      type: 'group',
      admin: { description: 'Handwritten notes shown in curious mode.' },
      fields: [
        text('headline', 'Inter, everywhere. One family keeps the page quiet.'),
        text('columnWidth', '{w}px. Narrow enough to read; wide enough to breathe.', '{w} is replaced by the measured column width.'),
        text('wallSwitch', 'A real rocker, 17 frames. Flick it ten times and see what happens.'),
        text('sectionGap', '64px between sections. Separate, not disconnected.'),
        text('chips', '16px chips: enough character without becoming a logo wall.'),
        text('role', 'Hover the role. It rolls, the letter rewrites itself — only the words that change.'),
      ],
    },
  ],
}
```

- [ ] **Step 6: Register** `globals: [Profile, Contact, Navigation, SiteSettings]` in `payload.config.ts`. Run import map + check-types → pass. Commit `feat(cms): profile, contact, navigation and site settings globals`.

---

### Task 6: MCP plugin

**Files:**
- Create: `apps/payload/src/mcp/mcp-plugin.ts`
- Modify: `apps/payload/src/payload.config.ts`, `apps/payload/README.md`

- [ ] **Step 1:** `src/mcp/mcp-plugin.ts`:
```ts
import { mcpPlugin } from '@payloadcms/plugin-mcp'

const crud = { find: true, create: true, update: true, delete: true }
const readWrite = { find: true, update: true }

export const portfolioMcp = mcpPlugin({
  collections: {
    disciplines: {
      enabled: crud,
      description:
        'Roles the portfolio can switch between (e.g. Software engineer). Each has a Lexical rich-text bio whose paragraphs must stay parallel across disciplines, a picker level label, a figure caption and curious-mode formula notes.',
    },
    experiences: {
      enabled: crud,
      description: 'Professional background: one row per company + title, with start/end years and the disciplines it belongs to.',
    },
    projects: { enabled: crud, description: 'Portfolio projects: name, favicon chip, url, one-line summary, disciplines.' },
    content: { enabled: crud, description: 'Content & community: articles, talks, podcasts, open-source and community work.' },
    media: { enabled: { find: true }, description: 'Uploaded images (avatar, Open Graph image).' },
  },
  globals: {
    profile: { enabled: readWrite, description: 'Owner identity: name, headline tail, email, location, avatar.' },
    contact: { enabled: readWrite, description: 'Contact link row under the figure (email, LinkedIn, GitHub…).' },
    navigation: { enabled: readWrite, description: 'Footer navigation items.' },
    'site-settings': {
      enabled: readWrite,
      description: 'SEO, default discipline, Spline scene URL, section labels, picker hint and curious-mode page notes.',
    },
  },
})
```
Verify the option names against the installed plugin types before writing: `grep -n "globals\|enabled\|description" apps/payload/node_modules/@payloadcms/plugin-mcp/dist/types.d.ts`. If `globals` is not supported in 3.90.2, drop that key and note it in the commit message.

- [ ] **Step 2:** Add `plugins: [portfolioMcp]` to `payload.config.ts`. Import map + check-types → pass.

- [ ] **Step 3: README.** Replace `apps/payload/README.md` with a short doc: purpose, `bun run --cwd apps/payload dev` (port 3001), `bun run --cwd apps/payload seed`, content model table (copy §4 of the spec), and the MCP section:
````md
## MCP

1. Start the CMS and open http://localhost:3001/admin → **MCP → API Keys** → create a key with the permissions you want.
2. Connect Claude Code:

```bash
claude mcp add --transport http payload http://127.0.0.1:3001/api/mcp --header "Authorization: Bearer <MCP_API_KEY>"
```
````
Commit `feat(cms): expose portfolio content over MCP`.

---

### Task 7: Seed data, runner, integrity test, generated types

**Files:**
- Create: `apps/payload/src/seed/{lexical,data,upsert,run}.ts`, `apps/payload/tests/int/seed-data.int.spec.ts`
- Modify: `apps/payload/vitest.config.mts` (include path), generated `packages/cms-types/src/payload-types.ts`

- [ ] **Step 1: Lexical builders.** `src/seed/lexical.ts`:
```ts
import { randomBytes } from 'crypto'

type Segment = string | { bold: string } | { chip: string; label: string; url?: string } | { curious: string }

export const b = (bold: string): Segment => ({ bold })
export const chip = (label: string, code: string, url?: string): Segment => ({ chip: code, label, url })
export const curious = (word = 'curious'): Segment => ({ curious: word })

const id = () => randomBytes(12).toString('hex')
const text = (value: string, format: 0 | 1) => ({ type: 'text', text: value, format, detail: 0, mode: 'normal', style: '', version: 1 })
const inline = (fields: Record<string, unknown>) => ({ type: 'inlineBlock', version: 1, fields: { id: id(), blockName: '', ...fields } })

function toNode(segment: Segment) {
  if (typeof segment === 'string') return text(segment, 0)
  if ('bold' in segment) return text(segment.bold, 1)
  if ('curious' in segment) return inline({ blockType: 'curiousToggle', word: segment.curious })
  return inline({ blockType: 'chipLink', label: segment.label, chip: segment.chip, url: segment.url ?? null })
}

export function richText(paragraphs: Segment[][]) {
  return {
    root: {
      type: 'root', format: '', indent: 0, version: 1, direction: 'ltr' as const,
      children: paragraphs.map((segments) => ({
        type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr' as const, textFormat: 0, textStyle: '',
        children: segments.map(toNode),
      })),
    },
  }
}
```

- [ ] **Step 2: Seed data.** `src/seed/data.ts` — typed arrays transcribed from `docs/template-portfolio/reference/parts/data1.js` (ROLES, CLASSES meta) and `curious1.js` (MODEL_NOTES). Shape:
```ts
import { b, chip, curious, richText } from './lexical'

export interface DisciplineSeed {
  slug: string; title: string; order: number; level: string; figureCaption: string
  bio: ReturnType<typeof richText>
  curiousNotes: { side: 'left' | 'right'; text: string; formula?: string }[]
}
export interface ExperienceSeed { company: string; chip: string; title: string; startYear: number; endYear?: number; disciplines: string[]; order: number }
export interface ProjectSeed { name: string; chip: string; summary: string; disciplines: string[]; order: number }

export const disciplines: DisciplineSeed[] = [
  {
    slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9 · backend',
    figureCaption: 'Fig. 1 — one request: edge, gateway, services, queue, stores',
    bio: richText([
      ['Hi, I’m Vinicius, a 🇧🇷 Brazilian ', b('software engineer'), ' and builder, though most weeks that just means ', b('backend plumber'), '. I love the early stage of a system, when the ', b('contract'), ' is still messy and there is a lot to figure out. Apparently, ambiguity is my idea of fun.'],
      ['I currently build ', b('order and pricing services'), ' at ', chip('Autodoc', 'A', 'https://autodoc.com.br'), ', where I joined in 2023 and have helped shape the ', b('platform, its deploy path, and its on-call culture'), ' from the ground up. Most days I am still close to the work — ', b('writing Go, reading traces, and sweating the p99'), '.'],
      ['Before Autodoc I worked on ', b('payment integrations'), ' at ', chip('Nexo Labs', 'N'), ', ', b('event-driven refactors'), ' for ', chip('Meridiano', 'M'), ', and ', b('a B2B catalogue'), ' used by 400 stores.'],
      ['I recently designed and coded ', chip('Pipeline Zero', 'P'), ', ', b('a declarative ingestion framework'), ', and ', chip('Sonda', 'S'), ', ', b('a trace sampler that keeps the one percent of spans worth keeping'), '. Small projects like these are my favourite excuse to learn new stuff and try things out.'],
      ['I’m a big ', chip('Ted Lasso', 'TL'), ' fan, and the line that has stayed with me is “Be ', curious(), ', not judgmental.” It’s also a pretty good way to approach systems, if you ask me.'],
    ]),
    curiousNotes: [
      { side: 'right', text: 'Little’s law for the whole stack', formula: 'L = λ·W' },
      { side: 'right', text: '1.2M req/day ≈ 14 rps; at W = 84 ms the queue holds about one request.', formula: 'L ≈ 14 × 0.084 ≈ 1.2' },
      { side: 'left', text: 'p99 budget for checkout', formula: 'W₉₉ ≤ 84 ms' },
      { side: 'left', text: 'every write carries an idempotency key, so a retry is a no-op' },
    ],
  },
  // ai and civil: transcribe the same way from data1.js ROLES.ai / ROLES.civil and curious1.js MODEL_NOTES.ai / .civil
]
```
Transcribe **all three** disciplines fully (no placeholders; `ai` level `LV 4 · applied ml`, `civil` level `LV 9 · structures`). Then `experiences` — dedupe `ROLES.*.work` by `(company, title)`; each row carries the disciplines it appeared under, years parsed (`'2023–'` → `startYear: 2023`; `'2021–23'` → `2021, 2023`), `order` by list position. `projects` likewise from `ROLES.*.projects`. Also export:
```ts
export const profile = { name: 'Vinicius Queiroz', headlineTail: 'and builder.', email: 'vqueiroz@autodoc.com.br', location: 'Brazil' }
export const contactLinks = [
  { label: 'Send me a message', chip: '@', url: 'mailto:vqueiroz@autodoc.com.br' },
  { label: '/in/vqueiroz', chip: 'in', url: 'https://www.linkedin.com/in/vqueiroz' },
  { label: '@vqueiroz', chip: 'gh', url: 'https://github.com/vqueiroz' },
]
export const navigationItems = [
  { label: 'Work', href: '#work', newTab: false },
  { label: 'Projects', href: '#projects', newTab: false },
]
export const defaultDisciplineSlug = 'se'
```
Content & community starts empty (`export const content: never[] = []`) — no real data is available; the web hides the section when empty.

- [ ] **Step 3: Failing integrity test.** `tests/int/seed-data.int.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { contactLinks, defaultDisciplineSlug, disciplines, experiences, projects } from '@/seed/data'

const slugs = new Set(disciplines.map((d) => d.slug))

describe('seed data', () => {
  it('has unique discipline slugs', () => {
    expect(slugs.size).toBe(disciplines.length)
  })
  it('keeps bios parallel: same paragraph count everywhere', () => {
    const counts = new Set(disciplines.map((d) => d.bio.root.children.length))
    expect(counts.size).toBe(1)
  })
  it('only references existing disciplines', () => {
    for (const row of [...experiences, ...projects]) {
      for (const slug of row.disciplines) expect(slugs.has(slug)).toBe(true)
    }
    expect(slugs.has(defaultDisciplineSlug)).toBe(true)
  })
  it('has one curious toggle per bio', () => {
    for (const d of disciplines) {
      const toggles = JSON.stringify(d.bio).match(/"curiousToggle"/g) ?? []
      expect(toggles).toHaveLength(1)
    }
  })
  it('uses safe contact urls', () => {
    for (const link of contactLinks) expect(link.url).toMatch(/^(https?:\/\/|mailto:)/)
  })
})
```
Make `vitest.config.mts` include `tests/int/**/*.int.spec.ts` and keep the `@/` → `src/` alias (vite-tsconfig-paths already configured). Run `bun run --cwd apps/payload test:int` — FAIL until data is complete, then PASS.

- [ ] **Step 4: Upsert helpers.** `src/seed/upsert.ts`:
```ts
import type { CollectionSlug, Payload, Where } from 'payload'

const QUIET = { disableRevalidate: true }

export async function upsert<T extends Record<string, unknown>>(
  payload: Payload,
  collection: CollectionSlug,
  where: Where,
  data: T,
): Promise<number | string> {
  const found = await payload.find({ collection, where, limit: 1, depth: 0 })
  const existing = found.docs[0]
  const doc = existing
    ? await payload.update({ collection, id: existing.id, data, context: QUIET })
    : await payload.create({ collection, data, context: QUIET })
  return doc.id
}

export const quiet = QUIET
```
(If the generic `data` type is rejected by Payload's typed Local API, narrow per call site with the generated types rather than casting to `any`.)

- [ ] **Step 5: Runner.** `src/seed/run.ts`:
```ts
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import * as seed from './data'
import { quiet, upsert } from './upsert'

const payload = await getPayload({ config: configPromise })

const ids = new Map<string, number | string>()
for (const d of seed.disciplines) {
  ids.set(d.slug, await upsert(payload, 'disciplines', { slug: { equals: d.slug } }, d))
}
const rel = (slugs: string[]) => slugs.map((s) => ids.get(s)).filter((v) => v !== undefined)

for (const e of seed.experiences) {
  await upsert(payload, 'experiences', { and: [{ company: { equals: e.company } }, { title: { equals: e.title } }] }, { ...e, disciplines: rel(e.disciplines) })
}
for (const p of seed.projects) {
  await upsert(payload, 'projects', { name: { equals: p.name } }, { ...p, disciplines: rel(p.disciplines) })
}

await payload.updateGlobal({ slug: 'profile', data: seed.profile, context: quiet })
await payload.updateGlobal({ slug: 'contact', data: { links: seed.contactLinks }, context: quiet })
await payload.updateGlobal({ slug: 'navigation', data: { items: seed.navigationItems }, context: quiet })
await payload.updateGlobal({ slug: 'site-settings', data: { defaultDiscipline: ids.get(seed.defaultDisciplineSlug) }, context: quiet })

payload.logger.info('Seed complete')
process.exit(0)
```
Check `@payload-config` alias exists in `apps/payload/tsconfig.json` paths; add `"@payload-config": ["./src/payload.config.ts"]` if missing.

- [ ] **Step 6: Run it.** `bun run --cwd apps/payload seed` → logs "Seed complete". Run it a second time → same, no duplicates. Create an admin user is NOT done by the seed (credentials are the user's to set; the admin will prompt on first visit).

- [ ] **Step 7: Generate types.** `bun run --cwd apps/payload generate:types` → writes `packages/cms-types/src/payload-types.ts`. `bun run --cwd apps/payload check-types` → pass.

- [ ] **Step 8: Verify REST.** Start the CMS; `curl -s "http://localhost:3001/api/disciplines?sort=order&depth=0" | head -c 300` shows 3 docs; `curl -s http://localhost:3001/api/globals/profile` shows the name. Leave the CMS running in the background for web tasks.

- [ ] **Step 9: Commit** `feat(cms): idempotent seed with portfolio content and generated types`.

---

# Phase B — Web foundation

### Task 8: Web tooling (Vitest, aliases, deps, turbo test task)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `turbo.json`
- Create: `apps/web/vitest.config.ts`, `apps/web/.env.example`, `apps/web/.env.local`
- Delete: `apps/web/app/page.module.css`, `apps/web/app/fonts/`, `apps/web/public/*.svg`

- [ ] **Step 1: Read Turborepo docs first** (AGENTS.md rule): `node -p "require.resolve('turbo/package.json')"` from repo root, then read `docs/README.md` and the `tasks`/configuration pages in that package before editing `turbo.json`.

- [ ] **Step 2: Dependencies.**
```bash
bun add --cwd apps/web @splinetool/react-spline @splinetool/runtime
bun add --cwd apps/web -d vitest @playwright/test
```
Remove `"@repo/ui": "*"` from `apps/web/package.json` dependencies and add `"@repo/cms-types": "*"` (devDependency, types only). Scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 3: Alias.** In `apps/web/tsconfig.json` `compilerOptions` add `"baseUrl": ".", "paths": { "@/*": ["./*"] }`.

- [ ] **Step 4: Vitest config.** `apps/web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', passWithNoTests: true },
})
```

- [ ] **Step 5: Env.** `apps/web/.env.example`:
```
CMS_URL=http://localhost:3001
REVALIDATE_SECRET=YOUR_SHARED_REVALIDATE_SECRET
```
`apps/web/.env.local`: same keys, `REVALIDATE_SECRET` = the value generated in Task 1 (read it from `apps/payload/.env`).

- [ ] **Step 6: Turbo.** Add a `test` task to `turbo.json` (`"test": { "dependsOn": ["^build"], "outputs": [] }` — adjust to what the installed docs recommend) and add `"env": ["CMS_URL", "REVALIDATE_SECRET"]` to `build`.

- [ ] **Step 7: Clean starter files** (list above). Temporarily reduce `app/page.tsx` to `export default function Page() { return null }` so the build stays green.

- [ ] **Step 8:** `bun run --cwd apps/web test` → exits 0 with no tests. `bun run --cwd apps/web check-types` → pass. Commit `chore(web): tooling, aliases and dependencies`.

---

### Task 9: Design tokens, base styles, fonts, theme script, layout

**Files:**
- Create: `apps/web/styles/tokens.css`, `apps/web/styles/base.css`, `apps/web/features/theme/theme-dom.ts`, `apps/web/features/theme/ThemeScript.tsx`
- Modify: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`

- [ ] **Step 1: `styles/tokens.css`.** Port from `docs/template-portfolio/app/globals.css` lines 7–74 and `CONTEXT.md §3`, restructured as tokens only:
  - Light palette on `:root`: `--paper --ink --ink-link --ink-soft --rule --rule-soft --chip --accent --glow-a --glow-b --glow-c --wall-contact --wall-cast --flick`.
  - Dark palette under **both** `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and `:root[data-theme="dark"] {…}` (values from CONTEXT.md §3 + globals.css 108–111, 142–145).
  - Metrics: `--column: 600px; --gutter: 16px; --section-gap: 64px; --body-size: 15px; --body-line: 24px; --h1-size: 28px; --chip-size: 16px; --row-gap: 14px; --underline: 2px; --underline-offset: 2.7px; --picker-row: 42px;`
  - Motion: `--ease-out: cubic-bezier(.16,.84,.26,1); --ease-snap: cubic-bezier(.2,.9,.25,1); --theme-fade: 380ms;`
  - Theme transition, DRY: `:root { --theme-transition: color 0s; }` and `:root[data-theme-transition] { --theme-transition: color .38s ease, background-color .38s ease, border-color .38s ease, text-decoration-color .38s ease, box-shadow .38s ease; }`. Every component that sets a colour uses `transition: var(--theme-transition)` (or appends it to its own list). This replaces the template's 20-selector list (globals.css 128–136).

- [ ] **Step 2: `styles/base.css`.** Body (paper + 3 fixed radial glows, font, antialiasing), `main` (width `calc(var(--column) + 2*var(--gutter))`, centred, padding, `position: relative`), `h1` (`.who` 620, `.what` 430, 28px, letter-spacing −.012em, line-height 1.22), `h2`, `section { margin-top: var(--section-gap) }`, `.sr-only`, focus-visible ring, and the **global** chip-link classes used by both React and the CMS-serialized bio: `.fav`, `.fav > span` (underline on the span), `.chip` — values from globals.css (search `a.fav`, `i.chip`). Also `#flick` layer and `@media (prefers-reduced-motion: reduce)` resets.

- [ ] **Step 3: `app/globals.css`:**
```css
@import '../styles/tokens.css';
@import '../styles/base.css';
```

- [ ] **Step 4: Theme DOM helpers.** `features/theme/theme-dom.ts`:
```ts
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'
const TRANSITION_MS = 380
const root = () => document.documentElement

export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

export function explicitTheme(): Theme | null {
  const value = root().getAttribute('data-theme')
  return isTheme(value) ? value : null
}

export function currentTheme(): Theme {
  return explicitTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyTheme(theme: Theme | null, persist = true): void {
  if (theme) root().setAttribute('data-theme', theme)
  else root().removeAttribute('data-theme')
  if (!persist) return
  try {
    if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme)
    else localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

let transitionTimer = 0
export function stampThemeTransition(): void {
  window.clearTimeout(transitionTimer)
  root().dataset.themeTransition = 'true'
  transitionTimer = window.setTimeout(() => delete root().dataset.themeTransition, TRANSITION_MS)
}
```

- [ ] **Step 5: `ThemeScript.tsx`** (server component, runs before paint — fixes FOUC):
```tsx
import { THEME_STORAGE_KEY } from './theme-dom'

const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
```

- [ ] **Step 6: `app/layout.tsx`:**
```tsx
import type { ReactNode } from 'react'
import { Caveat, Inter } from 'next/font/google'
import { ThemeScript } from '@/features/theme/ThemeScript'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap' })

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div id="flick" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
```
(Metadata is added in Task 23.)

- [ ] **Step 7:** `bun run --cwd apps/web check-types` and `bun run --cwd apps/web build` → pass. Commit `feat(web): design tokens, base styles, fonts and no-FOUC theme script`.

---

### Task 10: Period formatting (TDD)

**Files:**
- Create: `apps/web/lib/format/period.ts`, `apps/web/tests/unit/format/period.test.ts`

- [ ] **Step 1: Failing test.**
```ts
import { describe, expect, it } from 'vitest'
import { formatPeriod } from '@/lib/format/period'

describe('formatPeriod', () => {
  it('open-ended', () => expect(formatPeriod(2023)).toBe('2023–'))
  it('same century shortens the end year', () => expect(formatPeriod(2021, 2023)).toBe('2021–23'))
  it('same year collapses', () => expect(formatPeriod(2020, 2020)).toBe('2020'))
  it('different century keeps both in full', () => expect(formatPeriod(1998, 2003)).toBe('1998–2003'))
})
```
- [ ] **Step 2:** `bun run --cwd apps/web test` → FAIL (module not found).
- [ ] **Step 3: Implement.**
```ts
export function formatPeriod(start: number, end?: number | null): string {
  if (end == null) return `${start}–`
  if (end === start) return String(start)
  const sameCentury = Math.floor(start / 100) === Math.floor(end / 100)
  return `${start}–${sameCentury ? String(end).slice(-2) : end}`
}
```
- [ ] **Step 4:** tests PASS. Commit `feat(web): period formatting`.

---

### Task 11: CMS view models and bio serializer (TDD)

**Files:**
- Create: `apps/web/lib/cms/types.ts`, `apps/web/shared/ui/chip-markup.ts`, `apps/web/lib/cms/bio-html.ts`, `apps/web/tests/unit/cms/bio-html.test.ts`

- [ ] **Step 1: View models.** `lib/cms/types.ts`:
```ts
export type Side = 'left' | 'right'

export interface CuriousNote { side: Side; text: string; formula?: string }

export interface Discipline {
  slug: string
  title: string
  level: string
  caption: string
  /** Paragraphs in the morph's HTML dialect (see lib/cms/bio-html.ts). */
  bio: string[]
  notes: CuriousNote[]
}

/** One row of Work / Projects / Content. */
export interface Entry {
  id: string
  chip: string
  label: string
  href?: string
  meta: string
  aside?: string
  /** Discipline slugs; empty = shown for every discipline. */
  disciplines: string[]
}

export interface LinkItem { label: string; chip: string; href: string }
export interface NavItem { label: string; href: string; newTab: boolean }

export interface PageNotes {
  headline: string; columnWidth: string; wallSwitch: string; sectionGap: string; chips: string; role: string
}

export interface Settings {
  seo: { title: string; description: string; ogImage?: string }
  splineSceneUrl: string
  sectionLabels: { work: string; projects: string; content: string }
  pickerHint: string
  pageNotes: PageNotes
}

export interface Portfolio {
  profile: { name: string; headlineTail: string; email: string }
  disciplines: Discipline[]
  defaultSlug: string
  work: Entry[]
  projects: Entry[]
  content: Entry[]
  contactLinks: LinkItem[]
  nav: NavItem[]
  settings: Settings
}
```

- [ ] **Step 2: Shared chip markup (single source for React + serializer).** `shared/ui/chip-markup.ts`:
```ts
export const CHIP_LINK_CLASS = 'fav'
export const CHIP_CLASS = 'chip'
export const CURIOUS_TRIGGER_CLASS = 'curiosity-trigger'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i
export const safeHref = (url: string | null | undefined): string | undefined =>
  url && SAFE_URL.test(url.trim()) ? url.trim() : undefined
export const isExternal = (href: string) => /^https?:\/\//i.test(href)

export function chipLinkHtml(label: string, chip: string, url?: string | null): string {
  const href = safeHref(url)
  const attrs = href
    ? ` href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`
    : ''
  return `<a class="${CHIP_LINK_CLASS}"${attrs}><i class="${CHIP_CLASS}" aria-hidden="true">${escapeHtml(chip)}</i><span>${escapeHtml(label)}</span></a>`
}

export function curiousToggleHtml(word: string): string {
  return (
    `<button class="${CURIOUS_TRIGGER_CLASS}" type="button" role="switch" aria-checked="false" aria-label="Curious mode">` +
    `<span class="curiosity-word">${escapeHtml(word)}</span>` +
    `<span class="curiosity-switch-track" aria-hidden="true"><span class="curiosity-switch-thumb"></span></span></button>`
  )
}
```

- [ ] **Step 3: Failing serializer tests.** `tests/unit/cms/bio-html.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { bioParagraphs } from '@/lib/cms/bio-html'

const t = (text: string, format = 0) => ({ type: 'text', text, format })
const p = (...children: unknown[]) => ({ type: 'paragraph', children })
const doc = (...paragraphs: unknown[]) => ({ root: { children: paragraphs } })
const inline = (fields: Record<string, unknown>) => ({ type: 'inlineBlock', fields })

describe('bioParagraphs', () => {
  it('renders text and bold', () => {
    expect(bioParagraphs(doc(p(t('Hi, '), t('backend plumber', 1), t('.'))))).toEqual(['Hi, <strong>backend plumber</strong>.'])
  })
  it('escapes text', () => {
    expect(bioParagraphs(doc(p(t('<script>'))))).toEqual(['&lt;script&gt;'])
  })
  it('renders chip links with safe urls only', () => {
    const [html] = bioParagraphs(doc(p(inline({ blockType: 'chipLink', label: 'Autodoc', chip: 'A', url: 'https://autodoc.com.br' }))))
    expect(html).toBe('<a class="fav" href="https://autodoc.com.br" target="_blank" rel="noopener noreferrer"><i class="chip" aria-hidden="true">A</i><span>Autodoc</span></a>')
    const [unsafe] = bioParagraphs(doc(p(inline({ blockType: 'chipLink', label: 'x', chip: 'X', url: 'javascript:alert(1)' }))))
    expect(unsafe).not.toContain('href')
  })
  it('renders the curious toggle', () => {
    const [html] = bioParagraphs(doc(p(inline({ blockType: 'curiousToggle', word: 'curious' }))))
    expect(html).toContain('role="switch"')
    expect(html).toContain('>curious<')
  })
  it('turns line breaks into spaces and skips empty paragraphs', () => {
    expect(bioParagraphs(doc(p(t('a'), { type: 'linebreak' }, t('b')), p()))).toEqual(['a b'])
  })
  it('returns [] for missing content', () => {
    expect(bioParagraphs(null)).toEqual([])
  })
})
```
Run → FAIL.

- [ ] **Step 4: Implement** `lib/cms/bio-html.ts`:
```ts
import { chipLinkHtml, curiousToggleHtml, escapeHtml } from '@/shared/ui/chip-markup'

interface LexicalNode {
  type: string
  text?: string
  format?: number
  children?: LexicalNode[]
  fields?: Record<string, unknown>
}
export interface RichTextValue { root: { children: LexicalNode[] } }

const IS_BOLD = 1
const str = (value: unknown) => (typeof value === 'string' ? value : '')

function inlineBlock(fields: Record<string, unknown> = {}): string {
  switch (fields.blockType) {
    case 'chipLink':
      return chipLinkHtml(str(fields.label), str(fields.chip), str(fields.url) || null)
    case 'curiousToggle':
      return curiousToggleHtml(str(fields.word) || 'curious')
    default:
      return ''
  }
}

function node(n: LexicalNode): string {
  switch (n.type) {
    case 'text': {
      const text = escapeHtml(n.text ?? '')
      return (n.format ?? 0) & IS_BOLD ? `<strong>${text}</strong>` : text
    }
    case 'linebreak':
      return ' '
    case 'inlineBlock':
      return inlineBlock(n.fields)
    default:
      return (n.children ?? []).map(node).join('')
  }
}

export function bioParagraphs(value: RichTextValue | null | undefined): string[] {
  return (value?.root.children ?? []).map((p) => (p.children ?? []).map(node).join('').trim()).filter(Boolean)
}
```

- [ ] **Step 5:** tests PASS. Commit `feat(web): cms view models and bio serializer`.

---

### Task 12: Mappers, client, queries, revalidate route (TDD for mappers)

**Files:**
- Create: `apps/web/lib/cms/mappers.ts`, `apps/web/lib/cms/client.ts`, `apps/web/lib/cms/queries.ts`, `apps/web/app/api/revalidate/route.ts`, `apps/web/tests/unit/cms/mappers.test.ts`

- [ ] **Step 1: Failing mapper tests** (use literal objects shaped like the generated types — import the types from `@repo/cms-types` and build fixtures with `satisfies`):
```ts
import { describe, expect, it } from 'vitest'
import type { Discipline as CmsDiscipline, Experience, Project } from '@repo/cms-types'
import { filterByDiscipline, toDiscipline, toExperienceEntry, toProjectEntry } from '@/lib/cms/mappers'

const discipline = { id: 1, slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9', figureCaption: 'Fig. 1', bio: { root: { children: [] } }, curiousNotes: [{ id: 'n', side: 'left', text: 'x', formula: null }], updatedAt: '', createdAt: '' } as unknown as CmsDiscipline

describe('mappers', () => {
  it('maps a discipline and drops null formulas', () => {
    expect(toDiscipline(discipline)).toEqual({ slug: 'se', title: 'Software engineer', level: 'LV 9', caption: 'Fig. 1', bio: [], notes: [{ side: 'left', text: 'x' }] })
  })
  it('maps an experience with a period and populated disciplines', () => {
    const e = { id: 7, company: 'Autodoc', chip: 'A', url: null, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [discipline], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e)).toEqual({ id: '7', chip: 'A', label: 'Autodoc', href: undefined, meta: 'Senior SE', aside: '2023–', disciplines: ['se'] })
  })
  it('maps a project', () => {
    const p = { id: 3, name: 'Sonda', chip: 'S', url: 'https://x.dev', summary: 'Sampler', disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p)).toEqual({ id: '3', chip: 'S', label: 'Sonda', href: 'https://x.dev', meta: 'Sampler', disciplines: [] })
  })
  it('filters entries: empty disciplines means everywhere', () => {
    const rows = [
      { id: '1', chip: 'A', label: 'a', meta: '', disciplines: ['se'] },
      { id: '2', chip: 'B', label: 'b', meta: '', disciplines: [] },
      { id: '3', chip: 'C', label: 'c', meta: '', disciplines: ['ai'] },
    ]
    expect(filterByDiscipline(rows, 'se').map((r) => r.id)).toEqual(['1', '2'])
  })
})
```
Run → FAIL. (The `as unknown as` casts are allowed in test fixtures only.)

- [ ] **Step 2: Implement** `lib/cms/mappers.ts`:
```ts
import type {
  Contact, Content, Discipline as CmsDiscipline, Experience, Media, Navigation, Profile, Project, SiteSetting,
} from '@repo/cms-types'
import { formatPeriod } from '@/lib/format/period'
import { safeHref } from '@/shared/ui/chip-markup'
import { bioParagraphs, type RichTextValue } from './bio-html'
import type { Discipline, Entry, LinkItem, NavItem, Portfolio, Settings } from './types'

type Related = number | CmsDiscipline | null | undefined

const slugsOf = (list: Related[] | null | undefined): string[] =>
  (list ?? []).flatMap((d) => (d && typeof d === 'object' ? [d.slug] : []))

export const toDiscipline = (d: CmsDiscipline): Discipline => ({
  slug: d.slug,
  title: d.title,
  level: d.level,
  caption: d.figureCaption,
  bio: bioParagraphs(d.bio as unknown as RichTextValue),
  notes: (d.curiousNotes ?? []).map((n) => ({ side: n.side, text: n.text, ...(n.formula ? { formula: n.formula } : {}) })),
})

export const toExperienceEntry = (e: Experience): Entry => ({
  id: String(e.id), chip: e.chip, label: e.company, href: safeHref(e.url), meta: e.title,
  aside: formatPeriod(e.startYear, e.endYear), disciplines: slugsOf(e.disciplines),
})

export const toProjectEntry = (p: Project): Entry => ({
  id: String(p.id), chip: p.chip, label: p.name, href: safeHref(p.url), meta: p.summary, disciplines: slugsOf(p.disciplines),
})

export const toContentEntry = (c: Content): Entry => ({
  id: String(c.id), chip: c.chip, label: c.title, href: safeHref(c.url),
  meta: [c.kind, c.venue].filter(Boolean).join(' · '), aside: String(new Date(c.date).getFullYear()),
  disciplines: slugsOf(c.disciplines),
})

export const filterByDiscipline = (rows: Entry[], slug: string): Entry[] =>
  rows.filter((r) => r.disciplines.length === 0 || r.disciplines.includes(slug))

const mediaUrl = (m: number | Media | null | undefined, base: string) =>
  m && typeof m === 'object' && m.url ? new URL(m.url, base).toString() : undefined

const toLinks = (c: Contact): LinkItem[] =>
  (c.links ?? []).flatMap((l) => {
    const href = safeHref(l.url)
    return href ? [{ label: l.label, chip: l.chip, href }] : []
  })

const toNav = (n: Navigation): NavItem[] =>
  (n.items ?? []).flatMap((i) => {
    const href = safeHref(i.href)
    return href ? [{ label: i.label, href, newTab: Boolean(i.newTab) }] : []
  })

const toSettings = (s: SiteSetting, base: string): Settings => ({
  seo: { title: s.seo.title, description: s.seo.description, ogImage: mediaUrl(s.seo.ogImage, base) },
  splineSceneUrl: s.figure?.splineSceneUrl || '/spline/scene.splinecode',
  sectionLabels: s.sectionLabels,
  pickerHint: s.pickerHint,
  pageNotes: s.pageNotes,
})

export interface CmsSnapshot {
  profile: Profile; contact: Contact; navigation: Navigation; settings: SiteSetting
  disciplines: CmsDiscipline[]; experiences: Experience[]; projects: Project[]; content: Content[]
}

export function toPortfolio(snap: CmsSnapshot, base: string): Portfolio {
  const disciplines = snap.disciplines.map(toDiscipline)
  const configured = typeof snap.settings.defaultDiscipline === 'object' ? snap.settings.defaultDiscipline?.slug : undefined
  return {
    profile: { name: snap.profile.name, headlineTail: snap.profile.headlineTail, email: snap.profile.email },
    disciplines,
    defaultSlug: configured ?? disciplines[0]?.slug ?? '',
    work: snap.experiences.map(toExperienceEntry),
    projects: snap.projects.map(toProjectEntry),
    content: snap.content.map(toContentEntry),
    contactLinks: toLinks(snap.contact),
    nav: toNav(snap.navigation),
    settings: toSettings(snap.settings, base),
  }
}
```
Adjust property access to the **generated** types (e.g. if `seo` is optional there, default it); keep all null handling here, never in components. The `bio` cast is the one allowed cast (Payload types rich text loosely).

- [ ] **Step 3:** tests PASS.

- [ ] **Step 4: Client.** `lib/cms/client.ts`:
```ts
import 'server-only'

export const CMS_TAG = 'cms'
export const cmsBaseUrl = () => process.env.CMS_URL ?? 'http://localhost:3001'

export async function cmsGet<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, cmsBaseUrl()), { next: { tags: [CMS_TAG], revalidate: 300 } })
  if (!res.ok) throw new Error(`CMS ${res.status} for ${path}`)
  return (await res.json()) as T
}
```
Add `server-only` with `bun add --cwd apps/web server-only`.

- [ ] **Step 5: Queries.** `lib/cms/queries.ts`:
```ts
import 'server-only'
import { cache } from 'react'
import type { Contact, Content, Discipline, Experience, Navigation, Profile, Project, SiteSetting } from '@repo/cms-types'
import { cmsBaseUrl, cmsGet } from './client'
import { toPortfolio } from './mappers'
import type { Portfolio } from './types'

interface List<T> { docs: T[] }
const list = <T,>(slug: string) => cmsGet<List<T>>(`/api/${slug}?sort=order&limit=100&depth=1`).then((r) => r.docs)
const global = <T,>(slug: string) => cmsGet<T>(`/api/globals/${slug}?depth=1`)

export const getPortfolio = cache(async (): Promise<Portfolio> => {
  const [profile, contact, navigation, settings, disciplines, experiences, projects, content] = await Promise.all([
    global<Profile>('profile'), global<Contact>('contact'), global<Navigation>('navigation'), global<SiteSetting>('site-settings'),
    list<Discipline>('disciplines'), list<Experience>('experiences'), list<Project>('projects'), list<Content>('content'),
  ])
  return toPortfolio({ profile, contact, navigation, settings, disciplines, experiences, projects, content }, cmsBaseUrl())
})
```

- [ ] **Step 6: Revalidate route.** `app/api/revalidate/route.ts`:
```ts
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
```

- [ ] **Step 7:** check-types → pass. Commit `feat(web): cms client, queries, mappers and revalidate endpoint`.

---

# Phase C — Features

### Task 13: Role cycle and role state (TDD)

**Files:**
- Create: `apps/web/features/role/role-cycle.ts`, `apps/web/features/role/role-state.ts`, `apps/web/tests/unit/role/role-cycle.test.ts`, `apps/web/tests/unit/role/role-state.test.ts`

The single source of truth is an unbounded integer **position**; the role is `order[mod(position, count)]`. The drum angle and the picker rows derive from it, so both loop forever with no renormalisation.

- [ ] **Step 1: Failing tests.**
```ts
// role-cycle.test.ts
import { describe, expect, it } from 'vitest'
import { mod, shortestDelta } from '@/features/role/role-cycle'

describe('role-cycle', () => {
  it('mod is always positive', () => {
    expect(mod(-1, 3)).toBe(2)
    expect(mod(7, 3)).toBe(1)
  })
  it('shortestDelta picks the short way round', () => {
    expect(shortestDelta(0, 2, 3)).toBe(-1)
    expect(shortestDelta(2, 0, 3)).toBe(1)
    expect(shortestDelta(1, 1, 3)).toBe(0)
    expect(shortestDelta(0, 2, 4)).toBe(2)
  })
})
```
```ts
// role-state.test.ts
import { describe, expect, it } from 'vitest'
import { initialRoleState, roleIndex, roleReducer } from '@/features/role/role-state'

describe('roleReducer', () => {
  const s0 = initialRoleState(3, 0)
  it('steps forward and back, looping', () => {
    const s = roleReducer(roleReducer(s0, { type: 'step', delta: -1 }), { type: 'step', delta: -1 })
    expect(s.position).toBe(-2)
    expect(roleIndex(s)).toBe(1)
    expect(s.animate).toBe(true)
  })
  it('select moves the short way', () => {
    const s = roleReducer(s0, { type: 'select', index: 2 })
    expect(s.position).toBe(-1)
  })
  it('hydrate jumps without animation', () => {
    const s = roleReducer(s0, { type: 'hydrate', index: 2 })
    expect(roleIndex(s)).toBe(2)
    expect(s.animate).toBe(false)
  })
  it('select of the current role is a no-op', () => {
    expect(roleReducer(s0, { type: 'select', index: 0 })).toBe(s0)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement.**
```ts
// role-cycle.ts
export const mod = (n: number, m: number): number => ((n % m) + m) % m

export function shortestDelta(from: number, to: number, count: number): number {
  const d = mod(to - from, count)
  return d > count / 2 ? d - count : d
}
```
```ts
// role-state.ts
import { mod, shortestDelta } from './role-cycle'

export interface RoleState { position: number; count: number; animate: boolean }
export type RoleAction =
  | { type: 'step'; delta: number }
  | { type: 'select'; index: number }
  | { type: 'hydrate'; index: number }

export const initialRoleState = (count: number, index: number): RoleState => ({ position: index, count, animate: false })
export const roleIndex = (s: RoleState): number => mod(s.position, s.count)

export function roleReducer(state: RoleState, action: RoleAction): RoleState {
  switch (action.type) {
    case 'step':
      return action.delta === 0 ? state : { ...state, position: state.position + action.delta, animate: true }
    case 'select': {
      const delta = shortestDelta(roleIndex(state), action.index, state.count)
      return delta === 0 ? state : { ...state, position: state.position + delta, animate: true }
    }
    case 'hydrate':
      return action.index === roleIndex(state) ? state : { ...state, position: action.index, animate: false }
  }
}
```
- [ ] **Step 3:** PASS. Commit `feat(web): role cycle and reducer`.

---

### Task 14: RoleProvider, persistence and shortcuts

**Files:**
- Create: `apps/web/features/role/RoleProvider.tsx`, `apps/web/features/role/use-role-persistence.ts`, `apps/web/lib/dom/use-reduced-motion.ts`

- [ ] **Step 1: Reduced motion hook.** `lib/dom/use-reduced-motion.ts`:
```ts
'use client'
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
const subscribe = (cb: () => void) => {
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false)
```

- [ ] **Step 2: Provider.** `features/role/RoleProvider.tsx`:
```tsx
'use client'
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { Discipline } from '@/lib/cms/types'
import { initialRoleState, roleIndex, roleReducer } from './role-state'
import { useRolePersistence } from './use-role-persistence'

interface RoleContextValue {
  disciplines: Discipline[]
  current: Discipline
  index: number
  position: number
  animate: boolean
  step: (delta: number) => void
  select: (slug: string) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ disciplines, defaultSlug, children }: { disciplines: Discipline[]; defaultSlug: string; children: ReactNode }) {
  const slugs = useMemo(() => disciplines.map((d) => d.slug), [disciplines])
  const [state, dispatch] = useReducer(roleReducer, initialRoleState(disciplines.length, Math.max(0, slugs.indexOf(defaultSlug))))
  const index = roleIndex(state)

  const step = useCallback((delta: number) => dispatch({ type: 'step', delta }), [])
  const select = useCallback((slug: string) => {
    const i = slugs.indexOf(slug)
    if (i >= 0) dispatch({ type: 'select', index: i })
  }, [slugs])
  const hydrate = useCallback((slug: string) => {
    const i = slugs.indexOf(slug)
    if (i >= 0) dispatch({ type: 'hydrate', index: i })
  }, [slugs])

  useRolePersistence({ slugs, currentSlug: slugs[index] ?? '', hydrate, select })

  const value = useMemo<RoleContextValue>(() => ({
    disciplines, current: disciplines[index]!, index, position: state.position, animate: state.animate, step, select,
  }), [disciplines, index, state.position, state.animate, step, select])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext)
  if (!value) throw new Error('useRole must be used inside <RoleProvider>')
  return value
}
```

- [ ] **Step 3: Persistence (fixes Q2 and Q4).** `features/role/use-role-persistence.ts`:
```ts
'use client'
import { useEffect, useLayoutEffect, useRef } from 'react'

const STORAGE_KEY = 'role'

interface Options { slugs: string[]; currentSlug: string; hydrate: (slug: string) => void; select: (slug: string) => void }

const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function useRolePersistence({ slugs, currentSlug, hydrate, select }: Options) {
  const hydrated = useRef(false)

  // Before first paint: apply hash or stored role without animation (Q4).
  useLayoutEffect(() => {
    const fromHash = location.hash.slice(1)
    const initial = slugs.includes(fromHash) ? fromHash : readStored()
    if (initial) hydrate(initial)
    hydrated.current = true
  }, [slugs, hydrate])

  // Side effects live here, never in the reducer (Q2).
  useEffect(() => {
    if (!hydrated.current || !currentSlug) return
    try { localStorage.setItem(STORAGE_KEY, currentSlug) } catch { /* storage unavailable */ }
    if (location.hash.slice(1) !== currentSlug) history.replaceState(null, '', `#${currentSlug}`)
  }, [currentSlug])

  // Deep links and the 1..n shortcuts.
  useEffect(() => {
    const onHash = () => select(location.hash.slice(1))
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= slugs.length) select(slugs[n - 1]!)
    }
    addEventListener('hashchange', onHash)
    document.addEventListener('keydown', onKey)
    return () => {
      removeEventListener('hashchange', onHash)
      document.removeEventListener('keydown', onKey)
    }
  }, [slugs, select])
}
```
Note: on the very first render the effect writes the default slug to the hash only after hydration ran; if nothing was stored this sets `#<default>`, which is acceptable.

- [ ] **Step 4:** check-types → pass. Commit `feat(web): role provider with pre-paint hydration and persistence`.

---

### Task 15: RoleDrum (CSS 3D prism) and RoleHeadline

**Files:**
- Create: `apps/web/features/role/RoleDrum.tsx`, `apps/web/features/role/RoleDrum.module.css`, `apps/web/features/role/RoleHeadline.tsx`

Behaviour reference: template `globals.css` lines 75–92 (`.reel`, dashed underline via mask, focus ring, `.tail` padding 9px) and `plate1.js` drum section (roll easing). Width animates to the current face's text width (`transition: width .5s var(--ease-out)`).

- [ ] **Step 1: `RoleDrum.tsx`:**
```tsx
'use client'
import { forwardRef, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { useRole } from './RoleProvider'
import styles from './RoleDrum.module.css'

const FACE_HEIGHT = 36

export const RoleDrum = forwardRef<HTMLButtonElement, { expanded: boolean }>(function RoleDrum({ expanded }, ref) {
  const { disciplines, current, index, position, animate } = useRole()
  const reduce = useReducedMotion()
  const count = disciplines.length
  const angle = 360 / count
  const radius = count > 2 ? FACE_HEIGHT / 2 / Math.tan(Math.PI / count) : FACE_HEIGHT / 2
  const faces = useRef<(HTMLSpanElement | null)[]>([])
  const [width, setWidth] = useState<number>()

  useLayoutEffect(() => {
    setWidth(faces.current[index]?.scrollWidth)
  }, [index, disciplines])

  const style = {
    '--drum-angle': `${-position * angle}deg`,
    '--drum-radius': `${radius}px`,
    width: width ? `${width + 2}px` : undefined,
  } as CSSProperties

  return (
    <button
      ref={ref}
      type="button"
      className={styles.drum}
      data-animate={animate && !reduce ? 'true' : 'false'}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      aria-label={`${current.title}. Open the role list.`}
      style={style}
    >
      <span className={styles.prism} aria-hidden="true">
        {disciplines.map((d, i) => (
          <span
            key={d.slug}
            ref={(el) => { faces.current[i] = el }}
            className={styles.face}
            style={{ '--face-angle': `${i * angle}deg` } as CSSProperties}
          >
            {d.title}
          </span>
        ))}
      </span>
    </button>
  )
})
```

- [ ] **Step 2: `RoleDrum.module.css`:**
```css
.drum {
  position: relative; display: block; flex: 0 0 auto; height: 36px; padding: 0; margin: 0;
  border: 0; background: none; color: inherit; font: inherit; cursor: pointer;
  perspective: 240px; touch-action: manipulation;
  transition: width .5s var(--ease-out);
}
.drum::after {
  content: ''; position: absolute; left: 0; right: 2px; bottom: 2px; height: 2px;
  background: var(--rule); opacity: .85; transition: var(--theme-transition);
  mask-image: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 10px);
}
.drum:hover::after, .drum:focus-visible::after { background: var(--ink-soft); }
.drum:focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 3px; border-radius: 3px; }
.prism {
  position: absolute; inset: 0; transform-style: preserve-3d;
  transform: translateZ(calc(var(--drum-radius) * -1)) rotateX(var(--drum-angle));
}
.drum[data-animate='true'] .prism { transition: transform .62s var(--ease-out); }
.face {
  position: absolute; left: 0; top: 0; height: 36px; line-height: 36px; white-space: nowrap;
  color: var(--ink-soft); backface-visibility: hidden; transition: var(--theme-transition);
  transform: rotateX(var(--face-angle)) translateZ(var(--drum-radius));
}
```
(Faces rotate by `+i·θ` and the prism by `−position·θ`, so the current face faces the viewer. Verify visually that stepping down rolls upward like the reference; if the direction is inverted, flip the sign of `--drum-angle`.)

- [ ] **Step 3: `RoleHeadline.tsx`** — composes name, drum + picker, tail, and the status line:
```tsx
'use client'
import { useRef, useState } from 'react'
import { RoleDrum } from './RoleDrum'
import { RolePicker } from './RolePicker'
import { useRole } from './RoleProvider'

export function RoleHeadline({ name, tail, hint }: { name: string; tail: string; hint: string }) {
  const { current } = useRole()
  const drumRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <h1 data-anchor="headline">
        <span className="who">{name}</span>
        <span className="what">
          <RolePicker drumRef={drumRef} open={open} onOpenChange={setOpen} hint={hint}>
            <RoleDrum ref={drumRef} expanded={open} />
          </RolePicker>
          <span className="tail">{tail}</span>
        </span>
      </h1>
      <p className="sr-only" role="status">{current.title} selected</p>
    </>
  )
}
```
Add `h1 .what { display: flex; align-items: center; flex-wrap: wrap; min-height: 40px }` and `.what .tail { white-space: pre; padding-left: 9px }` to `base.css` if not already there. (`RolePicker` is created in Task 16 — commit both together.)

---

### Task 16: RolePicker with a non-passive wheel (fixes Q1)

**Files:**
- Create: `apps/web/features/role/use-wheel-step.ts`, `apps/web/features/role/RolePicker.tsx`, `apps/web/features/role/RolePicker.module.css`, `apps/web/tests/unit/role/wheel-accumulator.test.ts`

- [ ] **Step 1: Failing test for the accumulator** (pure part of the hook):
```ts
import { describe, expect, it } from 'vitest'
import { createWheelAccumulator } from '@/features/role/use-wheel-step'

describe('wheel accumulator', () => {
  it('steps once per 26px and respects the 170ms cooldown', () => {
    const acc = createWheelAccumulator()
    expect(acc.push(10, 0)).toBe(0)
    expect(acc.push(20, 5)).toBe(1)
    expect(acc.push(100, 50)).toBe(0) // cooling down
    expect(acc.push(100, 200)).toBe(1)
    expect(acc.push(-30, 400)).toBe(-1)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement `use-wheel-step.ts`:**
```ts
'use client'
import { useEffect, type RefObject } from 'react'

const THRESHOLD = 26
const COOLDOWN_MS = 170

export function createWheelAccumulator() {
  let acc = 0
  let coolUntil = 0
  return {
    push(deltaY: number, now: number): -1 | 0 | 1 {
      acc += deltaY
      if (now < coolUntil || Math.abs(acc) < THRESHOLD) return 0
      const dir = acc > 0 ? 1 : -1
      acc = 0
      coolUntil = now + COOLDOWN_MS
      return dir
    },
  }
}

/** Native, non-passive wheel listener: React's onWheel is passive, so preventDefault is ignored (Q1). */
export function useWheelStep(ref: RefObject<HTMLElement | null>, enabled: boolean, onStep: (dir: -1 | 1) => void) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const acc = createWheelAccumulator()
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dir = acc.push(e.deltaY, performance.now())
      if (dir) onStep(dir)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, enabled, onStep])
}
```

- [ ] **Step 3: `RolePicker.tsx`.** Virtual window: rows are rendered for positions `position-2 … position+2`, keyed by position, each translated to `(p - position + 1) * 42px`. Row transforms transition, so the list rolls forever with no renormalisation. The wheel listener is attached to the **whole wrapper** while open.
```tsx
'use client'
import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { mod } from './role-cycle'
import { useRole } from './RoleProvider'
import { useWheelStep } from './use-wheel-step'
import styles from './RolePicker.module.css'

const ROW = 42
const SOFT_CLOSE_MS = 160
const WINDOW = [-2, -1, 0, 1, 2]

interface Props {
  drumRef: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  hint: string
  children: ReactNode
}

export function RolePicker({ drumRef, open, onOpenChange, hint, children }: Props) {
  const { disciplines, position, step, animate } = useRole()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef(0)
  const suppressHover = useRef(false)

  const show = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    if (!suppressHover.current) onOpenChange(true)
  }, [onOpenChange])
  const hide = useCallback(() => onOpenChange(false), [onOpenChange])
  const softHide = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(hide, SOFT_CLOSE_MS)
  }, [hide])

  useWheelStep(wrapRef, open, step)

  // drum: click toggles, keys step, Escape closes
  useEffect(() => {
    const drum = drumRef.current
    if (!drum) return
    const onClick = () => {
      if (open) { hide(); suppressHover.current = true } else show()
    }
    const onKey = (e: KeyboardEvent) => {
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
      if (dir) { e.preventDefault(); show(); step(dir) }
      else if (e.key === 'Escape') hide()
    }
    drum.addEventListener('click', onClick)
    drum.addEventListener('keydown', onKey)
    drum.addEventListener('focus', show)
    return () => {
      drum.removeEventListener('click', onClick)
      drum.removeEventListener('keydown', onKey)
      drum.removeEventListener('focus', show)
    }
  }, [drumRef, open, show, hide, step])

  // click outside closes
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) hide() }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open, hide])

  // touch: drag to step
  const drag = useRef<{ y: number; stepped: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, stepped: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const target = Math.round((drag.current.y - e.clientY) / ROW)
    if (target !== drag.current.stepped) { step(target - drag.current.stepped); drag.current.stepped = target }
  }
  const endDrag = () => { drag.current = null }

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      data-open={open}
      onMouseEnter={show}
      onMouseLeave={() => { suppressHover.current = false; softHide() }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) softHide() }}
      data-anchor="role"
    >
      {children}
      <span className={styles.wheel} role="listbox" aria-label="Choose a role" hidden={!open}>
        <span className={styles.window} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span className={styles.selection} aria-hidden="true" />
          {WINDOW.map((offset) => {
            const p = position + offset
            const d = disciplines[mod(p, disciplines.length)]!
            return (
              <span
                key={p}
                role="option"
                aria-selected={offset === 0}
                className={styles.row}
                data-current={offset === 0}
                data-animate={animate}
                style={{ transform: `translateY(${(offset + 1) * ROW}px)` }}
                onClick={() => (offset === 0 ? hide() : step(offset))}
              >
                <span className={styles.name}>{d.title}</span>
                <span className={styles.meta}>{d.level}</span>
              </span>
            )
          })}
        </span>
        <span className={styles.hint} aria-hidden="true">
          <svg width="8" height="11" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 1.4v9.2M1.6 4.3 4.5 1.2l2.9 3.1M1.6 7.7l2.9 3.1 2.9-3.1" />
          </svg>
          {hint}
        </span>
      </span>
    </span>
  )
}
```
Note on keys: React reuses the element with key `p` across renders, so its `transform` transitions from the old offset to the new one; elements entering the window mount at the edge (masked).

- [ ] **Step 4: `RolePicker.module.css`.** Port template `globals.css` lines 171–251 (`#wheel`, `.win`, `.sel`, `.row`, `.nm`, `.mt`, `.hint`, masks, shadows, dark variants), mapped to `.wrap`, `.wheel`, `.window`, `.selection`, `.row`, `.name`, `.meta`, `.hint`. Required additions:
  - `.wrap { position: relative; overscroll-behavior: contain; }`
  - `.window { height: calc(var(--picker-row) * 3); overflow: hidden; overscroll-behavior: contain; touch-action: none; position: relative; }`
  - `.row { position: absolute; left: 0; right: 0; top: calc(var(--picker-row) * -1); height: var(--picker-row); }` and `.row[data-animate='true'] { transition: transform .28s var(--ease-snap); }`
  - `.wheel` is absolutely positioned over the drum (same offsets as the template's `#wheel`) and hidden until open; append `var(--theme-transition)` to every rule that sets a colour.
  - `@media (prefers-reduced-motion: reduce) { .row { transition: none } }`

- [ ] **Step 5:** unit tests PASS; check-types → pass. Commit `feat(web): role drum, headline and picker with non-passive wheel`.

---

### Task 17: Word morph core (TDD)

**Files:**
- Create: `apps/web/features/bio/morph/tokenize.ts`, `apps/web/features/bio/morph/lcs.ts`, `apps/web/features/bio/morph/render.ts`, tests under `apps/web/tests/unit/bio/`

- [ ] **Step 1: Failing tests.**
```ts
// tokenize.test.ts
import { describe, expect, it } from 'vitest'
import { splitStrong, tokenize } from '@/features/bio/morph/tokenize'

describe('tokenize', () => {
  it('splits multi-word strong into single-word strongs', () => {
    expect(splitStrong('<strong>a b</strong>')).toBe('<strong>a</strong> <strong>b</strong>')
  })
  it('keeps chip links and the curious toggle atomic', () => {
    const html = 'at <a class="fav" href="#"><i class="chip">A</i><span>Auto doc</span></a>, <button class="curiosity-trigger" type="button">x y</button>.'
    expect(tokenize(html).map((t) => t.text)).toEqual(['at', '<a class="fav" href="#"><i class="chip">A</i><span>Auto doc</span></a>', ',', '<button class="curiosity-trigger" type="button">x y</button>', '.'])
  })
  it('records the exact whitespace after each token (no space before punctuation)', () => {
    expect(tokenize('<strong>x</strong>. y')).toEqual([
      { text: '<strong>x</strong>', sep: '' },
      { text: '.', sep: ' ' },
      { text: 'y', sep: '' },
    ])
  })
})
```
(Expected values verified against the reference regex from `logic1.js` line 10.)
```ts
// lcs.test.ts
import { describe, expect, it } from 'vitest'
import { lcsKeep } from '@/features/bio/morph/lcs'

describe('lcsKeep', () => {
  it('keeps the common subsequence', () => {
    const { keepA, keepB } = lcsKeep(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd'])
    expect([...keepA]).toEqual([0, 2, 3])
    expect([...keepB]).toEqual([0, 2, 3])
  })
  it('handles empty input', () => {
    expect(lcsKeep([], ['a']).keepB.size).toBe(0)
  })
})
```
```ts
// render.test.ts
import { describe, expect, it } from 'vitest'
import { planMorph, renderParagraphs } from '@/features/bio/morph/render'

describe('render', () => {
  it('renders every word as a span with spaces outside the span', () => {
    expect(renderParagraphs(['a b'])).toBe('<p><span class="w">a</span> <span class="w">b</span></p>')
  })
  it('plans which old words leave and which new words enter', () => {
    const plan = planMorph(['I am <strong>plumber</strong>.'], ['I am <strong>janitor</strong>.'])
    expect([...plan.leaving[0]!]).toEqual([2])
    expect(plan.nextHtml).toBe('<p><span class="w">I</span> <span class="w">am</span> <span class="w in"><strong>janitor</strong></span><span class="w">.</span></p>')
  })
  it('treats a missing previous paragraph as all-new', () => {
    const plan = planMorph([], ['a'])
    expect(plan.nextHtml).toContain('w in')
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement.**
```ts
// tokenize.ts
export interface Token { text: string; sep: string }

const TOKEN = /<a class="fav"[\s\S]*?<\/a>|<button class="curiosity-trigger"[\s\S]*?<\/button>|<strong>[\s\S]*?<\/strong>|[^\s]+/g

export const splitStrong = (html: string): string =>
  html.replace(/<strong>([^<]*)<\/strong>/g, (_, inner: string) =>
    inner.trim().split(/\s+/).map((w) => `<strong>${w}</strong>`).join(' '))

export function tokenize(raw: string): Token[] {
  const html = splitStrong(raw)
  const out: Token[] = []
  let end = 0
  for (const m of html.matchAll(TOKEN)) {
    const last = out.at(-1)
    if (last) last.sep = html.slice(end, m.index)
    out.push({ text: m[0], sep: '' })
    end = m.index + m[0].length
  }
  return out
}
```
```ts
// lcs.ts
export function lcsKeep(a: string[], b: string[]): { keepA: Set<number>; keepB: Set<number> } {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const keepA = new Set<number>(), keepB = new Set<number>()
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { keepA.add(i); keepB.add(j); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  return { keepA, keepB }
}
```
```ts
// render.ts
import { lcsKeep } from './lcs'
import { tokenize, type Token } from './tokenize'

const wrap = (tokens: Token[], isKept: (i: number) => boolean, cls: string) =>
  tokens.map((t, i) => `<span class="w${isKept(i) ? '' : ` ${cls}`}">${t.text}</span>${t.sep}`).join('')

const paragraph = (inner: string) => `<p>${inner}</p>`

export const renderParagraphs = (paragraphs: string[]): string =>
  paragraphs.map((p) => paragraph(wrap(tokenize(p), () => true, ''))).join('')

export interface MorphPlan { leaving: Set<number>[]; nextHtml: string }

export function planMorph(prev: string[], next: string[]): MorphPlan {
  const plans = next.map((p, k) => {
    const a = tokenize(prev[k] ?? ''), b = tokenize(p)
    return { a, b, ...lcsKeep(a.map((t) => t.text), b.map((t) => t.text)) }
  })
  return {
    leaving: plans.map(({ a, keepA }) => new Set(a.map((_, i) => i).filter((i) => !keepA.has(i)))),
    nextHtml: plans.map(({ b, keepB }) => paragraph(wrap(b, (i) => keepB.has(i), 'in'))).join(''),
  }
}
```
- [ ] **Step 3:** PASS. Commit `feat(web): word morph core`.

---

### Task 18: Bio component and morph hook, curious toggle delegation

**Files:**
- Create: `apps/web/features/bio/use-word-morph.ts`, `apps/web/features/bio/Bio.tsx`, `apps/web/features/bio/Bio.module.css`, `apps/web/features/curious/CuriousProvider.tsx`

- [ ] **Step 1: `CuriousProvider.tsx`** (state only; overlay in Task 22):
```tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'curious'
interface CuriousValue { on: boolean; toggle: () => void }
const CuriousContext = createContext<CuriousValue | null>(null)

export function CuriousProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  const [ready, setReady] = useState(false) // don't overwrite storage before it was read
  useEffect(() => {
    try { setOn(localStorage.getItem(STORAGE_KEY) === '1') } catch { /* storage unavailable */ }
    setReady(true)
  }, [])
  const toggle = useCallback(() => setOn((v) => !v), [])
  useEffect(() => {
    document.documentElement.toggleAttribute('data-curious', on)
    if (!ready) return
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0') } catch { /* storage unavailable */ }
  }, [on, ready])
  const value = useMemo(() => ({ on, toggle }), [on, toggle])
  return <CuriousContext.Provider value={value}>{children}</CuriousContext.Provider>
}

export function useCurious(): CuriousValue {
  const v = useContext(CuriousContext)
  if (!v) throw new Error('useCurious must be used inside <CuriousProvider>')
  return v
}
```

- [ ] **Step 2: `use-word-morph.ts`** — the two-phase dance, imperative on purpose (React must not reconcile these spans):
```ts
'use client'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { planMorph, renderParagraphs } from './morph/render'

// Layout effect: the non-animated hydrate path (Q4) must rewrite the DOM before first paint.

const SWAP_MS = 240
const STAGGER_MS = 9
const STAGGER_GROUP = 14

interface Options { animate: boolean; reduce: boolean; onRender: () => void }

export function useWordMorph(ref: RefObject<HTMLElement | null>, paragraphs: string[], { animate, reduce, onRender }: Options) {
  const shown = useRef(paragraphs)
  const pending = useRef<{ timer: number; paragraphs: string[] } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shown.current === paragraphs) return
    const prev = shown.current
    shown.current = paragraphs

    // a morph still in flight is flushed first, so fast switching never leaves a half-rewritten bio
    if (pending.current) {
      window.clearTimeout(pending.current.timer)
      el.innerHTML = renderParagraphs(pending.current.paragraphs)
      pending.current = null
    }
    if (!animate || reduce) {
      el.innerHTML = renderParagraphs(paragraphs)
      onRender()
      return
    }
    const plan = planMorph(prev, paragraphs)
    Array.from(el.children).forEach((p, k) => {
      p.querySelectorAll('.w').forEach((w, i) => { if (plan.leaving[k]?.has(i)) w.classList.add('out') })
    })
    const timer = window.setTimeout(() => {
      pending.current = null
      el.innerHTML = plan.nextHtml
      onRender()
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.querySelectorAll<HTMLElement>('.w.in').forEach((w, i) => {
          w.style.transitionDelay = `${(i % STAGGER_GROUP) * STAGGER_MS}ms`
          w.classList.remove('in')
        })
      }))
    }, SWAP_MS)
    pending.current = { timer, paragraphs }
  }, [ref, paragraphs, animate, reduce, onRender])

  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current.timer) }, [])
}
```

- [ ] **Step 3: `Bio.tsx`:**
```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurious } from '@/features/curious/CuriousProvider'
import { useRole } from '@/features/role/RoleProvider'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { CURIOUS_TRIGGER_CLASS } from '@/shared/ui/chip-markup'
import { renderParagraphs } from './morph/render'
import { useWordMorph } from './use-word-morph'
import styles from './Bio.module.css'

export function Bio() {
  const { current, animate } = useRole()
  const { on, toggle } = useCurious()
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // server-rendered once; after that the morph owns the DOM
  const [initialHtml] = useState(() => renderParagraphs(current.bio))

  const syncToggle = useCallback(() => {
    ref.current?.querySelectorAll(`.${CURIOUS_TRIGGER_CLASS}`).forEach((b) => b.setAttribute('aria-checked', String(on)))
  }, [on])
  useEffect(syncToggle, [syncToggle])
  useWordMorph(ref, current.bio, { animate, reduce, onRender: syncToggle })

  // the toggle lives inside CMS-authored markup that is replaced on every morph: delegate
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest(`.${CURIOUS_TRIGGER_CLASS}`)) { e.preventDefault(); toggle() }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [toggle])

  return <div ref={ref} className={styles.bio} data-anchor="bio" dangerouslySetInnerHTML={{ __html: initialHtml }} suppressHydrationWarning />
}
```

- [ ] **Step 4: `Bio.module.css`.** `.bio` grid gap 16px, body copy styles; `.bio :global(strong)` (500, `--ink`, `transition: var(--theme-transition)`); word classes from template `globals.css` lines 94–97 under `.bio :global(.w)`, `.bio :global(.w.out)`, `.bio :global(.w.in)` with `transition: opacity .28s ease, transform .34s cubic-bezier(.2,.8,.2,1), filter .28s ease, var(--theme-transition)`; the curious pill from the template's curious section (search `.curiosity-trigger`, `.curiosity-switch-track`, `.curiosity-switch-thumb`) under `.bio :global(...)`; `[aria-checked='true']` state uses `--accent`.

- [ ] **Step 5:** check-types → pass. Commit `feat(web): morphing bio with delegated curious toggle`.

---

### Task 19: Theme hook, audio, rocker and WallSwitch (TDD for atlas math)

**Files:**
- Create: `apps/web/features/theme/use-theme.ts`, `apps/web/lib/audio/{context,click,bulb,thud,poof}.ts`, `apps/web/features/theme/rocker-atlas.ts`, `apps/web/features/theme/use-rocker.ts`, `apps/web/features/theme/WallSwitch.tsx`, `apps/web/features/theme/WallSwitch.module.css`, `apps/web/tests/unit/theme/rocker-atlas.test.ts`
- Copy assets: `docs/template-portfolio/public/theme-switch/*` → `apps/web/public/theme-switch/`, `docs/template-portfolio/public/sound/bulb-explode.mp3` → `apps/web/public/sound/`

- [ ] **Step 1: Failing atlas tests.**
```ts
import { describe, expect, it } from 'vitest'
import { ATLAS, flipDuration, frameAt, frameOrigin, isValidAtlas, smoothstep } from '@/features/theme/rocker-atlas'

describe('rocker atlas', () => {
  it('validates the 5×4 grid of 212×280 frames', () => {
    expect(isValidAtlas(1060, 1120)).toBe(true)
    expect(isValidAtlas(1060, 1000)).toBe(false)
  })
  it('maps progress to frames', () => {
    expect(frameAt(0)).toBe(0)
    expect(frameAt(1)).toBe(ATLAS.frames - 1)
    expect(frameAt(0.5)).toBe(8)
  })
  it('finds frame origins', () => {
    expect(frameOrigin(7)).toEqual({ sx: 2 * 212, sy: 280 })
  })
  it('eases and times flips', () => {
    expect(smoothstep(0.5)).toBe(0.5)
    expect(flipDuration(1, false)).toBe(200)
    expect(flipDuration(1, true)).toBe(115)
  })
})
```
Run → FAIL.

- [ ] **Step 2: `rocker-atlas.ts`:**
```ts
export const ATLAS = { src: '/theme-switch/rocker-atlas.webp', frames: 17, columns: 5, width: 212, height: 280 } as const

export const isValidAtlas = (w: number, h: number) =>
  w === ATLAS.width * ATLAS.columns && h === ATLAS.height * Math.ceil(ATLAS.frames / ATLAS.columns)

export const frameAt = (progress: number) => Math.round(Math.min(1, Math.max(0, progress)) * (ATLAS.frames - 1))

export const frameOrigin = (n: number) => ({
  sx: (n % ATLAS.columns) * ATLAS.width,
  sy: Math.floor(n / ATLAS.columns) * ATLAS.height,
})

export const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** 200ms per full flip; 115ms when clicks come faster than 300ms apart. */
export const flipDuration = (distance: number, rapid: boolean) => (rapid ? 115 : 200) * Math.abs(distance)
```
PASS.

- [ ] **Step 3: `use-theme.ts`** — the DOM attribute is the single source of truth:
```ts
'use client'
import { useSyncExternalStore } from 'react'
import { currentTheme, type Theme } from './theme-dom'

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  const onStorage = (e: StorageEvent) => { if (e.key === 'theme') cb() }
  addEventListener('storage', onStorage)
  return () => { mo.disconnect(); mq.removeEventListener('change', cb); removeEventListener('storage', onStorage) }
}

export const useTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme, () => 'light')
```

- [ ] **Step 4: Audio.** `lib/audio/context.ts`:
```ts
let ctx: AudioContext | null = null

/** Lazily created on the first user gesture and shared by every sound (autoplay policy). */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function safely(play: (ctx: AudioContext) => void): void {
  const c = audioContext()
  if (!c) return
  try { play(c) } catch { /* audio is decoration; never break the interaction */ }
}
```
`click.ts` — port `clickSound` from `reference/parts/logic1.js` lines 140–160 verbatim in behaviour as `export function playClick(to: Theme): void { safely((t) => { … }) }` (65ms LCG-seeded buffer, bandpass 1450/1050Hz ramping ×0.74, Q .72, gain .115/.105). `thud.ts` — port `thud(v)` from `blowout1.js` lines 51–66 as `playThud(strength: number)`. `poof.ts` — port `poof()` from `blowout1.js` lines 179–190 as `playPoof()`. `bulb.ts` — port `loadBulb`/`pop` from `blowout1.js` lines 23–50 as `preloadBulb(): void` and `playBulb(): void`, using `'/sound/bulb-explode.mp3'` and falling back to `new Audio(url)` when not yet decoded. Each file ≤ 40 lines, each exported function wrapped in `safely`.

- [ ] **Step 5: `use-rocker.ts`** — draws frames on the canvas; snaps an in-flight flip to its end before starting a new one; reduced motion jumps:
```ts
'use client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ATLAS, flipDuration, frameAt, frameOrigin, isValidAtlas, smoothstep } from './rocker-atlas'

export function useRocker(canvasRef: RefObject<HTMLCanvasElement | null>, initial: 0 | 1, reduce: boolean) {
  const atlas = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)
  const now = useRef<number>(initial)
  const target = useRef<number>(initial)
  const raf = useRef(0)

  const draw = useCallback((p: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !atlas.current) return
    const { sx, sy } = frameOrigin(frameAt(p))
    ctx.clearRect(0, 0, ATLAS.width, ATLAS.height)
    ctx.drawImage(atlas.current, sx, sy, ATLAS.width, ATLAS.height, 0, 0, ATLAS.width, ATLAS.height)
    now.current = p
  }, [canvasRef])

  useEffect(() => {
    const img = new Image()
    img.decoding = 'async'
    img.src = ATLAS.src
    img.decode().then(() => {
      if (!isValidAtlas(img.naturalWidth, img.naturalHeight)) throw new Error('invalid rocker atlas')
      atlas.current = img
      draw(now.current)
      setReady(true)
    }).catch(() => setReady(false))
    return () => cancelAnimationFrame(raf.current)
  }, [draw])

  /** `instant` jumps (first sync after hydration); a flip already heading to `to` is left alone. */
  const flipTo = useCallback((to: 0 | 1, rapid = false, instant = false) => {
    if (raf.current && target.current === to) return
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; draw(target.current) }
    target.current = to
    if (!atlas.current || reduce || instant || now.current === to) { now.current = to; draw(to); return }
    const from = now.current, start = performance.now(), duration = flipDuration(to - from, rapid)
    const tick = (t: number) => {
      const o = Math.min(1, Math.max(0, (t - start) / duration))
      draw(from + (to - from) * smoothstep(o))
      raf.current = o < 1 ? requestAnimationFrame(tick) : 0
    }
    raf.current = requestAnimationFrame(tick)
  }, [draw, reduce])

  return { ready, flipTo }
}
```

- [ ] **Step 6: `WallSwitch.tsx`** — markup from template `body1.html` lines 4–12, with the blowout hook wired in Task 21 (leave a `onToggled` prop for now):
```tsx
'use client'
import { forwardRef, useEffect, useRef } from 'react'
import { playClick } from '@/lib/audio/click'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { applyTheme, currentTheme, stampThemeTransition } from './theme-dom'
import { useRocker } from './use-rocker'
import { useTheme } from './use-theme'
import styles from './WallSwitch.module.css'

const RAPID_MS = 300

interface Props { disabled?: () => boolean; onToggled?: () => void }

export const WallSwitch = forwardRef<HTMLDivElement, Props>(function WallSwitch({ disabled, onToggled }, ref) {
  const theme = useTheme()
  const reduce = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { ready, flipTo } = useRocker(canvasRef, theme === 'dark' ? 1 : 0, reduce)
  const lastToggle = useRef(0)

  // keep the rocker on the right frame when the theme changes from outside (system, other tab, blowout);
  // the first sync after hydration jumps, so a dark page doesn't flip on load
  const synced = useRef(false)
  useEffect(() => {
    flipTo(theme === 'dark' ? 1 : 0, false, !synced.current)
    synced.current = true
  }, [theme, flipTo])

  const onClick = () => {
    if (disabled?.()) return
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    const t = performance.now(), rapid = t - lastToggle.current < RAPID_MS
    lastToggle.current = t
    if (!reduce) stampThemeTransition()
    applyTheme(next)
    playClick(next)
    flipTo(next === 'dark' ? 1 : 0, rapid)
    onToggled?.()
  }

  const dark = theme === 'dark'
  return (
    <div ref={ref} className={styles.switcher} data-anchor="switch">
      <button type="button" className={styles.toggle} onClick={onClick} aria-pressed={dark} aria-label={dark ? 'Turn the lights on' : 'Turn the lights off'}>
        <span className={styles.stage} data-motion-ready={ready} aria-hidden="true">
          <img className={`${styles.image} ${styles.light}`} src="/theme-switch/rocker-on.webp" alt="" width={530} height={700} decoding="async" />
          <img className={`${styles.image} ${styles.dark}`} src="/theme-switch/rocker-off.webp" alt="" width={530} height={700} decoding="async" />
          <canvas ref={canvasRef} className={`${styles.image} ${styles.motion}`} width={212} height={280} />
        </span>
      </button>
    </div>
  )
})
```
Note: the click flips the rocker and then the theme effect asks for the same frame. The first line of `flipTo` ignores that second request, so the click's flip is never snapped.

- [ ] **Step 7: `WallSwitch.module.css`** — port template `globals.css` lines 113–127 (`.theme-switcher` → `.switcher` incl. the `max-width: 900px` fixed rule, `.theme-wall-toggle` → `.toggle`, `.theme-wall-stage` → `.stage` with the two drop-shadows using `--wall-contact`/`--wall-cast`, `.theme-wall-image` → `.image`, state visibility rules → `.light`/`.dark`/`.motion` with `:global(:root[data-theme='dark'])` and the `prefers-color-scheme` variants).

- [ ] **Step 8:** unit tests PASS; check-types → pass. Commit `feat(web): theme hook, audio and the photographic wall switch`.

---

### Task 20: Blowout physics and click window (TDD)

**Files:**
- Create: `apps/web/features/blowout/physics.ts`, `apps/web/features/blowout/click-window.ts`, tests `apps/web/tests/unit/blowout/{physics,click-window}.test.ts`

- [ ] **Step 1: Failing tests.**
```ts
// click-window.test.ts
import { describe, expect, it } from 'vitest'
import { createClickWindow } from '@/features/blowout/click-window'

describe('click window', () => {
  it('is quiet for 5 clicks, flickers from 6, blows on 10', () => {
    const w = createClickWindow()
    const results = Array.from({ length: 10 }, (_, i) => w.register(i * 100))
    expect(results.slice(0, 5).every((r) => r.kind === 'quiet' || r.kind === 'preload')).toBe(true)
    expect(results[5]).toEqual({ kind: 'flicker', level: 1 })
    expect(results[8]).toEqual({ kind: 'flicker', level: 4 })
    expect(results[9]).toEqual({ kind: 'blow' })
  })
  it('asks to preload the bulb on the 2nd fast click', () => {
    const w = createClickWindow()
    w.register(0)
    expect(w.register(100)).toEqual({ kind: 'preload' })
  })
  it('forgets clicks older than 4s', () => {
    const w = createClickWindow()
    for (let i = 0; i < 9; i++) w.register(i)
    expect(w.register(10_000).kind).toBe('quiet')
  })
})
```
```ts
// physics.test.ts
import { describe, expect, it } from 'vitest'
import { GRAVITY, stepBody, type Body } from '@/features/blowout/physics'

const bounds = { minX: 2, maxX: 1000, floor: 800 }
const body = (over: Partial<Body> = {}): Body => ({ x: 100, y: 100, vx: 0, vy: 0, angle: 0, spin: 0, ...over })

describe('stepBody', () => {
  it('falls under gravity', () => {
    const { body: b } = stepBody(body(), 0.01, bounds, () => 0.5)
    expect(b.vy).toBeCloseTo(GRAVITY * 0.01)
  })
  it('bounces off the floor with restitution and reports impact strength', () => {
    const { body: b, impact } = stepBody(body({ y: 800, vy: 800 }), 0.001, bounds, () => 0.5)
    expect(b.vy).toBeLessThan(0)
    expect(impact).toBeGreaterThan(0)
  })
  it('bounces off walls at half speed', () => {
    const { body: b } = stepBody(body({ x: 0, vx: -100 }), 0.001, bounds, () => 0.5)
    expect(b.x).toBe(2)
    expect(b.vx).toBeCloseTo(50)
  })
  it('settles toward the nearest right angle when resting', () => {
    const { body: b } = stepBody(body({ y: 800, vy: 10, angle: 1.4 }), 0.016, bounds, () => 0.5)
    expect(Math.abs(b.angle - Math.PI / 2)).toBeLessThan(Math.abs(1.4 - Math.PI / 2))
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** `click-window.ts`:
```ts
const WINDOW_MS = 4000
const NEEDED = 10
const WARN = 6
const MAX_LEVEL = 4

export type ClickResult = { kind: 'quiet' } | { kind: 'preload' } | { kind: 'flicker'; level: number } | { kind: 'blow' }

export function createClickWindow() {
  let clicks: number[] = []
  return {
    register(now: number): ClickResult {
      clicks = [...clicks.filter((t) => now - t <= WINDOW_MS), now]
      if (clicks.length >= NEEDED) { clicks = []; return { kind: 'blow' } }
      if (clicks.length >= WARN) return { kind: 'flicker', level: Math.min(MAX_LEVEL, clicks.length - WARN + 1) }
      if (clicks.length >= 2) return { kind: 'preload' }
      return { kind: 'quiet' }
    },
    reset() { clicks = [] },
  }
}
```
`physics.ts` (constants and branches from `blowout1.js` lines 104–120):
```ts
export const GRAVITY = 2700
const WALL_BOUNCE = 0.5
const FLOOR_RESTITUTION = 0.34
const BOUNCE_MIN_SPEED = 160
const FRICTION = 0.82
const RIGHT_ANGLE = Math.PI / 2

export interface Body { x: number; y: number; vx: number; vy: number; angle: number; spin: number }
export interface Bounds { minX: number; maxX: number; floor: number }
export interface StepResult { body: Body; impact?: number }

export function stepBody(b: Body, dt: number, bounds: Bounds, random: () => number = Math.random): StepResult {
  let { x, y, vx, vy, angle, spin } = b
  vy += GRAVITY * dt
  x += vx * dt
  y += vy * dt
  angle += spin * dt
  if (x < bounds.minX) { x = bounds.minX; vx = Math.abs(vx) * WALL_BOUNCE }
  if (x > bounds.maxX) { x = bounds.maxX; vx = -Math.abs(vx) * WALL_BOUNCE }
  let impact: number | undefined
  if (y >= bounds.floor) {
    y = bounds.floor
    if (Math.abs(vy) > BOUNCE_MIN_SPEED) {
      vy = -vy * FLOOR_RESTITUTION
      impact = Math.min(1, Math.abs(vy) / 800) // after restitution, as in the reference
      vx *= 0.72
      spin = (random() - 0.5) * 9 + spin * 0.35
    } else {
      vy = 0
      vx *= FRICTION
      spin *= 0.7
      angle += (Math.round(angle / RIGHT_ANGLE) * RIGHT_ANGLE - angle) * 0.12
    }
  }
  return { body: { x, y, vx, vy, angle, spin }, impact }
}

export interface Shard { x: number; y: number; vx: number; vy: number; angle: number; spin: number; life: number }

export function stepShard(s: Shard, dt: number, floor: number): Shard {
  let { x, y, vx, vy, angle, life } = s
  vy += GRAVITY * dt; x += vx * dt; y += vy * dt; angle += s.spin * dt
  if (y > floor) { y = floor; vy = -vy * 0.3; vx *= 0.6; life -= 0.25 }
  life -= dt * 0.22
  return { ...s, x, y, vx, vy, angle, life }
}
```
(Impact strength is computed from the post-bounce speed, as in `blowout1.js` line 115.)

- [ ] **Step 3:** PASS. Commit `feat(web): blowout physics and click window`.

---

### Task 21: Blowout sequence and hook

**Files:**
- Create: `apps/web/features/blowout/sequence.ts`, `apps/web/features/blowout/use-blowout.ts`, `apps/web/features/blowout/blowout.css`

- [ ] **Step 1: `blowout.css`** — port template `globals.css` lines 142–170 (flicker layer + keyframes, `.bo-flash`, `.bo-veil`, `[data-blackout]` dimming — change the selector to `:root[data-blackout] main > :not([data-anchor='switch'])`, `.bo-fall`, `.bo-puff`, `.bo-shard`, reduced-motion rules). These classes are created imperatively, so the file is **global** CSS imported from `use-blowout.ts`'s consumer (`Portfolio.tsx`, Task 23).

- [ ] **Step 2: `sequence.ts`** — the DOM choreography of `blowout1.js` lines 67–177, split into small functions in one module:
```ts
import { playBulb } from '@/lib/audio/bulb'
import { playPoof } from '@/lib/audio/poof'
import { playThud } from '@/lib/audio/thud'
import { applyTheme, explicitTheme } from '@/features/theme/theme-dom'
import { stepBody, stepShard, type Body, type Shard } from './physics'

const RECOVER_AT_MS = 3300
const PHYSICS_MS = 3600
const SHARD_COUNT = 16
const PUFF_COUNT = 11

interface RunOptions { switchEl: HTMLElement; reduce: boolean }

export function runBlowout({ switchEl, reduce }: RunOptions): Promise<void> {
  const previous = explicitTheme()
  const rect = switchEl.getBoundingClientRect()
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

  playBulb()
  const flash = overlay('bo-flash', center)
  const veil = overlay('bo-veil', center)
  applyTheme('dark', false)
  document.documentElement.setAttribute('data-blackout', '')
  requestAnimationFrame(() => { flash.classList.add('in'); veil.classList.add('in') })

  const ghost = detachGhost(switchEl, rect)
  const shards = reduce ? [] : spawnShards(center)
  const stopPhysics = simulate(ghost, shards, rect, reduce)

  return new Promise((resolve) => {
    window.setTimeout(() => {
      ghost.classList.add('out')
      shards.forEach((s) => { s.el.style.transition = 'opacity .4s'; s.el.style.opacity = '0' })
      playPoof()
      if (!reduce) puff(center)
      remount(switchEl, reduce)
      window.setTimeout(() => {
        document.documentElement.removeAttribute('data-blackout')
        applyTheme(previous, false)
      }, 160)
      window.setTimeout(() => { veil.classList.remove('in'); veil.classList.add('out') }, 520)
      window.setTimeout(() => {
        stopPhysics()
        ;[veil, flash, ghost, ...shards.map((s) => s.el)].forEach((el) => el.remove())
        resolve()
      }, 1500)
    }, RECOVER_AT_MS)
  })
}
```
Implement the helpers in the same file, each ≤ 25 lines, porting the reference exactly:
  - `overlay(className, center)` — creates a div with `--x`/`--y` and appends it to `body`.
  - `detachGhost(switchEl, rect)` — `cloneNode(true)`, class `bo-fall`, fixed at `rect`, copies the canvas pixels with `drawImage(sourceCanvas, 0, 0)`, appends to `body`, and sets `switchEl.style.opacity = '0'` and `pointerEvents = 'none'`. Use `opacity`, **not** `visibility`.
  - `spawnShards(center)` — creates 16 `bo-shard` elements with random size, angle and speed (`blowout1.js` lines 93–102), returning `{ el, state: Shard }[]`.
  - `simulate(ghost, shards, rect, reduce)` — a rAF loop using `stepBody`/`stepShard` with `dt = min(.033, …)` and bounds `{ minX: 2, maxX: innerWidth - rect.width - 2, floor: innerHeight - rect.height - 4 }`. It calls `playThud(impact)` when an impact is reported. Initial body: `vx = (random - .5) * 220`, `vy = -160`, `spin = (random - .5) * 7`. Under reduce, it applies the static translate/rotate from line 107. It stops after 3600ms and returns a cancel function.
  - `puff(center)` — 11 `bo-puff` spans animated with the Web Animations API (lines 160–177).
  - `remount(switchEl, reduce)` — clears opacity and pointerEvents, then runs the scale `.45 → 1.09 → 1` animation (lines 139–142) unless `reduce`.

- [ ] **Step 3: `use-blowout.ts`:**
```ts
'use client'
import { useCallback, useRef, type RefObject } from 'react'
import { preloadBulb } from '@/lib/audio/bulb'
import { createClickWindow } from './click-window'
import { runBlowout } from './sequence'

const FLICKER_MS = 420

export function useBlowout(switchRef: RefObject<HTMLElement | null>, reduce: boolean) {
  const clicks = useRef(createClickWindow())
  const active = useRef(false)
  const flickerTimer = useRef(0)

  const flicker = useCallback((level: number) => {
    if (reduce) return
    const root = document.documentElement
    root.setAttribute('data-flicker', String(level))
    window.clearTimeout(flickerTimer.current)
    flickerTimer.current = window.setTimeout(() => root.removeAttribute('data-flicker'), FLICKER_MS)
  }, [reduce])

  const register = useCallback(() => {
    if (active.current || !switchRef.current) return
    const result = clicks.current.register(performance.now())
    if (result.kind === 'preload') preloadBulb()
    if (result.kind === 'flicker') flicker(result.level)
    if (result.kind === 'blow') {
      active.current = true
      void runBlowout({ switchEl: switchRef.current, reduce }).finally(() => { active.current = false })
    }
  }, [switchRef, reduce, flicker])

  const isActive = useCallback(() => active.current, [])
  return { register, isActive }
}
```

- [ ] **Step 4:** check-types → pass. Commit `feat(web): blowout sequence`.

---

### Task 22: Curious overlay (TDD for guide geometry)

**Files:**
- Create: `apps/web/lib/dom/page-rect.ts`, `apps/web/features/curious/guides.ts`, `apps/web/features/curious/use-layout-signal.ts`, `apps/web/features/curious/CuriousOverlay.tsx`, `apps/web/features/curious/CuriousOverlay.module.css`, `apps/web/tests/unit/curious/guides.test.ts`

- [ ] **Step 1: `page-rect.ts`:**
```ts
export interface PageRect { left: number; top: number; width: number; height: number; right: number; bottom: number }

export function pageRect(el: Element): PageRect {
  const r = el.getBoundingClientRect()
  return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY }
}
```

- [ ] **Step 2: Failing guide tests.** `guides.ts` is a pure function from measured rects to a list of guides (the logic of `curious1.js` `layout()` lines 47–106):
```ts
import { describe, expect, it } from 'vitest'
import { computeGuides, type Measurements } from '@/features/curious/guides'

const r = (top: number, height: number, left = 400, width = 632) => ({ left, top, width, height, right: left + width, bottom: top + height })
const m: Measurements = {
  main: r(0, 1600), docHeight: 1700,
  sections: { bio: r(200, 400), figure: r(640, 250), work: r(1000, 200), projects: r(1264, 150) },
  gaps: [{ from: r(900, 36), to: r(1000, 200) }],
  anchors: { headline: r(90, 70), switch: r(36, 60), role: r(130, 36) },
  figure: r(640, 216),
}
const notes = { headline: 'h', columnWidth: '{w}px wide', wallSwitch: 's', sectionGap: 'g', chips: 'c', role: 'r' }

describe('computeGuides', () => {
  const guides = computeGuides(m, notes, [{ side: 'left', text: 'L1' }, { side: 'right', text: 'R1', formula: 'x' }])
  it('draws two rails and a width bracket with the live width', () => {
    expect(guides.filter((g) => g.kind === 'rail')).toHaveLength(2)
    expect(guides.find((g) => g.kind === 'width')?.label).toBe('600px')
  })
  it('labels sections and measures gaps', () => {
    expect(guides.filter((g) => g.kind === 'section').map((g) => g.label)).toEqual(['bio', 'figure', 'work', 'projects'])
    expect(guides.find((g) => g.kind === 'gap')?.label).toBe('64px')
  })
  it('fills {w} in the column note and adds role formula notes', () => {
    expect(guides.some((g) => g.kind === 'note' && g.label === '600px wide')).toBe(true)
    expect(guides.filter((g) => g.kind === 'formula')).toHaveLength(2)
  })
  it('staggers delays 35ms apart', () => {
    expect(guides[1]!.delay - guides[0]!.delay).toBe(35)
  })
})
```
Run → FAIL.

- [ ] **Step 3: Implement `guides.ts`.** Types and function:
```ts
import type { PageRect } from '@/lib/dom/page-rect'
import type { CuriousNote, PageNotes, Side } from '@/lib/cms/types'

export type GuideKind = 'rail' | 'width' | 'section' | 'gap' | 'note' | 'formula'
export interface Guide {
  key: string; kind: GuideKind; left: number; top: number
  width?: number; height?: number; label?: string; formula?: string; side?: Side; rotation?: number; delay: number
}
export interface Measurements {
  main: PageRect; docHeight: number
  sections: Partial<Record<'bio' | 'figure' | 'work' | 'projects' | 'content', PageRect>>
  gaps: { from: PageRect; to: PageRect }[]
  anchors: Partial<Record<'headline' | 'switch' | 'role', PageRect>>
  figure?: PageRect
}

const GUTTER = 16, NOTE_W = 200, NOTE_OFFSET = 52, STAGGER = 35, FORMULA_STEP = 82, MIN_GAP = 20
```
Body: build the list in the reference's order, with constants from `curious1.js`:
  - two rails, then the width bracket (`top: main.top + 12`, label `${width}px`)
  - section guides, then gaps over `MIN_GAP`, labelled `${Math.round(gap)}px`, with the marker 14px left of the column
  - page notes: headline (left, `top + 10`, −1.5°), column width (right, `main.top + 24`, 1°), switch (right, `bottom + 14`, −0.8°), role (left, `top + 118`, 1.1°), and gap + chips relative to `sections.work` (right `top − 42`, 1.2°; left `top + 58`, −1°)
  - formula notes per side, centred on the figure with `FORMULA_STEP` spacing and alternating rotation `(k % 2 ? 1 : -1) * (0.6 + k * 0.3)`
  - note x: `side === 'right' ? col.right + NOTE_OFFSET : col.left - NOTE_OFFSET - NOTE_W`, where `col = { left: main.left + GUTTER, right: main.right - GUTTER }`
  - `delay = index * STAGGER`; `key` = `${kind}-${index}`
Keep helpers (`note()`, `push()`) as local closures. The file must stay under ~110 lines.

- [ ] **Step 4:** PASS.

- [ ] **Step 5: `use-layout-signal.ts`** — a counter that bumps whenever the layout may have moved (the self-healing contract, spec §6.6):
```ts
'use client'
import { useEffect, useState } from 'react'

export function useLayoutSignal(enabled: boolean, deps: unknown[]): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let timer = 0
    const bump = (delay: number) => () => { window.clearTimeout(timer); timer = window.setTimeout(() => setTick((t) => t + 1), delay) }
    const onResize = bump(120)
    const ro = new ResizeObserver(bump(80))
    const main = document.querySelector('main')
    if (main) ro.observe(main)
    addEventListener('resize', onResize)
    void document.fonts?.ready.then(bump(0))
    bump(450)() // after a role morph settles
    return () => { window.clearTimeout(timer); ro.disconnect(); removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])
  return tick
}
```

- [ ] **Step 6: `CuriousOverlay.tsx`:**
```tsx
'use client'
import { useLayoutEffect, useState } from 'react'
import type { PageNotes } from '@/lib/cms/types'
import { pageRect } from '@/lib/dom/page-rect'
import { useRole } from '@/features/role/RoleProvider'
import { useCurious } from './CuriousProvider'
import { computeGuides, type Guide, type Measurements } from './guides'
import { useLayoutSignal } from './use-layout-signal'
import styles from './CuriousOverlay.module.css'

const q = (anchor: string) => document.querySelector(`[data-anchor="${anchor}"]`)
const rectOf = (anchor: string) => { const el = q(anchor); return el && el.getBoundingClientRect().height > 2 ? pageRect(el) : undefined }

function measure(): Measurements | null {
  const main = document.querySelector('main')
  if (!main || main.getBoundingClientRect().width < 2) return null
  const order = ['links', 'work', 'projects', 'content'].map(rectOf)
  const gaps = order.slice(1).flatMap((to, i) => { const from = order[i]; return from && to ? [{ from, to }] : [] })
  return {
    main: pageRect(main), docHeight: Math.max(document.documentElement.scrollHeight, pageRect(main).bottom + 40),
    sections: { bio: rectOf('bio'), figure: rectOf('figure'), work: rectOf('work'), projects: rectOf('projects'), content: rectOf('content') },
    gaps, anchors: { headline: rectOf('headline'), switch: rectOf('switch'), role: rectOf('role') }, figure: rectOf('figure-box'),
  }
}

export function CuriousOverlay({ pageNotes }: { pageNotes: PageNotes }) {
  const { on } = useCurious()
  const { current } = useRole()
  const tick = useLayoutSignal(on, [current.slug])
  const [guides, setGuides] = useState<Guide[]>([])
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    if (!on) return
    const m = measure()
    if (!m) return
    setGuides(computeGuides(m, pageNotes, current.notes))
    setHeight(m.docHeight)
  }, [on, tick, pageNotes, current.notes])

  return (
    <div className={styles.overlay} data-visible={on} aria-hidden="true" style={{ height }}>
      {on && guides.map((g) => (
        <span key={g.key} className={styles[g.kind]} data-side={g.side}
          style={{ left: g.left, top: g.top, width: g.width, height: g.height, '--guide-delay': `${g.delay}ms`, '--note-rotation': `${g.rotation ?? 0}deg` } as React.CSSProperties}>
          {g.label && <span className={styles.label}>{g.label}</span>}
          {g.formula && <span className={styles.formula}>{g.formula}</span>}
        </span>
      ))}
    </div>
  )
}
```
Note: rails/width/section/gap guides render their text in `.label` (monospace), while notes render text in the Caveat hand. Style `.note .label` and `.formula .label` accordingly, so `computeGuides` doesn't need two text fields.

- [ ] **Step 7: `CuriousOverlay.module.css`.** Port the curious section of template `globals.css` (lines 252–320), mapping the `.curiosity-*` class names to `.overlay`, `.rail`, `.width`, `.section`, `.gap`, `.note`, `.formula`, `.label`:
  - `position: absolute; inset: 0 0 auto 0; pointer-events: none; z-index: 5`
  - fade-in when `[data-visible='true']`
  - entry animation delayed by `var(--guide-delay)`
  - the leader-line `::before`/`::after`, flipped by `[data-side]`
  - notes hidden below 1040px
  - `--accent` colour and the Caveat font via `var(--font-caveat)`

- [ ] **Step 8:** unit tests PASS; check-types → pass. Commit `feat(web): curious mode overlay with self-healing layout`.

---

### Task 23: Sections, figure, composition, page, metadata

**Files:**
- Create: `apps/web/shared/ui/ChipLink.tsx`, `apps/web/shared/ui/Section.tsx`, `apps/web/shared/ui/Section.module.css`, `apps/web/features/sections/{EntryList.tsx,EntryList.module.css,ContactLinks.tsx,FooterNav.tsx}`, `apps/web/features/figure/{Figure.tsx,SplineScene.tsx,Figure.module.css}`, `apps/web/features/portfolio/Portfolio.tsx`, `apps/web/app/error.tsx`
- Modify: `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`

- [ ] **Step 1: `ChipLink.tsx`** — the same markup as `chipLinkHtml`, so there is one visual source:
```tsx
import { CHIP_CLASS, CHIP_LINK_CLASS, isExternal } from './chip-markup'

export function ChipLink({ chip, label, href }: { chip: string; label: string; href?: string }) {
  const external = href ? isExternal(href) : false
  return (
    <a className={CHIP_LINK_CLASS} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <i className={CHIP_CLASS} aria-hidden="true">{chip}</i>
      <span>{label}</span>
    </a>
  )
}
```

- [ ] **Step 2: `Section.tsx`:**
```tsx
import type { ReactNode } from 'react'
import styles from './Section.module.css'

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} data-anchor={id}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  )
}
```
`Section.module.css`: `margin-top: var(--section-gap)`; `h2` is 15px/500, `--ink-soft`, 24px bottom margin, `transition: var(--theme-transition)`.

- [ ] **Step 3: `EntryList.tsx`** — one generic list for Work, Projects and Content. It is keyed by role, so it re-mounts with an enter animation:
```tsx
'use client'
import type { Entry } from '@/lib/cms/types'
import { filterByDiscipline } from '@/lib/cms/mappers'
import { useRole } from '@/features/role/RoleProvider'
import { ChipLink } from '@/shared/ui/ChipLink'
import { Section } from '@/shared/ui/Section'
import styles from './EntryList.module.css'

export function EntryList({ id, title, entries }: { id: string; title: string; entries: Entry[] }) {
  const { current } = useRole()
  const rows = filterByDiscipline(entries, current.slug)
  if (rows.length === 0) return null
  return (
    <Section id={id} title={title}>
      <ol key={current.slug} className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.row}>
            <span className={styles.main}>
              <ChipLink chip={row.chip} label={row.label} href={row.href} />
              <span className={styles.meta}>{row.meta}</span>
            </span>
            {row.aside && <span className={styles.aside}>{row.aside}</span>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
```
`filterByDiscipline` lives in `mappers.ts`, which must stay free of `server-only` imports so client components can use it. Only `client.ts` and `queries.ts` import `server-only`.

`EntryList.module.css`:
- `.list` is a grid with `row-gap: var(--row-gap)` and `animation: enter .24s ease both`, where `@keyframes enter { from { opacity: 0; filter: blur(2px); transform: translateY(.2em) } }`.
- `.row` is `grid-template-columns: 1fr auto; gap: 16px`.
- `.meta` and `.aside` (tabular-nums) use `--ink-soft` with `transition: var(--theme-transition)`.
- Under reduced motion, remove the animation.

- [ ] **Step 4: `ContactLinks.tsx` and `FooterNav.tsx`:**
```tsx
// ContactLinks.tsx
import type { LinkItem } from '@/lib/cms/types'
import { ChipLink } from '@/shared/ui/ChipLink'

export function ContactLinks({ links }: { links: LinkItem[] }) {
  if (links.length === 0) return null
  return (
    <nav className="links" aria-label="Contact" data-anchor="links">
      {links.map((l) => <ChipLink key={l.href} chip={l.chip} label={l.label} href={l.href} />)}
    </nav>
  )
}
```
```tsx
// FooterNav.tsx
import type { NavItem } from '@/lib/cms/types'

export function FooterNav({ items, name }: { items: NavItem[]; name: string }) {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} {name}</span>
      {items.length > 0 && (
        <nav aria-label="Footer">
          {items.map((i) => (
            <a key={i.href} href={i.href} {...(i.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{i.label}</a>
          ))}
        </nav>
      )}
    </footer>
  )
}
```
Add the `.links` styles (flex row, gap per template) and quiet `.site-footer` styles (`--ink-soft`, 12.5px, margin-top `var(--section-gap)`, padding-bottom 64px) to `base.css`.

- [ ] **Step 5: Spline figure.** First, **try the asset**: copy `docs/assets/interactive_workspace.spline` to `apps/web/public/spline/scene.splinecode` and check it in the browser (Task 24's dev server) with the scene URL `/spline/scene.splinecode`. If `@splinetool/runtime` fails to parse it (console error or blank canvas), delete the copied file, keep the default URL, and record in the final report that the user must export the `.splinecode` from Spline. The figure must then collapse gracefully.

`SplineScene.tsx`:
```tsx
'use client'
import Spline from '@splinetool/react-spline'
import { useState } from 'react'

export function SplineScene({ url, onFail }: { url: string; onFail: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <Spline
      scene={url}
      onLoad={() => setLoaded(true)}
      onError={onFail}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity .4s ease' }}
    />
  )
}
```
Check the installed `@splinetool/react-spline` prop names (`onLoad`, `onError`, `renderOnDemand`) in its `.d.ts`. If there is no `onError`, catch the failure by probing the URL with a `fetch(url, { method: 'HEAD' })` before mounting.

`Figure.tsx`:
```tsx
'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useRole } from '@/features/role/RoleProvider'
import styles from './Figure.module.css'

const SplineScene = dynamic(() => import('./SplineScene').then((m) => m.SplineScene), { ssr: false })

export function Figure({ sceneUrl }: { sceneUrl: string }) {
  const { current } = useRole()
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <figure className={styles.plate} data-anchor="figure">
      {!failed && (
        <div ref={box} className={styles.box} data-anchor="figure-box">
          {near && <SplineScene url={sceneUrl} onFail={() => setFailed(true)} />}
        </div>
      )}
      <figcaption key={current.slug} className={styles.caption}>{current.caption}</figcaption>
    </figure>
  )
}
```
`Figure.module.css`: port `.plate`, `.platebox` and `figcaption` from template `globals.css` lines 99–105 (`margin: 30px 0 0`, box `height: 216px`, caption 11.5px, opacity .75). Add the same enter animation on the caption as the lists.

- [ ] **Step 6: `Portfolio.tsx`** — client composition root:
```tsx
'use client'
import { useRef } from 'react'
import type { Portfolio as PortfolioData } from '@/lib/cms/types'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { Bio } from '@/features/bio/Bio'
import { useBlowout } from '@/features/blowout/use-blowout'
import '@/features/blowout/blowout.css'
import { CuriousOverlay } from '@/features/curious/CuriousOverlay'
import { CuriousProvider } from '@/features/curious/CuriousProvider'
import { Figure } from '@/features/figure/Figure'
import { RoleHeadline } from '@/features/role/RoleHeadline'
import { RoleProvider } from '@/features/role/RoleProvider'
import { ContactLinks } from '@/features/sections/ContactLinks'
import { EntryList } from '@/features/sections/EntryList'
import { FooterNav } from '@/features/sections/FooterNav'
import { WallSwitch } from '@/features/theme/WallSwitch'

export function Portfolio({ data }: { data: PortfolioData }) {
  const reduce = useReducedMotion()
  const switchRef = useRef<HTMLDivElement>(null)
  const blowout = useBlowout(switchRef, reduce)
  const { settings } = data
  return (
    <RoleProvider disciplines={data.disciplines} defaultSlug={data.defaultSlug}>
      <CuriousProvider>
        <main>
          <WallSwitch ref={switchRef} disabled={blowout.isActive} onToggled={blowout.register} />
          <RoleHeadline name={data.profile.name} tail={data.profile.headlineTail} hint={settings.pickerHint} />
          <Bio />
          <Figure sceneUrl={settings.splineSceneUrl} />
          <ContactLinks links={data.contactLinks} />
          <EntryList id="work" title={settings.sectionLabels.work} entries={data.work} />
          <EntryList id="projects" title={settings.sectionLabels.projects} entries={data.projects} />
          <EntryList id="content" title={settings.sectionLabels.content} entries={data.content} />
          <FooterNav items={data.nav} name={data.profile.name} />
        </main>
        <CuriousOverlay pageNotes={settings.pageNotes} />
      </CuriousProvider>
    </RoleProvider>
  )
}
```

- [ ] **Step 7: `app/page.tsx`, metadata, error boundary.**
```tsx
// app/page.tsx
import type { Metadata } from 'next'
import { Portfolio } from '@/features/portfolio/Portfolio'
import { getPortfolio } from '@/lib/cms/queries'

export const dynamic = 'force-dynamic' // render per request from the tagged fetch cache; builds never need the CMS

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getPortfolio()
  return {
    title: settings.seo.title,
    description: settings.seo.description,
    openGraph: settings.seo.ogImage ? { images: [settings.seo.ogImage] } : undefined,
  }
}

export default async function Page() {
  return <Portfolio data={await getPortfolio()} />
}
```
Confirm in the bundled Next 16 docs (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`) that `fetch` with an explicit `next.revalidate` is still cached under `force-dynamic`. If it isn't, switch the client to `cache: 'force-cache'` plus `next: { tags }`.
```tsx
// app/error.tsx
'use client'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1><span className="who">Something went quiet.</span></h1>
      <p>The content could not be loaded. <button type="button" onClick={reset}>Try again</button></p>
    </main>
  )
}
```

- [ ] **Step 8: Build.** Run `bun run --cwd apps/web check-types && bun run --cwd apps/web lint && bun run --cwd apps/web build` and expect all three to pass. Commit `feat(web): compose the portfolio from cms content`.

---

# Phase D — Verification

### Task 24: Browser QA against the template

- [ ] **Step 1:** With the CMS on 3001, start web: `bun run --cwd apps/web dev -- --port 3100` (background).
- [ ] **Step 2:** In the built-in browser at 1440×900, walk `docs/template-portfolio/docs/CHECKLIST.md` side by side with `http://localhost:3000` (template). Specifically re-run the QA script from the spec §2:
  - hover the role, then scroll the wheel over the picker: the role changes and `scrollY` stays 0 (Q1)
  - no console errors after 5 role changes (Q2)
  - toggle the theme, then check the drum's visible face equals the `role="status"` text (Q3)
  - set role 2, reload: no visible morph (Q4)
  - 10 fast clicks: full blowout, and the theme restores
  - curious on: guides, notes and formula notes change with the role
  - 375px: no horizontal scroll, and the switch is fixed top-right
- [ ] **Step 3:** Fix any divergence in the owning feature (one commit per fix, `fix(web): …`).

### Task 25: Playwright e2e for the QA regressions

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/tests/e2e/portfolio.spec.ts`

- [ ] **Step 1: Config.**
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'bun run dev -- --port 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 120_000 },
})
```
Run `bunx playwright install chromium` once, from `apps/web`.

- [ ] **Step 2: Tests** (the CMS must be running on 3001 with seed data):
```ts
import { expect, test } from '@playwright/test'

const status = (page: import('@playwright/test').Page) => page.getByRole('status')

test('wheel over the open picker changes role without scrolling the page (Q1)', async ({ page }) => {
  await page.goto('/')
  const drum = page.getByRole('button', { name: /Open the role list/ })
  await drum.hover()
  await expect(page.getByRole('listbox')).toBeVisible()
  const before = await status(page).textContent()
  await page.mouse.wheel(0, 120)
  await expect(status(page)).not.toHaveText(before ?? '')
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('role changes produce no console errors (Q2)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  for (const key of ['2', '3', '1']) await page.keyboard.press(key)
  await page.waitForTimeout(600)
  expect(errors).toEqual([])
})

test('drum label follows the role after a theme toggle (Q3)', async ({ page }) => {
  await page.goto('/#ai')
  await page.getByRole('button', { name: /Turn the lights/ }).click()
  await expect(page.getByRole('button', { name: /Open the role list/ })).toHaveAccessibleName(/AI engineer/)
})

test('a saved role renders without morphing on reload (Q4)', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('2')
  await page.reload()
  expect(await page.locator('.w.out, .w.in').count()).toBe(0)
  await expect(status(page)).toHaveText(/AI engineer/)
})

test('theme persists without a flash', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Turn the lights off/ }).click()
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
})

test('curious mode draws guides and notes follow the role', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('switch', { name: 'Curious mode' }).click()
  await expect(page.getByText('600px').first()).toBeVisible()
  await page.keyboard.press('2')
  await expect(page.getByText('ℒ = −∑ yᵢ log ŷᵢ')).toBeVisible()
})

test.describe('without javascript', () => {
  test.use({ javaScriptEnabled: false })
  test('the letter still reads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('backend plumber')).toBeVisible()
  })
})
```
- [ ] **Step 3:** Run `bun run --cwd apps/web test:e2e`; all tests should pass. Commit `test(web): e2e coverage for the template regressions`.

### Task 26: Final gate

- [ ] **Step 1:** From the repo root: `bun run check-types`, `bun run lint`, `bun run --cwd apps/web test`, `bun run --cwd apps/payload test:int`, and `bun run build`. All must pass. Paste the outputs in the report.
- [ ] **Step 2:** Update the root `README.md` with a short architecture section (apps, ports, `bun run dev`, the seed, MCP), linking the spec.
- [ ] **Step 3:** Commit `docs: architecture and runbook`.

---

# Phase E — Blog (CMS only, added 2026-09-30 at the user's request)

### Task 27: Payload blog feature (not linked to the web yet)

**Goal:** the CMS is fully ready to author a blog, following https://payloadcms.com/posts/blog/how-to-build-a-website-blog-or-portfolio-with-nextjs. The web app does **not** consume posts yet.

**Reference (read it, don't copy it wholesale):** the website template this repo started from. It is in git history at commit `13f5468`, and `git show 13f5468:<path>` prints a file:
- `apps/payload/src/collections/Posts/index.ts`
- `.../Posts/hooks/populateAuthors.ts`
- `apps/payload/src/collections/Categories.ts`
- `apps/payload/src/hooks/populatePublishedAt.ts`
- `apps/payload/src/access/authenticatedOrPublished.ts`
- `apps/payload/src/blocks/{Code,Banner,MediaBlock}/config.ts`
- `apps/payload/src/plugins/index.ts`
- `apps/payload/src/fields/defaultLexical.ts`

Also read the Payload skill at `apps/payload/.claude/skills/payload/`.

**Files:**
- Create:
  - `src/access/published-or-authenticated.ts`
  - `src/blocks/{code,banner,media-block}.ts`
  - `src/editor/post-editor.ts`
  - `src/fields/slug.ts`
  - `src/hooks/{populate-published-at,populate-authors}.ts`
  - `src/collections/{Posts,Categories}.ts`
  - `src/plugins/blog-plugins.ts`
  - `tests/int/blog.int.spec.ts`
- Modify:
  - `src/collections/Users.ts` (add a required `name` field; it's the display name for authors)
  - `src/payload.config.ts`
  - `package.json` (add `@payloadcms/plugin-seo`, `plugin-search`, `plugin-redirects` and `plugin-nested-docs` at **3.90.2**)
  - `README.md` (a Blog section)

**Requirements:**

1. `categories` collection:
   - `title` (required) and a unique `slug`
   - nested via `plugin-nested-docs` (`parent`, `breadcrumbs`), with `generateURL` building the path from the slugs
   - public read, authenticated write
2. `posts` collection. Fields:
   - `title`, required
   - a unique `slug`, generated from the title when empty by a `slugField()` factory in `fields/slug.ts` that lowercases, strips diacritics and uses dashes; unit-test the formatter
   - `excerpt` (textarea)
   - `heroImage` (upload → media)
   - `content` (richText, `post-editor.ts`)
   - `categories` (hasMany → categories)
   - `authors` (hasMany → users, defaulting to the current user)
   - `populatedAuthors` (read-only array of `{ id, name }`, filled by an `afterRead` hook). Never expose author emails, because the users collection is not public.
   - `relatedPosts` (hasMany → posts, filtered to exclude itself)
   - `publishedAt` (date, sidebar; set by a `beforeChange` hook the first time the post is published)

   Behaviour:
   - `versions: { drafts: { autosave: { interval: 100 }, schedulePublish: true }, maxPerDoc: 50 }`
   - access: `read` = authenticated **or** `_status` equals `published` (`published-or-authenticated.ts`); create, update and delete are authenticated only
   - admin: `useAsTitle: 'title'`, `defaultColumns: ['title', 'slug', '_status', 'publishedAt']`
   - hooks: `revalidateCollectionHooks` (reused)
3. `post-editor.ts`: Lexical with paragraph, headings h2–h4, bold, italic, underline, strikethrough, inline code, link (internal to posts plus external URLs), ordered/unordered lists, blockquote, horizontal rule, upload (media), and `BlocksFeature({ blocks: [Code, Banner, MediaBlock] })`, plus the fixed and inline toolbars.
   - `Code` block: `language` select (typescript, javascript, tsx, bash, json, css, go, python, sql) and `code` (a code field).
   - `Banner` block: `style` select (info, warning, error, success) and `content` (minimal Lexical).
   - `MediaBlock`: `media` (upload, required).
4. Plugins in `plugins/blog-plugins.ts`, exported as one array and spread into the config:
   - `nestedDocsPlugin({ collections: ['categories'] })`
   - `seoPlugin({ collections: ['posts'], uploadsCollection: 'media', generateTitle: ({ doc }) => \`${doc.title} | <profile name or 'Blog'>\`, generateURL })`, where `generateURL` uses `WEB_URL` + `/blog/<slug>`. Put the SEO fields in a `meta` tab or group on posts, following the plugin's documented `tabbedUI` or `fields` pattern.
   - `searchPlugin({ collections: ['posts'], defaultPriorities: { posts: 10 } })`, syncing `title`, `slug`, `excerpt` and the categories' titles. Posts search only.
   - `redirectsPlugin({ collections: ['posts'] })`
5. Scheduled publishing needs the jobs queue. Add
   `jobs: { autoRun: [{ cron: '* * * * *', queue: 'default' }], access: { run: ({ req }) => Boolean(req.user) || req.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\` } }`,
   and confirm the exact shape against the installed Payload docs and types.
6. The MCP plugin is **not** extended to posts. The user has paused MCP work.
7. **Database safety (mandatory):**
   - Before starting or restarting the CMS dev server with the new schema, copy `apps/payload/payload.db` to `apps/payload/payload.db.pre-blog-<timestamp>.bak`.
   - Never delete or recreate `payload.db`. The schema change is additive: new tables plus a nullable `users.name` column.
   - Because `name` is required, add it to the Users collection with `required: true` for new users. If Payload's SQLite push refuses to add a NOT NULL column to the existing user row, make `name` optional in the DB (`required: false`, validated in a `beforeValidate` hook) rather than touching data.
   - Don't write any content (no sample posts).
   - If the dev server's schema push prompts about data loss, stop and report. Never accept data loss.
8. Integration tests (pure, no DB): the slug formatter, the `published-or-authenticated` access function (with a user it returns `true`; without one it returns a `{ _status: { equals: 'published' } }` where-clause), and the `populate-authors` hook mapping (it drops emails).
9. Regenerate types (`generate:types` → `packages/cms-types`) and the import map. `check-types`, `lint` (if it runs) and `test:int` must be green. Boot check: `/admin` returns 200, and `GET /api/posts` returns `{ docs: [] }` publicly.

- [ ] Implement, test, verify, then commit as `feat(cms): blog — posts, categories, drafts, scheduled publish, seo, search, redirects`.

### Task 28: Draft preview for posts (user request, 2026-09-30)

**Reference:** https://github.com/payloadcms/payload/tree/3.x/examples/draft-preview. The key files are `src/app/(app)/preview/route.ts`, `src/app/(app)/exit-preview/route.ts`, `src/collections/Pages/index.ts` (`admin.preview`) and `src/app/(app)/[slug]/page.tsx` (`draftMode` → `draft: true`). Fetch the raw files from `raw.githubusercontent.com/payloadcms/payload/3.x/examples/draft-preview/src/...`.

**Architecture adaptation:** the example is a monolith that calls `payload.auth` in-process. Here the frontend is `apps/web` (port 3000) and the CMS is separate (port 3001), so the preview routes live in the web app. They authenticate by forwarding the admin's `payload-token` cookie to the CMS. Cookies are host-scoped, not port-scoped, so a localhost cookie reaches :3000. The blog stays **unlinked**: `/blog/[slug]` renders only in draft mode and 404s otherwise, until the blog launches.

**Files:**
- CMS:
  - modify `apps/payload/src/collections/Posts.ts` to add `admin.preview`
  - create `apps/payload/src/plugins/preview-url.ts` (pure URL builder, unit-tested)
  - update the README's Blog section
- Web:
  - create `app/api/preview/route.ts` and `app/api/exit-preview/route.ts`
  - create `lib/cms/preview.ts`, containing `isSafePreviewPath`, the secret check and `getPreviewUser(cookieHeader)`
  - create `lib/cms/posts.ts` with `getPostBySlug(slug, { draft, token })`
  - create `app/blog/[slug]/page.tsx`, `features/blog/PostBody.tsx` (Lexical renderer) and `features/blog/PreviewBanner.tsx`, with CSS modules
  - add tests under `tests/unit/cms/preview.test.ts`
  - update `.env.example`

**Requirements:**
1. `admin.preview: (doc) => buildPreviewUrl({ webUrl: process.env.WEB_URL, secret: process.env.PREVIEW_SECRET, path: \`/blog/${doc.slug}\` })`. It returns `null` when the slug, WEB_URL or secret is missing, so the button is hidden. It produces `${WEB_URL}/api/preview?path=…&previewSecret=…` with `URLSearchParams`. `PREVIEW_SECRET` already exists in `apps/payload/.env`; copy the value to `apps/web/.env.local` without printing it.
2. `GET /api/preview`:
   - 403 unless `previewSecret` equals `PREVIEW_SECRET` (constant-time: a sha256 digest and `timingSafeEqual`, same as `app/api/revalidate/route.ts`; extract a shared `secretsMatch(a, b)` helper into `lib/security/secrets.ts` and reuse it in both routes)
   - 400 unless `path` is a safe relative path (starts with a single `/`, not `//` or `/\`, no scheme; reuse `safeHref` rules plus the `getSafeRedirect` semantics)
   - verify the user by calling `${CMS_URL}/api/users/me` with the incoming `cookie` header, `cache: 'no-store'`; 403 and `draftMode().disable()` if there's no user
   - otherwise `(await draftMode()).enable()` and `redirect(path)`
3. `GET /api/exit-preview`: disables draft mode and redirects to `/`. Also accept `?path=` validated the same way.
4. `getPostBySlug`:
   - Draft mode: `fetch(\`${CMS_URL}/api/posts?where[slug][equals]=…&draft=true&depth=2&limit=1\`, { headers: { Authorization: \`JWT ${token}\` }, cache: 'no-store' })`, where the token is read from the `payload-token` cookie via `cookies()`. Check the actual cookie name, since Payload uses `${cookiePrefix}-token` with the default prefix `payload`.
   - Not in draft mode: the published fetch tagged `cms`.
   - Map it to a small `PostView` view model (title, excerpt, content, publishedAt, populatedAuthors names, heroImage url) in the mappers style. Never pass author emails.
5. `/blog/[slug]`:
   - `notFound()` unless draft mode is enabled. Add a comment saying the public blog launches later.
   - `metadata.robots = { index: false, follow: false }`
   - renders `PreviewBanner` ("Preview: you're viewing a draft", with an exit link to `/api/exit-preview?path=/`), the title, meta (date and authors) and `PostBody`
   - `PostBody` uses `@payloadcms/richtext-lexical/react` `RichText` with JSX converters for the `code`, `banner` and `mediaBlock` blocks and uploads (install `@payloadcms/richtext-lexical@3.90.2` in apps/web)
   - Styled with the existing tokens (600px column, Inter). Keep it quiet and minimal; this is a preview surface.
6. CMS DB safety: `admin.preview` is config-only with no schema change, so no DB write is needed. Still back up `payload.db` before restarting the CMS if you restart it. Never reset it.
7. Tests (unit):
   - `buildPreviewUrl`
   - `isSafePreviewPath`: rejects `//evil`, `/\evil`, `https://x`, `javascript:` and empty; accepts `/blog/a`
   - `secretsMatch`
   - the post mapper, confirming it drops emails
8. Verification:
   - `curl` `/api/preview` with a wrong secret → 403
   - `curl` with a bad path → 400
   - the right secret without a cookie → 403
   - `/blog/anything` without draft mode → 404
   - A logged-in end-to-end check isn't possible without the user's credentials; say so. Never create a user or sign in.
   - `check-types`, `lint`, `test` and `build` are green for web and cms.

- [ ] Commit as `feat: draft preview for posts` (split cms/web commits if clearer).

### Task 29: Live preview for posts (user request, 2026-09-30)

**References:**
- https://payloadcms.com/docs/live-preview/overview
- https://payloadcms.com/docs/live-preview/server
- https://github.com/payloadcms/payload/tree/3.x/examples/live-preview. The key files are `src/app/(app)/[slug]/RefreshRouteOnSave.tsx`, `src/app/(app)/[slug]/page.tsx`, `src/collections/Pages/index.ts` (`admin.livePreview.url`) and `src/payload.config.ts` (`admin.livePreview.breakpoints`).

**Approach: server-side live preview on top of Task 28.** The admin's live-preview iframe loads the *draft-preview entry route*, `WEB_URL/api/preview?path=/blog/<slug>&previewSecret=…`. That route authenticates the admin through the forwarded `payload-token` cookie, enables `draftMode` and redirects. The iframe's origin is same-site in dev (localhost), so the cookie is sent. In production the CMS and web must share a cookie domain, as the README documents.

On `/blog/[slug]`, in draft mode, the page renders a client `RefreshRouteOnSave`. It wraps `@payloadcms/live-preview-react`'s `RefreshRouteOnSave` with `refresh={() => router.refresh()}` and `serverURL={process.env.NEXT_PUBLIC_CMS_URL}`, which must be the admin origin because it is checked against the `postMessage` origin. Each autosave re-renders the server component, which re-fetches the draft with `no-store`.

**Files:**
- CMS:
  - `src/collections/Posts.ts`: `admin.livePreview.url: ({ data }) => buildPreviewUrl({ webUrl: process.env.WEB_URL, secret: process.env.PREVIEW_SECRET, path: postPreviewPath(data?.slug) })`. When it returns null, live preview is unavailable for unsaved or slug-less docs; check how Payload treats a null or empty url, and return something harmless if it's required.
  - `src/payload.config.ts`: `admin.livePreview.breakpoints` for mobile 375×667, tablet 768×1024 and desktop 1440×900.
  - Keep `versions.drafts.autosave.interval` at 100, which is already responsive. Document the choice.
  - Tests: extend `tests/int/preview.int.spec.ts` to cover the livePreview url wiring.
- Web:
  - `bun add --cwd apps/web @payloadcms/live-preview-react@3.90.2`
  - create `features/blog/RefreshRouteOnSave.tsx` (`'use client'`)
  - render it in `app/blog/[slug]/page.tsx` only when draft mode is on and a post was found
  - add `NEXT_PUBLIC_CMS_URL=http://localhost:3001` to `.env.example` and `.env.local`
  - add a unit or render test that the refresher calls `router.refresh` (mock `next/navigation` and the live-preview component), or at least that the page includes it only in draft mode
- README (CMS Blog section): a "Live preview" bullet explaining how to open a post, the Live Preview tab, the breakpoints and the same-site cookie requirement.

**Constraints:**
- No DB writes and no content. The config change is admin-only, with no schema change.
- If the CMS must be restarted, back up the DB first.
- Never sign in or create users.
- Don't kill the running servers: the CMS on 3001, web on 3000 and the template on 3002. Next hot-reloads.
- Don't run `next build` in `apps/web` while its dev server is running. The final gate builds.

**Verification:**
- `test`, `check-types` and `lint` pass for web and cms.
- `curl` the CMS admin config endpoint, or unit-test the url function.
- Say that the in-iframe end-to-end check needs the user's login.

- [ ] Commit as `feat: live preview for posts`.
