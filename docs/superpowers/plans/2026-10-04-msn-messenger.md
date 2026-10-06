# MSN Messenger App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows Live Messenger app to the `/os` desktop, with a main contact-list window and a Conversation window. All of its content comes from a new Payload global, and the conversation answers with scripted replies.

**Architecture:** There are two new React apps in the existing OS window manager: `messenger`, which has a desktop shortcut, and `conversation`, which the contact list opens. A new `messenger` Payload global feeds them through `getMessenger()`, and only on `/os`. Replies go through a `Responder` function. A scripted responder implements it now, and the future Claude-backed persona will replace it.

**Tech Stack:** Next 16 / React 19 (apps/web), Payload 3.90 with SQLite (apps/payload), vitest + jsdom, Playwright, CSS modules, bun.

**Spec:** `docs/superpowers/specs/2026-10-04-msn-messenger-design.md`

**House rules (read before any task):**
- Run every command from the worktree root, `D:\Second Brain\01.PROJETOS\applications\my-portfolio\.claude\worktrees\feat-msn-messenger`. Never `cd` into the main checkout.
- Run git commands one at a time, each as its own Bash call. Never chain git with `&&` or `;`.
- **Never** touch the main checkout's `apps/payload/payload.db`. The worktree works on its own copy (Task 0).
- The main checkout's dev servers own ports 3000 and 3001; never stop them. In the worktree, the web app runs on **3100** and the CMS on **3101**.
- Code style: no semicolons, single quotes, 2-space indent, comments only where the code doesn't say it, and the same tone as the surrounding files.
- ESLint is vacuous for TS in this repo, so the gates are `check-types` and the tests.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

**CMS (`apps/payload/src/`)**
- Create `fields/required-text.ts`: the shared required-text-with-default field (moved out of `SiteSettings.ts`).
- Modify `globals/SiteSettings.ts`: import `requiredText` instead of defining it.
- Create `globals/Messenger.ts`: the `messenger` global.
- Modify `payload.config.ts`: register the global.
- Create `migrations/<timestamp>_messenger.ts` and `.json` (generated), and modify `migrations/index.ts` (generated).
- Modify `seed/data.ts` and `seed/run.ts`: seed the messenger content.
- Regenerate `packages/cms-types/src/payload-types.ts`.

**Web (`apps/web/`)**
- Modify `lib/cms/types.ts`: the Messenger types.
- Modify `lib/cms/mappers.ts`: `toMessenger`.
- Modify `lib/cms/queries.ts`: `getMessenger`.
- Modify `app/(os)/os/page.tsx`: pass `OsData`.
- Modify `features/os/apps.ts`: `OsData`, `open`, `desktop`, `resolveApp`, `desktopApps`, and the two new apps.
- Modify `features/os/Desktop.tsx`: use `resolveApp`/`desktopApps` and pass `open`.
- Create `features/os/enter-opens.ts`: Enter opens, shared by shortcuts and contact rows. (Replaced during review by `open-gestures.ts`: a double click or a keyboard / screen-reader click opens.)
- Modify `features/os/Shortcut.tsx`: use `enterOpens`.
- Modify `features/os/icons.tsx`: the `messenger` icon.
- Create `features/os/apps/messenger/`: `status.ts`, `responder.ts`, `use-conversation.ts`, `Avatar.tsx`, `PersonLine.tsx`, `ContactRow.tsx`, `WhatsNew.tsx`, `Messenger.tsx`, `History.tsx`, `Conversation.tsx`, `messenger.module.css`.
- Tests: `tests/unit/cms/mappers.test.ts` (modify), `tests/unit/os/apps.test.ts`, `tests/unit/os/messenger/responder.test.ts`, `use-conversation.test.ts`, `messenger.test.ts`, `history.test.ts`, and `tests/e2e/os.spec.ts` (modify).

---

### Task 0: Worktree environment

**Files:** none tracked. This task copies untracked env files and the DB.

- [ ] **Step 1: Install dependencies**

Run: `bun install`
Expected: completes without errors.

- [ ] **Step 2: Copy the env files and a DB copy from the main checkout**

Use PowerShell:
```powershell
$main = 'D:\Second Brain\01.PROJETOS\applications\my-portfolio'
Copy-Item "$main\apps\payload\.env" apps\payload\.env
Copy-Item "$main\apps\web\.env.local" apps\web\.env.local
Copy-Item "$main\apps\payload\payload.db" apps\payload\payload.db
```
Then confirm that `apps/payload/.env` contains `DATABASE_URL=file:./payload.db`. The path is relative, so the CMS uses the worktree's copy. If it is anything else, stop and report.

- [ ] **Step 3: Point the worktree's web app at the worktree CMS (3101), and the CMS at web 3100**

In `apps/web/.env.local`, set `CMS_URL=http://localhost:3101` and `NEXT_PUBLIC_CMS_URL=http://localhost:3101`. In `apps/payload/.env`, set `WEB_URL=http://localhost:3100`. Only the worktree copies change.

- [ ] **Step 4: Baseline the gates**

Run: `bun run --cwd apps/web check-types`, then `bun run --cwd apps/web test`.
Expected: both pass. Note any failure that already exists before you change anything, so it isn't blamed on this work.

---

### Task 1: The `messenger` Payload global

**Files:**
- Create: `apps/payload/src/fields/required-text.ts`
- Modify: `apps/payload/src/globals/SiteSettings.ts:1-12`
- Create: `apps/payload/src/globals/Messenger.ts`
- Modify: `apps/payload/src/payload.config.ts` (imports and the `globals` array, line 36)
- Generated: `apps/payload/src/migrations/*_messenger.{ts,json}`, `apps/payload/src/migrations/index.ts`, `packages/cms-types/src/payload-types.ts`

- [ ] **Step 1: Extract `requiredText`**

Create `apps/payload/src/fields/required-text.ts`:
```ts
import type { TextField } from 'payload'

/** A required text field with a default, so a global is valid before anyone edits it. */
export const requiredText = (name: string, defaultValue: string, description?: string): TextField => ({
  name,
  type: 'text',
  required: true,
  defaultValue,
  admin: description ? { description } : undefined,
})
```
In `apps/payload/src/globals/SiteSettings.ts`, delete the local `requiredText` const (lines 6-12) and add `import { requiredText } from '../fields/required-text'` after the `link-url` import.

- [ ] **Step 2: Create the global**

Create `apps/payload/src/globals/Messenger.ts`:
```ts
import type { Field, GlobalConfig } from 'payload'
import { publicGlobalAccess } from '../access/public-read'
import { urlField } from '../fields/link-url'
import { requiredText } from '../fields/required-text'
import { revalidateGlobalHooks } from '../hooks/revalidate-web'

const STATUSES = [
  { label: 'Available', value: 'available' },
  { label: 'Busy', value: 'busy' },
  { label: 'Away', value: 'away' },
  { label: 'Offline', value: 'offline' },
]

/** A person as Messenger shows them: the visitor (viewer) or the owner (contact). */
const person = (name: string, personalMessage?: string): Field[] => [
  requiredText('name', name),
  { name: 'status', type: 'select', required: true, defaultValue: 'available', options: STATUSES },
  { name: 'personalMessage', type: 'text', defaultValue: personalMessage },
  { name: 'avatar', type: 'upload', relationTo: 'media' },
]

/** The Messenger app on the /os desktop: its window, the visitor, the one contact and What's new. */
export const Messenger: GlobalConfig = {
  slug: 'messenger',
  access: publicGlobalAccess,
  hooks: revalidateGlobalHooks,
  fields: [
    requiredText('title', 'Windows Live Messenger', 'The window title and taskbar tab.'),
    requiredText('shortcut', 'Messenger', 'The desktop shortcut label.'),
    {
      name: 'viewer',
      type: 'group',
      admin: { description: 'The visitor, signed in at the top of the main window.' },
      fields: person('Visitor', 'Say hi to Vinicius 👋'),
    },
    {
      name: 'contact',
      type: 'group',
      admin: { description: 'The one contact (the owner), listed under Favorites and Friends.' },
      fields: [
        ...person('Vinicius Queiroz'),
        {
          name: 'replies',
          type: 'array',
          required: true,
          minRows: 1,
          defaultValue: [{ text: 'hey! 👋' }],
          admin: { description: "Scripted replies: a visitor's Nth message gets the Nth reply; the last one repeats." },
          fields: [{ name: 'text', type: 'textarea', required: true }],
        },
      ],
    },
    {
      name: 'labels',
      type: 'group',
      fields: [
        requiredText('search', 'Search contacts or the web...'),
        requiredText('favorites', 'Favorites'),
        requiredText('friends', 'Friends'),
        requiredText('whatsNew', "What's new"),
        requiredText('typing', '{name} is typing a message...', "{name} is replaced by the contact's name."),
        requiredText('send', 'Send'),
      ],
    },
    {
      name: 'whatsNew',
      type: 'array',
      admin: { description: "The What's new panel; several items get a pager." },
      fields: [
        { name: 'text', type: 'text', required: true },
        { name: 'linkLabel', type: 'text', admin: { description: 'Defaults to the URL.' } },
        urlField('url'),
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
```

- [ ] **Step 3: Register it**

In `apps/payload/src/payload.config.ts`, add `import { Messenger } from './globals/Messenger'` next to the other globals' imports. Change line 36 to:
```ts
  globals: [Profile, Contact, Navigation, SiteSettings, Messenger],
```

- [ ] **Step 4: Type-check the CMS**

Run: `bun run --cwd apps/payload check-types`
Expected: PASS.

- [ ] **Step 5: Create the migration**

Run: `bun run --cwd apps/payload payload migrate:create messenger`
Expected: it creates `apps/payload/src/migrations/<timestamp>_messenger.ts` and `.json`, and adds the migration to `migrations/index.ts`. Open the `.ts` file. It should create the `messenger` table plus its array tables (`messenger_contact_replies` and `messenger_whats_new`) and their rels. If it also contains statements for other tables, that is real schema drift since the initial migration. Keep it, and mention it in your report.

- [ ] **Step 6: Regenerate the shared types**

Run: `bun run --cwd apps/payload generate:types`
Expected: `packages/cms-types/src/payload-types.ts` now has `export interface Messenger` with `title`, `shortcut`, `viewer`, `contact` (including `replies: { text: string; id?: string | null }[]`), `labels` and `whatsNew?`. Read the generated interface. Task 3's mapper is written against it.

- [ ] **Step 7: Commit**

Stage each path with its own `git add` call: `apps/payload/src/fields/required-text.ts`, `apps/payload/src/globals/SiteSettings.ts`, `apps/payload/src/globals/Messenger.ts`, `apps/payload/src/payload.config.ts`, `apps/payload/src/migrations`, `packages/cms-types/src/payload-types.ts`. Then run:
```bash
git commit -m "feat(cms): Messenger global for the OS's Messenger app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Seed the messenger content (on the worktree's DB copy)

**Files:**
- Modify: `apps/payload/src/seed/data.ts` (append)
- Modify: `apps/payload/src/seed/run.ts:28` (after the `site-settings` line)

- [ ] **Step 1: Add the seed data**

Append to `apps/payload/src/seed/data.ts`:
```ts
export const messenger = {
  title: 'Windows Live Messenger',
  shortcut: 'Messenger',
  viewer: { name: 'Visitor', status: 'available' as const, personalMessage: 'Say hi to Vinicius 👋' },
  contact: {
    name: 'Vinicius Queiroz',
    status: 'available' as const,
    personalMessage: 'building things on the web, one pixel at a time',
    replies: [
      { text: 'hey! 👋 thanks for stopping by my desktop' },
      { text: "this is the old-school me, scripted for now. a version of me that really answers is on the way" },
      { text: 'meanwhile, have a look at My Showcase or My Resume, everything I do is in there' },
      { text: 'brb 🙂' },
    ],
  },
  labels: {
    search: 'Search contacts or the web...',
    favorites: 'Favorites',
    friends: 'Friends',
    whatsNew: "What's new",
    typing: '{name} is typing a message...',
    send: 'Send',
  },
  whatsNew: [
    { text: 'Vinicius added Messenger to his desktop.', linkLabel: 'See the site', url: '/' },
    { text: 'Vinicius published a new post.', linkLabel: 'Read the blog', url: '/blog' },
  ],
}
```

- [ ] **Step 2: Write it in the seed run**

In `apps/payload/src/seed/run.ts`, after the `site-settings` `updateGlobal` line, add:
```ts
await payload.updateGlobal({ slug: 'messenger', data: seed.messenger, context: quiet })
```

- [ ] **Step 3: Type-check**

Run: `bun run --cwd apps/payload check-types`
Expected: PASS. If `status` literals or readonly arrays fail to typecheck, fix the literal typing in `data.ts`. Don't cast `as any`.

- [ ] **Step 4: Run the seed against the worktree's copy**

First check again that `apps/payload/.env` has `DATABASE_URL=file:./payload.db`, and that `apps/payload/payload.db` exists in the **worktree**.
Run: `bun run --cwd apps/payload seed`
Expected: it logs `Seed complete`. Dev schema push creates the new tables on the copy.

- [ ] **Step 5: Commit**

Stage `apps/payload/src/seed/data.ts` and `apps/payload/src/seed/run.ts` with separate `git add` calls, then:
```bash
git commit -m "feat(cms): seed Messenger with Vinicius, scripted replies and What's new

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web Messenger types and the `toMessenger` mapper

**Files:**
- Modify: `apps/web/lib/cms/types.ts` (append)
- Modify: `apps/web/lib/cms/mappers.ts`
- Test: `apps/web/tests/unit/cms/mappers.test.ts` (append)

- [ ] **Step 1: Add the types**

Append to `apps/web/lib/cms/types.ts`:
```ts
export type MessengerStatus = 'available' | 'busy' | 'away' | 'offline'

/** Someone the Messenger shows: the visitor or the contact. Absolute avatar URL. */
export interface MessengerPerson {
  name: string
  status: MessengerStatus
  personalMessage?: string
  avatar?: string
}

export interface MessengerContact extends MessengerPerson {
  /** Scripted replies, in order; the last one repeats. */
  replies: string[]
}

export interface WhatsNewItem {
  id: string
  text: string
  link?: { label: string; href: string }
  image?: string
}

export interface MessengerLabels {
  search: string
  favorites: string
  friends: string
  whatsNew: string
  /** `{name}` is replaced by the contact's name. */
  typing: string
  send: string
}

export interface Messenger {
  title: string
  shortcut: string
  viewer: MessengerPerson
  contact: MessengerContact
  labels: MessengerLabels
  whatsNew: WhatsNewItem[]
}
```

- [ ] **Step 2: Write the failing test**

Append to `apps/web/tests/unit/cms/mappers.test.ts`. Add `Messenger as CmsMessenger` to the existing `@repo/cms-types` import, and `toMessenger` to the existing mappers import:
```ts
describe('toMessenger', () => {
  const doc = {
    id: 1,
    title: 'Windows Live Messenger',
    shortcut: 'Messenger',
    viewer: { name: 'Visitor', status: 'available', personalMessage: '  ', avatar: null },
    contact: {
      name: 'Vinicius Queiroz',
      status: 'away',
      personalMessage: ' building things ',
      avatar: { url: '/api/media/file/v.png' },
      replies: [{ id: 'a', text: 'hey' }, { id: 'b', text: 'brb' }],
    },
    labels: { search: 's', favorites: 'f', friends: 'fr', whatsNew: 'w', typing: '{name} is typing', send: 'Send' },
    whatsNew: [
      { id: 'n1', text: 'New post', linkLabel: '', url: '/blog', image: { url: '/api/media/file/t.png' } },
      { id: 'n2', text: 'Unsafe', linkLabel: 'x', url: 'javascript:alert(1)', image: null },
    ],
  } as unknown as CmsMessenger

  it('maps people, trimming empty personal messages away and resolving avatars', () => {
    const m = toMessenger(doc, BASE)
    expect(m.viewer).toEqual({ name: 'Visitor', status: 'available', personalMessage: undefined, avatar: undefined })
    expect(m.contact).toEqual({
      name: 'Vinicius Queiroz',
      status: 'away',
      personalMessage: 'building things',
      avatar: 'http://cms.test/api/media/file/v.png',
      replies: ['hey', 'brb'],
    })
    expect(m.labels.typing).toBe('{name} is typing')
    expect(m.title).toBe('Windows Live Messenger')
    expect(m.shortcut).toBe('Messenger')
  })

  it("keeps What's new items, labels a link by its URL when unlabelled and drops unsafe links", () => {
    expect(toMessenger(doc, BASE).whatsNew).toEqual([
      { id: 'n1', text: 'New post', link: { label: '/blog', href: '/blog' }, image: 'http://cms.test/api/media/file/t.png' },
      { id: 'n2', text: 'Unsafe', link: undefined, image: undefined },
    ])
  })

  it("tolerates a global saved without What's new", () => {
    expect(toMessenger({ ...doc, whatsNew: null } as unknown as CmsMessenger, BASE).whatsNew).toEqual([])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/cms/mappers.test.ts`
Expected: FAIL, because `toMessenger` is not exported.

- [ ] **Step 4: Implement**

In `apps/web/lib/cms/mappers.ts`:
- add `Messenger as CmsMessenger` to the `@repo/cms-types` import;
- add `Messenger, MessengerPerson` to the `./types` import;
- append:
```ts
const toPerson = (p: CmsMessenger['viewer'], base: string): MessengerPerson => ({
  name: p.name,
  status: p.status,
  personalMessage: p.personalMessage?.trim() || undefined,
  avatar: mediaUrl(p.avatar, base),
})

export function toMessenger(m: CmsMessenger, base: string): Messenger {
  return {
    title: m.title,
    shortcut: m.shortcut,
    viewer: toPerson(m.viewer, base),
    contact: { ...toPerson(m.contact, base), replies: m.contact.replies.map((r) => r.text) },
    labels: m.labels,
    whatsNew: (m.whatsNew ?? []).map((w, i) => {
      const href = safeHref(w.url)
      return {
        id: w.id ?? String(i),
        text: w.text,
        link: href ? { label: w.linkLabel?.trim() || href, href } : undefined,
        image: mediaUrl(w.image, base),
      }
    }),
  }
}
```
If the generated `labels` type carries extra keys (for example `id`) that `MessengerLabels` lacks, build the object field by field instead. Do not cast.

- [ ] **Step 5: Run the tests**

Run: `bun run --cwd apps/web test tests/unit/cms/mappers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Stage `apps/web/lib/cms/types.ts`, `apps/web/lib/cms/mappers.ts` and `apps/web/tests/unit/cms/mappers.test.ts` (separate `git add` calls), then:
```bash
git commit -m "feat(cms-web): map the Messenger global for the OS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: OS plumbing: `OsData`, `open`, desktop-less apps

**Files:**
- Modify: `apps/web/lib/cms/queries.ts`
- Modify: `apps/web/app/(os)/os/page.tsx`
- Modify: `apps/web/features/os/apps.ts`
- Modify: `apps/web/features/os/Desktop.tsx`
- Create: `apps/web/features/os/enter-opens.ts`
- Modify: `apps/web/features/os/Shortcut.tsx`
- Test: `apps/web/tests/unit/os/apps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/os/apps.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { desktopApps, resolveApp, type OsApp, type OsData } from '@/features/os/apps'

const Noop = () => null
const data = { profile: { name: 'Vinicius Queiroz' }, messenger: { shortcut: 'Messenger' } } as unknown as OsData

describe('resolveApp', () => {
  it('resolves a title and a shortcut that come from content', () => {
    const app: OsApp = { id: 'a', title: (d) => `${d.profile.name} - App`, shortcut: (d) => d.messenger.shortcut, icon: 'folder', component: Noop }
    expect(resolveApp(app, data)).toMatchObject({ title: 'Vinicius Queiroz - App', shortcut: 'Messenger' })
  })
  it('keeps fixed text and a missing shortcut as they are', () => {
    expect(resolveApp({ id: 'b', title: 'Credits', icon: 'document', component: Noop }, data)).toMatchObject({ title: 'Credits', shortcut: undefined })
  })
})

describe('desktopApps', () => {
  it('leaves out apps another app opens (desktop: false)', () => {
    const apps = [{ id: 'messenger' }, { id: 'conversation', desktop: false as const }, { id: 'credits' }]
    expect(desktopApps(apps).map((a) => a.id)).toEqual(['messenger', 'credits'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/os/apps.test.ts`
Expected: FAIL, because `resolveApp` and `desktopApps` are not exported.

- [ ] **Step 3: Rework `apps.ts`'s types and helpers**

In `apps/web/features/os/apps.ts`, replace everything from the imports through `export type ResolvedApp …`, and the `appTitle` export, with the following. The `DOS_CHROME` const, the `APPS` array and `BOOT_APP` stay as they are.
```ts
import type { ComponentType } from 'react'
import type { Messenger as MessengerData, Portfolio } from '@/lib/cms/types'
import type { IconName } from './icons'
import type { Size } from './window-geometry'
import { Credits } from './apps/Credits'
import { dosApp } from './apps/dos-app'
import { Showcase } from './apps/Showcase'

/** What the OS apps read: the portfolio plus the content only the desktop shows. */
export interface OsData extends Portfolio {
  messenger: MessengerData
}

export interface OsAppProps {
  data: OsData
  /** Opens another app's window, or raises it when open, as the Messenger opens a conversation. */
  open: (appId: string) => void
}

/** Text that is fixed, or that comes from content (e.g. the owner's name). */
type Text = string | ((data: OsData) => string)

export interface OsApp {
  id: string
  title: Text
  /** The desktop label, short like the reference's ("My Showcase"); omitted = the title. */
  shortcut?: Text
  /** false: no desktop shortcut; another app opens it (the Messenger's conversation). */
  desktop?: false
  icon: IconName
  component: ComponentType<OsAppProps>
  /** Opening size; omitted = fill the desk with a margin. */
  size?: Size
  /** Opening shape instead of a size: content width / height, as tall as the fill window allows. */
  aspect?: number
  /** The status bar's text; omitted = the owner's copyright line. */
  status?: string
  /** The active title bar's colour, as the reference's Doom paints its own. */
  barColor?: string
}

/** An app whose texts have been resolved against the content, for the chrome that only shows text. */
export type ResolvedApp = Omit<OsApp, 'title' | 'shortcut'> & { title: string; shortcut?: string }

const resolve = (text: Text, data: OsData): string => (typeof text === 'function' ? text(data) : text)

export const resolveApp = (app: OsApp, data: OsData): ResolvedApp => ({
  ...app,
  title: resolve(app.title, data),
  shortcut: app.shortcut === undefined ? undefined : resolve(app.shortcut, data),
})

/** The apps with a desktop shortcut. */
export const desktopApps = <T extends { desktop?: false }>(apps: readonly T[]): T[] => apps.filter((app) => app.desktop !== false)
```
Delete the old `appTitle` export (`resolveApp` replaces it).

- [ ] **Step 4: Run the test**

Run: `bun run --cwd apps/web test tests/unit/os/apps.test.ts`
Expected: PASS.

- [ ] **Step 5: Share "Enter opens"**

Create `apps/web/features/os/enter-opens.ts`:
```ts
import type { KeyboardEvent } from 'react'

/** Enter opens, as a double click does: desktop shortcuts and Messenger contacts. */
export const enterOpens = (onOpen: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter') onOpen()
}
```
Replace `apps/web/features/os/Shortcut.tsx` with:
```tsx
'use client'
import { enterOpens } from './enter-opens'
import { Icon, type IconName } from './icons'
import styles from './Shortcut.module.css'

/** A desktop icon: a click selects (focus), a double click or Enter opens. */
export function Shortcut({ icon, label, onOpen }: { icon: IconName; label: string; onOpen: () => void }) {
  return (
    <button type="button" className={styles.shortcut} onDoubleClick={onOpen} onKeyDown={enterOpens(onOpen)}>
      <Icon name={icon} size={32} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
```

- [ ] **Step 6: Desktop takes `OsData` and passes `open`**

In `apps/web/features/os/Desktop.tsx`:
- change the imports: remove `import type { Portfolio } from '@/lib/cms/types'`, and make the apps import `import { APPS, BOOT_APP, desktopApps, resolveApp, type OsData, type ResolvedApp } from './apps'`;
- change the signature to `export function Desktop({ data }: { data: OsData }) {`;
- after `const reboot = …`, add:
```tsx
  const open = useCallback((id: string) => dispatch({ type: 'open', id }), [])
```
- replace the `const apps …` line with:
```tsx
  const apps: readonly ResolvedApp[] = APPS.map((app) => resolveApp(app, data))
```
- in the shortcuts block, map over `desktopApps(apps)` instead of `apps`;
- render the app as `<App data={data} open={open} />`;
- fix the existing missing space: `<Taskbar apps={apps} windows={wm} …`.

- [ ] **Step 7: Fetch the messenger on `/os`**

In `apps/web/lib/cms/queries.ts`:
- add `Messenger as CmsMessenger` to the `@repo/cms-types` import;
- import `toMessenger` alongside `toPortfolio`, and the `Messenger` type alongside `Portfolio`;
- append:
```ts
/** The Messenger app's content; only the OS desktop shows it, so only `/os` fetches it. */
export const getMessenger = cache(async (): Promise<Messenger> => toMessenger(await cmsGlobal<CmsMessenger>('messenger'), cmsBaseUrl()))
```
Replace the body of `apps/web/app/(os)/os/page.tsx`'s component and its import:
```tsx
import { getMessenger, getPortfolio } from '@/lib/cms/queries'
```
```tsx
export default async function OsPage() {
  const [portfolio, messenger] = await Promise.all([getPortfolio(), getMessenger()])
  return <Desktop data={{ ...portfolio, messenger }} />
}
```

- [ ] **Step 8: Gates**

Run: `bun run --cwd apps/web check-types`, then `bun run --cwd apps/web test`.
Expected: both PASS. The existing apps (`Showcase`, `Credits`, `dosApp`) take `{ data }: OsAppProps` and still compile, because `OsData` extends `Portfolio`.

- [ ] **Step 9: Commit**

Stage each modified or created file (the 6 source files above plus `apps/web/tests/unit/os/apps.test.ts`) with separate `git add` calls, then:
```bash
git commit -m "feat(os): apps can open other apps; apps without a desktop shortcut; /os fetches the Messenger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Conversation logic: statuses and the scripted responder

**Files:**
- Create: `apps/web/features/os/apps/messenger/status.ts`
- Create: `apps/web/features/os/apps/messenger/responder.ts`
- Test: `apps/web/tests/unit/os/messenger/responder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/os/messenger/responder.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { scriptedResponder, typingDelay, type Message } from '@/features/os/apps/messenger/responder'

const fromViewer = (n: number): Message[] => Array.from({ length: n }, (_, i) => ({ id: i, from: 'viewer', text: `m${i}` }))

describe('scriptedResponder', () => {
  it("answers the visitor's Nth message with the Nth reply, then repeats the last", async () => {
    const respond = scriptedResponder(['a', 'b'])
    expect(await respond(fromViewer(1))).toBe('a')
    expect(await respond(fromViewer(2))).toBe('b')
    expect(await respond(fromViewer(3))).toBe('b')
  })
  it("counts only the visitor's messages", async () => {
    const history: Message[] = [
      { id: 0, from: 'viewer', text: 'hi' },
      { id: 1, from: 'contact', text: 'a' },
      { id: 2, from: 'viewer', text: 'again' },
    ]
    expect(await scriptedResponder(['a', 'b', 'c'])(history)).toBe('b')
  })
  it('stays silent without replies', async () => {
    expect(await scriptedResponder([])(fromViewer(1))).toBe('')
  })
})

describe('typingDelay', () => {
  it('grows with the reply, clamped between 0.8 s and 2.5 s', () => {
    expect(typingDelay('')).toBe(800)
    expect(typingDelay('x'.repeat(30))).toBe(1200)
    expect(typingDelay('x'.repeat(500))).toBe(2500)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/responder.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

Create `apps/web/features/os/apps/messenger/responder.ts`:
```ts
export type Sender = 'viewer' | 'contact'

export interface Message {
  id: number
  from: Sender
  text: string
}

/** Produces the contact's next reply to the conversation so far ('' = no reply). */
export type Responder = (history: readonly Message[]) => Promise<string>

/** The visitor's Nth message gets the Nth reply; once they run out, the last one repeats. */
export const scriptedResponder =
  (replies: readonly string[]): Responder =>
  async (history) => {
    const sent = history.filter((m) => m.from === 'viewer').length
    return replies[Math.min(sent, replies.length) - 1] ?? ''
  }

const MS_PER_CHAR = 40
const MIN_MS = 800
const MAX_MS = 2500

/** How long the contact "is typing" before a reply appears. */
export const typingDelay = (reply: string): number => Math.min(MAX_MS, Math.max(MIN_MS, reply.length * MS_PER_CHAR))
```
Create `apps/web/features/os/apps/messenger/status.ts`:
```ts
import type { MessengerStatus } from '@/lib/cms/types'

/** As Messenger writes it after a name: "Vinicius Queiroz (Available)". */
export const STATUS_LABEL: Record<MessengerStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  away: 'Away',
  offline: 'Offline',
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/responder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Stage the three files with separate `git add` calls, then:
```bash
git commit -m "feat(os): Messenger's scripted responder and status labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `useConversation` hook

**Files:**
- Create: `apps/web/features/os/apps/messenger/use-conversation.ts`
- Test: `apps/web/tests/unit/os/messenger/use-conversation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/os/messenger/use-conversation.test.ts`:
```ts
// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scriptedResponder, typingDelay } from '@/features/os/apps/messenger/responder'
import { useConversation } from '@/features/os/apps/messenger/use-conversation'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const respond = scriptedResponder(['one', 'two'])
let api: ReturnType<typeof useConversation>

function Harness() {
  api = useConversation(respond)
  return null
}

let host: HTMLElement
let root: Root
let mounted: boolean

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
  mounted = true
})

afterEach(() => {
  if (mounted) act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const lines = () => api.messages.map((m) => [m.from, m.text])

describe('useConversation', () => {
  it("appends the visitor's message, types, then appends the reply", async () => {
    await act(async () => {
      void api.send('  hi  ')
    })
    expect(lines()).toEqual([['viewer', 'hi']])
    expect(api.typing).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('one'))
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'hi'], ['contact', 'one']])
  })

  it('keeps typing until every pending reply has arrived', async () => {
    await act(async () => {
      void api.send('a')
      void api.send('b')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('one'))
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'a'], ['viewer', 'b'], ['contact', 'one'], ['contact', 'two']])
  })

  it('ignores blank input', async () => {
    await act(async () => {
      void api.send('   ')
    })
    expect(api.messages).toEqual([])
    expect(api.typing).toBe(false)
  })

  it('drops a reply that arrives after the window closed', async () => {
    await act(async () => {
      void api.send('hi')
    })
    act(() => root.unmount())
    mounted = false
    await vi.advanceTimersByTimeAsync(typingDelay('one'))
    expect(lines()).toEqual([['viewer', 'hi']])
  })
})
```
Note on the second test: the responder is called the moment each message is sent, with the history up to that message. So the first send gets "one" and the second gets "two", and typing stays on until both have arrived.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/use-conversation.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

Create `apps/web/features/os/apps/messenger/use-conversation.ts`:
```ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { typingDelay, type Message, type Responder, type Sender } from './responder'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A chat with one contact: the messages so far, whether the contact is typing, and `send`. */
export function useConversation(respond: Responder) {
  const [messages, setMessages] = useState<readonly Message[]>([])
  const [typing, setTyping] = useState(false)
  // refs: a reply in flight must see every message sent meanwhile, whatever React has rendered
  const history = useRef<readonly Message[]>([])
  const nextId = useRef(0)
  const pending = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const append = useCallback((from: Sender, text: string) => {
    history.current = [...history.current, { id: nextId.current++, from, text }]
    setMessages(history.current)
  }, [])

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text) return
      append('viewer', text)
      pending.current += 1
      setTyping(true)
      try {
        const reply = await respond(history.current)
        await wait(typingDelay(reply))
        if (mounted.current && reply) append('contact', reply)
      } finally {
        pending.current -= 1
        if (mounted.current) setTyping(pending.current > 0)
      }
    },
    [append, respond],
  )

  return { messages, typing, send }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/use-conversation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

Stage both files with separate `git add` calls, then:
```bash
git commit -m "feat(os): useConversation, the Messenger chat's state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Shared Messenger UI: Avatar, PersonLine, base styles, icon

**Files:**
- Create: `apps/web/features/os/apps/messenger/messenger.module.css`
- Create: `apps/web/features/os/apps/messenger/Avatar.tsx`
- Create: `apps/web/features/os/apps/messenger/PersonLine.tsx`
- Modify: `apps/web/features/os/icons.tsx:3` and the `PATHS` table

This task has no unit test: these are presentational components, and the e2e and visual checks in Task 10 cover them.

- [ ] **Step 1: Base styles**

Create `apps/web/features/os/apps/messenger/messenger.module.css`:
```css
/* Windows Live Messenger 2009 inside the Win98 chrome: Aero blues, Segoe UI, frames coloured by status. */
.messenger,
.conversation {
  --msn-font: 'Segoe UI', Tahoma, Arial, sans-serif;
  --msn-text: #1b1b1b;
  --msn-muted: #6d7b8d;
  --msn-heading: #1e5aa8;
  --msn-link: #0066cc;
  --msn-line: #c5d9ee;
  --msn-field: #a9c4e2;
  --msn-sky: linear-gradient(180deg, #e9f4fd 0%, #d2e7fa 100%);
  --msn-band: linear-gradient(180deg, #5aa7e6 0%, #2e7ccc 100%);
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  font: 12px/1.35 var(--msn-font);
  color: var(--msn-text);
  background: linear-gradient(180deg, #ffffff 60%, #e6f1fb 100%);
}

/* Status colours, used by the avatar frame and the Friends dot. */
.avatar,
.dot {
  --msn-status-hi: #8ee05a;
  --msn-status-lo: #3c9a1c;
}
.avatar[data-status='busy'],
.dot[data-status='busy'] {
  --msn-status-hi: #f58a7c;
  --msn-status-lo: #c42b1c;
}
.avatar[data-status='away'],
.dot[data-status='away'] {
  --msn-status-hi: #f8d37c;
  --msn-status-lo: #d98a10;
}
.avatar[data-status='offline'],
.dot[data-status='offline'] {
  --msn-status-hi: #dadada;
  --msn-status-lo: #9a9a9a;
}

.avatar {
  flex: none;
  display: grid;
  padding: 4px;
  border-radius: 9px;
  background: linear-gradient(160deg, var(--msn-status-hi), var(--msn-status-lo));
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.6);
}
.avatar[data-size='lg'] {
  width: 96px;
  height: 96px;
}
.avatar[data-size='md'] {
  width: 64px;
  height: 64px;
  padding: 3px;
  border-radius: 7px;
}
.avatar[data-size='sm'] {
  width: 32px;
  height: 32px;
  padding: 2px;
  border-radius: 5px;
}
.avatar > img,
.avatar > svg {
  width: 100%;
  height: 100%;
  border-radius: 5px;
  object-fit: cover;
  background: #ffffff;
}
.avatar[data-size='sm'] > img,
.avatar[data-size='sm'] > svg {
  border-radius: 3px;
}

.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: linear-gradient(var(--msn-status-hi), var(--msn-status-lo));
}

/* "Name (Status)" over the personal message, or all on one line ("Name (Status) - message"). */
.person {
  display: block;
  min-width: 0;
}
.headline,
.message {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status,
.message {
  color: var(--msn-muted);
}
.person[data-layout='inline'] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person[data-layout='inline'] .headline,
.person[data-layout='inline'] .message {
  display: inline;
}
.person[data-layout='inline'] .message::before {
  content: ' - ';
}
.person[data-large] .name {
  font-size: 18px;
}
.person[data-large] .headline {
  margin-bottom: 2px;
}
.person[data-large] .message {
  color: var(--msn-text);
}
```

- [ ] **Step 2: Avatar**

Create `apps/web/features/os/apps/messenger/Avatar.tsx`:
```tsx
import type { MessengerPerson } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** Messenger's default picture, for people without an uploaded avatar. */
function Silhouette() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" fill="#eef4fb" />
      <circle cx="24" cy="18" r="9" fill="#9fb6cf" />
      <path d="M8 48c0-10 7-17 16-17s16 7 16 17z" fill="#9fb6cf" />
    </svg>
  )
}

/** A display picture in a frame coloured by the person's status. Decorative: the name is always beside it. */
export function Avatar({ person, size }: { person: MessengerPerson; size: 'lg' | 'md' | 'sm' }) {
  return (
    <span className={styles.avatar} data-size={size} data-status={person.status}>
      {person.avatar ? <img src={person.avatar} alt="" /> : <Silhouette />}
    </span>
  )
}
```

- [ ] **Step 3: PersonLine**

Create `apps/web/features/os/apps/messenger/PersonLine.tsx`:
```tsx
import type { MessengerPerson } from '@/lib/cms/types'
import { STATUS_LABEL } from './status'
import styles from './messenger.module.css'

interface Props {
  person: MessengerPerson
  /** One line, "Name (Status) - message", as the Friends list writes it. */
  inline?: boolean
  /** The big name of a window's header. */
  large?: boolean
}

/** "Name (Status)" and the personal message: the header, the contact rows and the conversation's header. */
export function PersonLine({ person, inline = false, large = false }: Props) {
  return (
    <span className={styles.person} data-layout={inline ? 'inline' : 'stacked'} data-large={large || undefined}>
      <span className={styles.headline}>
        <span className={styles.name}>{person.name}</span> <span className={styles.status}>({STATUS_LABEL[person.status]})</span>
      </span>
      {person.personalMessage && <span className={styles.message}>{person.personalMessage}</span>}
    </span>
  )
}
```

- [ ] **Step 4: The Messenger icon**

In `apps/web/features/os/icons.tsx`, add `'messenger'` to the `IconName` union (after `'resume'`). Add this entry to `PATHS` after `flag`:
```ts
  // Messenger's two buddies: blue behind, green in front
  messenger: [
    { fill: '#2b7bd6', d: 'M9 2h4v4H9zM8 7h6v5H8z' },
    { fill: '#3aa63a', d: 'M3 4h4v4H3zM2 9h6v5H2z' },
  ],
```

- [ ] **Step 5: Gates**

Run: `bun run --cwd apps/web check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

Stage the four files with separate `git add` calls, then:
```bash
git commit -m "feat(os): Messenger's avatar, person line, styles and icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Messenger main window

**Files:**
- Create: `apps/web/features/os/apps/messenger/ContactRow.tsx`
- Create: `apps/web/features/os/apps/messenger/WhatsNew.tsx`
- Create: `apps/web/features/os/apps/messenger/Messenger.tsx`
- Modify: `apps/web/features/os/apps/messenger/messenger.module.css` (append)
- Modify: `apps/web/features/os/apps.ts` (an import and an `APPS` entry)
- Test: `apps/web/tests/unit/os/messenger/messenger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/os/messenger/messenger.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { matchesQuery } from '@/features/os/apps/messenger/Messenger'

describe('matchesQuery', () => {
  it('matches any part of the name, ignoring case and surrounding spaces', () => {
    expect(matchesQuery('Vinicius Queiroz', '  queir ')).toBe(true)
  })
  it('matches everyone when the search is empty', () => {
    expect(matchesQuery('Vinicius Queiroz', '')).toBe(true)
  })
  it('rejects a name without the text', () => {
    expect(matchesQuery('Vinicius Queiroz', 'zzz')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/messenger.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: ContactRow**

Create `apps/web/features/os/apps/messenger/ContactRow.tsx`:
```tsx
import type { MessengerPerson } from '@/lib/cms/types'
import { enterOpens } from '../../enter-opens'
import { Avatar } from './Avatar'
import { PersonLine } from './PersonLine'
import styles from './messenger.module.css'

interface Props {
  contact: MessengerPerson
  /** Favorites show a small picture; groups show a status dot and one line. */
  variant: 'favorite' | 'friend'
  onOpen: () => void
}

/** A contact in the list: a click selects, a double click or Enter opens the conversation. */
export function ContactRow({ contact, variant, onOpen }: Props) {
  const favorite = variant === 'favorite'
  return (
    <li>
      <button type="button" className={styles.row} onDoubleClick={onOpen} onKeyDown={enterOpens(onOpen)}>
        {favorite ? <Avatar person={contact} size="sm" /> : <span className={styles.dot} data-status={contact.status} aria-hidden="true" />}
        <PersonLine person={contact} inline={!favorite} />
      </button>
    </li>
  )
}
```

- [ ] **Step 4: WhatsNew**

Create `apps/web/features/os/apps/messenger/WhatsNew.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { WhatsNewItem } from '@/lib/cms/types'
import styles from './messenger.module.css'

/** The What's new panel: one item at a time, with a pager when there are several. Expects at least one item. */
export function WhatsNew({ label, items }: { label: string; items: readonly WhatsNewItem[] }) {
  const [index, setIndex] = useState(0)
  const item = items[index] ?? items[0]
  if (!item) return null
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length)
  return (
    <section className={styles.whatsNew} aria-label={label}>
      <h2 className={styles.heading}>{label}</h2>
      <div className={styles.news}>
        <p>
          {item.text}
          {item.link && (
            <>
              {' '}
              {/* a new tab: the desktop may be running inside the desk scene's monitor */}
              <a href={item.link.href} target="_blank" rel="noopener noreferrer">
                {item.link.label}
              </a>
            </>
          )}
        </p>
        {item.image && <img className={styles.thumb} src={item.image} alt="" />}
      </div>
      {items.length > 1 && (
        <div className={styles.pager}>
          <button type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
          <span>{index + 1}/{items.length}</span>
          <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Messenger**

Create `apps/web/features/os/apps/messenger/Messenger.tsx`:
```tsx
'use client'
import { useState, type ReactNode } from 'react'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { ContactRow } from './ContactRow'
import { PersonLine } from './PersonLine'
import { WhatsNew } from './WhatsNew'
import styles from './messenger.module.css'

export const matchesQuery = (name: string, query: string): boolean =>
  name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** A collapsible contact group, "Favorites (1)"; native details/summary does the collapsing. */
function Group({ label, count, star = false, children }: { label: string; count: number; star?: boolean; children: ReactNode }) {
  return (
    <details open className={styles.group}>
      <summary>
        {star && <span className={styles.star} aria-hidden="true">★</span>}
        {label} <span className={styles.count}>({count})</span>
      </summary>
      <ul className={styles.contacts}>{children}</ul>
    </details>
  )
}

/** The main window: the visitor signed in, the owner under Favorites and Friends, and What's new. */
export function Messenger({ data, open }: OsAppProps) {
  const { viewer, contact, labels, whatsNew } = data.messenger
  const [query, setQuery] = useState('')
  const shown = matchesQuery(contact.name, query)
  const openConversation = () => open('conversation')
  return (
    <div className={styles.messenger}>
      <header className={styles.header}>
        <Avatar person={viewer} size="md" />
        <PersonLine person={viewer} large />
      </header>
      <input
        type="search"
        className={styles.search}
        placeholder={labels.search}
        aria-label={labels.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        <Group label={labels.favorites} count={shown ? 1 : 0} star>
          {shown && <ContactRow contact={contact} variant="favorite" onOpen={openConversation} />}
        </Group>
        <Group label={labels.friends} count={shown ? 1 : 0}>
          {shown && <ContactRow contact={contact} variant="friend" onOpen={openConversation} />}
        </Group>
      </div>
      {whatsNew.length > 0 && <WhatsNew label={labels.whatsNew} items={whatsNew} />}
    </div>
  )
}
```

- [ ] **Step 6: Main-window styles**

Append to `messenger.module.css`:
```css
/* The main window */
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--msn-sky);
  border-bottom: 1px solid var(--msn-line);
}
.search {
  margin: 8px 12px 4px;
  padding: 3px 6px;
  border: 1px solid var(--msn-field);
  border-radius: 2px;
  font: inherit;
  color: var(--msn-text);
  background: #ffffff;
}
.search::placeholder {
  color: #8a9bb0;
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 0 6px;
}
.group > summary {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 12px 2px;
  list-style: none;
  font-size: 15px;
  color: var(--msn-heading);
  cursor: default;
}
.group > summary::-webkit-details-marker {
  display: none;
}
.star {
  color: #f2b01e;
}
.count {
  font-size: 12px;
  color: var(--msn-muted);
}
.contacts {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 3px 12px 3px 20px;
  border: 1px solid transparent;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: default;
}
.row:hover {
  border-color: #c9def4;
  background: #eaf3fc;
}
.row:focus-visible {
  outline: 1px dotted var(--msn-heading);
  outline-offset: -2px;
  background: #dcebfb;
}
.whatsNew {
  padding: 8px 12px 10px;
  border-top: 1px solid var(--msn-line);
}
.heading {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 400;
  color: var(--msn-heading);
}
.news {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.news > p {
  flex: 1;
  margin: 0;
}
.news a {
  color: var(--msn-link);
}
.thumb {
  width: 64px;
  height: 48px;
  border: 1px solid #b8cde3;
  object-fit: cover;
}
.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--msn-muted);
}
.pager > button {
  padding: 0 6px;
  border: 1px solid #b8cde3;
  border-radius: 2px;
  background: #ffffff;
  font: inherit;
  color: var(--msn-heading);
}
```

- [ ] **Step 7: Register the app**

In `apps/web/features/os/apps.ts`, add `import { Messenger } from './apps/messenger/Messenger'` after the `dosApp` import. Insert this entry into `APPS` after `autocad`:
```ts
  {
    id: 'messenger',
    title: (data) => data.messenger.title,
    shortcut: (data) => data.messenger.shortcut,
    icon: 'messenger',
    component: Messenger,
    // the reference's tall contact list
    size: { width: 360, height: 640 },
  },
```

- [ ] **Step 8: Gates**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/messenger.test.ts`, then `bun run --cwd apps/web check-types`.
Expected: both PASS.

- [ ] **Step 9: Commit**

Stage the six files with separate `git add` calls (the three new components, the CSS, `apps.ts` and the test), then:
```bash
git commit -m "feat(os): Messenger's main window with Favorites, Friends and What's new

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Conversation window

**Files:**
- Create: `apps/web/features/os/apps/messenger/History.tsx`
- Create: `apps/web/features/os/apps/messenger/Conversation.tsx`
- Modify: `apps/web/features/os/apps/messenger/messenger.module.css` (append)
- Modify: `apps/web/features/os/apps.ts` (an import and an `APPS` entry)
- Test: `apps/web/tests/unit/os/messenger/history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/os/messenger/history.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { groupBySender } from '@/features/os/apps/messenger/History'
import type { Message } from '@/features/os/apps/messenger/responder'

const m = (id: number, from: Message['from']): Message => ({ id, from, text: `t${id}` })

describe('groupBySender', () => {
  it('runs consecutive messages from one sender under one name', () => {
    const groups = groupBySender([m(0, 'viewer'), m(1, 'viewer'), m(2, 'contact'), m(3, 'viewer')])
    expect(groups.map((g) => [g.from, g.messages.map((x) => x.id)])).toEqual([
      ['viewer', [0, 1]],
      ['contact', [2]],
      ['viewer', [3]],
    ])
  })
  it('has no groups without messages', () => {
    expect(groupBySender([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test tests/unit/os/messenger/history.test.ts`
Expected: FAIL, because the module is not found.

- [ ] **Step 3: History**

Create `apps/web/features/os/apps/messenger/History.tsx`:
```tsx
'use client'
import { useEffect, useRef } from 'react'
import type { Message, Sender } from './responder'
import styles from './messenger.module.css'

interface Group {
  from: Sender
  messages: Message[]
}

/** Consecutive messages from one sender, shown under a single name as Messenger does. */
export function groupBySender(messages: readonly Message[]): Group[] {
  const groups: Group[] = []
  for (const message of messages) {
    const last = groups.at(-1)
    if (last?.from === message.from) last.messages.push(message)
    else groups.push({ from: message.from, messages: [message] })
  }
  return groups
}

/** The conversation so far, kept scrolled to the newest message. */
export function History({ messages, nameOf }: { messages: readonly Message[]; nameOf: (from: Sender) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])
  return (
    <div ref={ref} className={styles.history} role="log" aria-label="Conversation history">
      <ol className={styles.groups}>
        {groupBySender(messages).map((group) => (
          <li key={group.messages[0]?.id}>
            <span className={styles.sender}>{nameOf(group.from)}</span>
            <ul className={styles.lines}>
              {group.messages.map((message) => (
                <li key={message.id}>{message.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: Conversation**

Create `apps/web/features/os/apps/messenger/Conversation.tsx`:
```tsx
'use client'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { OsAppProps } from '../../apps'
import { Avatar } from './Avatar'
import { History } from './History'
import { PersonLine } from './PersonLine'
import { scriptedResponder, type Sender } from './responder'
import { useConversation } from './use-conversation'
import styles from './messenger.module.css'

/** The Conversation window with the owner: pictures on the left, the chat on the right. */
export function Conversation({ data }: OsAppProps) {
  const { viewer, contact, labels } = data.messenger
  const respond = useMemo(() => scriptedResponder(contact.replies), [contact.replies])
  const { messages, typing, send } = useConversation(respond)
  const [draft, setDraft] = useState('')

  const submit = () => {
    void send(draft)
    setDraft('')
  }
  // Enter sends, Shift+Enter starts a new line, as in Messenger
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    submit()
  }
  const nameOf = (from: Sender) => (from === 'viewer' ? viewer : contact).name

  return (
    <div className={styles.conversation}>
      <div className={styles.band} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.portraits}>
          <Avatar person={contact} size="lg" />
          <Avatar person={viewer} size="lg" />
        </div>
        <div className={styles.chat}>
          <header className={styles.chatHeader}>
            <PersonLine person={contact} large />
          </header>
          <History messages={messages} nameOf={nameOf} />
          <p className={styles.typing} aria-live="polite">
            {typing ? labels.typing.replace('{name}', contact.name) : ''}
          </p>
          <form
            className={styles.compose}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <textarea aria-label={`Message ${contact.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
            <button type="submit" disabled={!draft.trim()}>
              {labels.send}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Conversation styles**

Append to `messenger.module.css`:
```css
/* The Conversation window */
.band {
  flex: none;
  height: 28px;
  border-bottom: 1px solid #1f5fa3;
  background: var(--msn-band);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 12px;
  background: var(--msn-sky);
}
.portraits {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 8px 10px;
  border: 1px solid var(--msn-line);
  border-radius: 4px;
  background: #ffffff;
}
.chatHeader {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--msn-line);
}
.history {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 8px;
}
.groups {
  margin: 0;
  padding: 0;
  list-style: none;
}
.groups > li + li {
  margin-top: 6px;
}
.sender {
  color: var(--msn-muted);
}
.lines {
  margin: 0;
  padding-left: 16px;
}
.lines > li {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.typing {
  min-height: 1.35em;
  margin: 4px 0;
  font-style: italic;
  color: var(--msn-muted);
}
.compose {
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--msn-field);
  border-radius: 4px;
  background: #ffffff;
}
.compose > textarea {
  flex: 1;
  height: 56px;
  border: 0;
  outline: none;
  resize: none;
  font: inherit;
  color: var(--msn-text);
}
.compose > button {
  align-self: flex-end;
  padding: 3px 14px;
  border: 1px solid #7aa3cf;
  border-radius: 3px;
  background: linear-gradient(#fdfeff, #dbe9f8);
  font: inherit;
  color: var(--msn-text);
}
.compose > button:disabled {
  color: #9aa7b5;
}
```

- [ ] **Step 6: Register the app**

In `apps/web/features/os/apps.ts`, add `import { Conversation } from './apps/messenger/Conversation'` next to the Messenger import. Insert this entry right after the `messenger` entry:
```ts
  {
    id: 'conversation',
    title: (data) => `${data.messenger.contact.name} - Conversation`,
    icon: 'messenger',
    component: Conversation,
    // opened by double-clicking the contact in the Messenger
    desktop: false,
    size: { width: 580, height: 520 },
  },
```

- [ ] **Step 7: Gates**

Run: `bun run --cwd apps/web test`, then `bun run --cwd apps/web check-types`.
Expected: both PASS.

- [ ] **Step 8: Commit**

Stage the five files with separate `git add` calls (`History.tsx`, `Conversation.tsx`, the CSS, `apps.ts` and the test), then:
```bash
git commit -m "feat(os): Messenger's Conversation window with scripted replies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: End-to-end and visual verification

**Files:**
- Modify: `apps/web/tests/e2e/os.spec.ts` (append)

- [ ] **Step 1: Start the worktree's CMS on 3101 (background)**

From `apps/payload`, run in the background: `bunx cross-env NODE_OPTIONS=--no-deprecation next dev --port 3101`.
Wait until `curl -s http://localhost:3101/api/globals/messenger` returns JSON with `"name":"Vinicius Queiroz"`.

- [ ] **Step 2: Write the e2e test**

Append to `apps/web/tests/e2e/os.spec.ts`:
```ts
test('Messenger lists the owner and chats with scripted replies', async ({ page }) => {
  const errors = collectErrors(page)
  await openDesktop(page)
  await page.getByRole('button', { name: 'Messenger', exact: true }).dblclick()
  const messenger = page.getByRole('dialog', { name: 'Windows Live Messenger' })
  await expect(messenger).toBeVisible()

  // the owner sits under Favorites and under Friends
  const owner = messenger.getByRole('button', { name: /Vinicius Queiroz/ })
  await expect(owner).toHaveCount(2)
  await messenger.getByRole('searchbox').fill('zzz')
  await expect(owner).toHaveCount(0)
  await messenger.getByRole('searchbox').fill('')

  await owner.first().dblclick()
  const chat = page.getByRole('dialog', { name: 'Vinicius Queiroz - Conversation' })
  await expect(chat).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: 'Vinicius Queiroz - Conversation' })).toBeVisible()

  const box = chat.getByRole('textbox', { name: 'Message Vinicius Queiroz' })
  await box.fill('hello there')
  await box.press('Enter')
  const log = chat.getByRole('log')
  await expect(log.getByText('hello there')).toBeVisible()
  await expect(chat.getByText('Vinicius Queiroz is typing a message...')).toBeVisible()
  await expect(log.locator('li li')).toHaveCount(2, { timeout: 5_000 })
  await expect(chat.getByText('Vinicius Queiroz is typing a message...')).toBeHidden()
  expect(errors()).toEqual([])
})

test('the conversation has no desktop shortcut', async ({ page }) => {
  await openDesktop(page)
  await expect(page.getByRole('button', { name: /Conversation/ })).toHaveCount(0)
})
```

- [ ] **Step 3: Run the OS e2e suite against the worktree (web on 3100)**

Run: `PORT=3100 bun run --cwd apps/web test:e2e tests/e2e/os.spec.ts`. If the script name differs, check `apps/web/package.json` and use `bunx playwright test tests/e2e/os.spec.ts` with `PORT=3100`.
Expected: all OS tests PASS, old and new. Playwright starts `bun run dev` on 3100 itself (`webServer` in `playwright.config.ts`), and the web reads `CMS_URL=http://localhost:3101` from the worktree's `.env.local`.

- [ ] **Step 4: Visual check against the reference**

Write `apps/web/msn-shot.mjs`. It is temporary; don't commit it:
```js
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3100/os')
await page.getByRole('dialog', { name: /Showcase/ }).waitFor({ timeout: 20000 })
await page.getByRole('button', { name: 'Close ' + (await page.getByRole('dialog', { name: /Showcase/ }).getAttribute('aria-label')) }).click()
await page.getByRole('button', { name: 'Messenger', exact: true }).dblclick()
const messenger = page.getByRole('dialog', { name: 'Windows Live Messenger' })
await messenger.getByRole('button', { name: /Vinicius Queiroz/ }).first().dblclick()
const chat = page.getByRole('dialog', { name: 'Vinicius Queiroz - Conversation' })
const box = chat.getByRole('textbox')
await box.fill('hey Vinicius!')
await box.press('Enter')
await page.waitForTimeout(3000)
await messenger.screenshot({ path: 'msn-main.png' })
await chat.screenshot({ path: 'msn-chat.png' })
await page.screenshot({ path: 'msn-desk.png' })
await browser.close()
```
Run it with `node msn-shot.mjs` from `apps/web`, with the dev server on 3100 running (`PORT=3100 bun run dev` in the background if Playwright has stopped it). Read the three PNGs and the reference at `C:\Users\felip\AppData\Local\Temp\claude\D--Second-Brain-01-PROJETOS-applications-my-portfolio\fccc234b-d6b8-408f-bf08-69c66acbac2c\images\2.webp`. Compare:
- the header avatar frame and the big name;
- "★ Favorites (1)" with the small avatar row;
- "Friends (1)" with the status dot and a one-line row;
- What's new;
- the conversation's blue band, the two portraits left, the history with grey names and bullets, and the compose box.

Fix CSS mismatches in `messenger.module.css` only, and re-shoot until both windows read as Windows Live Messenger. Then delete `msn-shot.mjs` and the PNGs.

- [ ] **Step 5: Full gates**

Run: `bun run --cwd apps/web check-types`, `bun run --cwd apps/web test`, `bun run --cwd apps/payload check-types`.
Expected: all PASS.

- [ ] **Step 6: Commit**

Stage `apps/web/tests/e2e/os.spec.ts`, plus `messenger.module.css` if the visual pass changed it (separate `git add` calls). Then:
```bash
git commit -m "test(os): e2e for Messenger's contact list and conversation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Stop the background servers this task started (3100, 3101).** Never stop 3000 or 3001.
