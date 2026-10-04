# MSN Messenger app on the OS — design

Date: 2026-10-04.

Reference: a Windows Live Messenger 2009 screenshot (Vista), with the main
contact-list window and a Conversation window. The user asked for:

- an interactive Messenger app on the `/os` desktop, with its main window and a
  Conversation window;
- one contact, **Vinicius Queiroz** (the site owner), listed under both
  Favorites and Friends;
- every piece of text and status the layout shows (names, statuses, personal
  messages, What's new) editable in Payload;
- scripted replies for now. A later spec will replace them with a Claude-backed
  persona that impersonates the owner.

The user asked Claude to make every design decision (clean code, DRY, KISS, a
long-term approach, no workarounds). The decisions and their reasons are below.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Build it as React apps in the existing window manager. Leave the DOS/js-dos path alone. | Messenger is a Windows program. The OS already renders Showcase and Credits as React apps, and a DOS program could not reach a chat backend later. |
| D2 | Make two `APPS` entries: `messenger` (the main window, with a desktop shortcut) and `conversation` (no shortcut, opened from the contact list). | Each one becomes a real OS window with drag, focus, a taskbar tab, minimise and close, at no extra cost. The window manager reducer stays unchanged. |
| D3 | Give `OsAppProps` an `open(appId)` function that the Desktop supplies. | It is the smallest general way for one app to open another. Nothing in it is specific to Messenger. |
| D4 | Add `desktop?: false` to `OsApp`. With it, the app gets no desktop shortcut. | The conversation is only reachable by double-clicking the contact, as in the real program. |
| D5 | Exactly one contact, modelled as a `contact` group in a new `messenger` Payload global (not an array or collection). | The user wants one contact, and the future AI persona speaks only as the owner. A list would allow contacts with nobody behind them, and the single Conversation window would have to guess which contact it belongs to. |
| D6 | The visitor is the signed-in user: a `viewer` group (name, status, personal message, avatar) fills the main window's header. | This matches the reference, where the header is the person using Messenger. |
| D7 | Use Win98 window chrome (the existing `Window`) with a WLM-styled interior. | One chrome system on the OS. The interior carries the Messenger look: blue gradients, Segoe UI, avatar frames coloured by status. |
| D8 | Fetch the messenger data only on `/os`, through `getMessenger()`. The page passes `OsData = Portfolio & { messenger }` to the Desktop. | The site page (`/`) also calls `getPortfolio()`, and adding Messenger to `Portfolio` would make it fetch a global it never uses. |
| D9 | Scripted replies are a `replies` array on the contact. The Nth message the visitor sends gets reply N, and the last reply repeats once the list runs out. A "typing" pause comes before each reply. | Simple, editable in the CMS, and it never runs dry. |
| D10 | Replies go through a `Responder` function, `(history) => Promise<string>`. The scripted responder implements it. | This is where the future AI responder plugs in without touching the UI. It is one type and one function, not a framework. |
| D11 | Groups use native `<details>/<summary>`, and the search box filters contacts by name. | Collapsible groups and filtering for free, accessible and with no state code. |
| D12 | Left out (YAGNI): the conversation toolbar actions, emoticon parsing, sounds, nudges, the Groups section, the bottom MSN ad and icon bar, and multiple contacts. | None of them is part of the request. The Conversation window keeps the reference's blue band as a decorative header with no fake buttons. |
| D13 | Draw the taskbar and shortcut icon as a 16×16 pixel-art "buddy" in `icons.tsx`'s path table. | No Messenger bitmap exists under `docs/`, and drawn icons are the established pattern for non-reference art. |
| D14 | When there is no avatar upload, show a default silhouette drawn in SVG. | Avatars are optional uploads, so the UI must not depend on media existing. |

## 2. CMS (`apps/payload`)

New global `messenger` (`src/globals/Messenger.ts`). It uses public read access
and `revalidateGlobalHooks` like the other globals, and is registered in
`payload.config.ts`.

```
messenger
├─ title               text, required, default "Windows Live Messenger"   (window title + taskbar)
├─ shortcut            text, required, default "Messenger"                (desktop label)
├─ viewer (group)
│  ├─ name             text, required, default "Visitor"
│  ├─ status           select available|busy|away|offline, default available
│  ├─ personalMessage  text, default "Say hi to Vinicius 👋"
│  └─ avatar           upload → media
├─ contact (group)
│  ├─ name             text, required, default "Vinicius Queiroz"
│  ├─ status           select (same options), default available
│  ├─ personalMessage  text
│  ├─ avatar           upload → media
│  └─ replies          array (min 1) of { text: textarea, required }
├─ labels (group)      all text, required, with defaults
│  ├─ search           "Search contacts or the web..."
│  ├─ favorites        "Favorites"
│  ├─ friends          "Friends"
│  ├─ whatsNew         "What's new"
│  ├─ typing           "{name} is typing a message..."   ({name} is replaced by the contact's name)
│  └─ send             "Send"
└─ whatsNew            array of { text: text required, linkLabel: text, url: urlField, image: upload → media }
```

A local `person()` helper builds the name / status / personal message / avatar
fields for both groups (DRY). `url` reuses `fields/link-url.ts`'s `urlField`.
`SiteSettings.ts`'s local `requiredText` helper moves to
`src/fields/required-text.ts` so both globals share it.

- **Migration:** `bun run --cwd apps/payload payload migrate:create messenger`,
  committed with the global. Production runs pending migrations on start.
- **Types:** regenerate `packages/cms-types` with `generate:types`.
- **Seed:** `seed/data.ts` gets a `messenger` object: Vinicius Queiroz, a
  personal message, three to four replies in his voice, and one What's new
  item pointing to the Showcase/blog. `seed/run.ts` writes it with
  `updateGlobal('messenger', …, quiet)`. Following the DB-safety rules, the seed
  is only ever run against a copy of `payload.db`. The user runs it on their
  own DB.

## 3. Web data path (`apps/web/lib/cms`)

- `types.ts`: adds `MessengerStatus`, `MessengerPerson { name; status; personalMessage?; avatar? }`,
  `MessengerContact extends MessengerPerson { replies: string[] }`, `WhatsNewItem { text; link?: { label; href }; image? }`,
  and `Messenger { title; shortcut; viewer; contact; labels; whatsNew }`.
- `mappers.ts`: adds `toMessenger(doc, base)`. Uploads go through the existing
  `mediaUrl`, links through `safeHref`. Empty personal messages become
  `undefined`, and a What's new link with no safe href is dropped.
- `queries.ts`: adds `getMessenger = cache(async () => toMessenger(await cmsGlobal('messenger'), cmsBaseUrl()))`.
- `app/(os)/os/page.tsx`: fetches both with `Promise.all` and renders
  `<Desktop data={{ ...portfolio, messenger }} />`.

## 4. OS integration (`apps/web/features/os`)

- `apps.ts`:
  - adds `export interface OsData extends Portfolio { messenger: Messenger }`;
  - `OsAppProps` becomes `{ data: OsData; open: (appId: string) => void }`;
  - `OsApp` gains `desktop?: false`, and `title` takes `OsData`;
  - the two new entries:
    - `messenger`: title from `data.messenger.title`, shortcut from
      `data.messenger.shortcut`, icon `messenger`, size about 360×640;
    - `conversation`: title `${contact.name} - Conversation`, icon `messenger`,
      `desktop: false`, size about 560×500.
  - Because `shortcut` must be able to come from content, `shortcut` also
    accepts a function, resolved like `title`.
- `Desktop.tsx`: takes `OsData`, renders shortcuts only for apps without
  `desktop: false`, and passes `open={(id) => dispatch({ type: 'open', id })}`
  to every app.
- `icons.tsx`: adds `messenger` to `IconName` and the path table.

## 5. Components (`apps/web/features/os/apps/messenger/`)

Each unit has one job:

| File | Job |
|---|---|
| `status.ts` | `STATUS_LABEL` (Available, Busy, Away, Offline). Status colours live only in the CSS, keyed by `data-status`. |
| `Avatar.tsx` | A framed picture with the frame coloured by status. Three sizes (`lg` conversation, `md` main header, `sm` Favorites row). Falls back to the SVG silhouette. |
| `PersonLine.tsx` | "Name (Status)" plus the personal message, ellipsised. Used by the header, the list rows and the conversation header (DRY). |
| `responder.ts` | The `Message` and `Responder` types, `scriptedResponder(replies)` and `typingDelay(text)` (proportional to length, clamped to 0.8–2.5 s). Pure and unit-tested. |
| `use-conversation.ts` | The hook `useConversation(responder)` returns `{ messages, typing, send }`. It appends the visitor's message, sets `typing`, awaits the responder after the delay and appends the reply. It cancels on unmount and ignores empty input. |
| `Messenger.tsx` | The main window: header (viewer), search, `<details>` Favorites (1) and Friends (1) both listing the contact, What's new (one item with ‹ › pager when there are several). Double-click or Enter on the contact calls `open('conversation')`. |
| `ContactRow.tsx` | One contact row (Favorites style with a small avatar, Friends style with a status dot). Its button opens the conversation. |
| `WhatsNew.tsx` | The What's new panel and its pager. |
| `Conversation.tsx` | The Conversation window: blue band, contact avatar (top-left) and viewer avatar (bottom-left), header `PersonLine`, a scrolling history (sender name in grey, then bullet lines, consecutive messages grouped), the typing line, a textarea (Enter sends, Shift+Enter adds a new line) and a Send button. |
| `messenger.module.css` | Local tokens (`--msn-*`: gradients, frame colours, Segoe UI stack) and all styles. Status colours live only here. |

**Data flow:** both apps read `data.messenger`. The Conversation builds
`scriptedResponder(contact.replies)` once (`useMemo`) and passes it to
`useConversation`. The history lives in the Conversation component, so closing
the window clears it and minimising keeps it, which is how the real program
behaves.

## 6. Error handling

- A CMS failure on `/os` throws exactly as `getPortfolio` does today. There is
  no special fallback.
- `replies` is required (min 1) in the CMS. The responder still guards against
  an empty list by returning `''`, and the hook skips appending empty replies.
- Text from the CMS and from the visitor is rendered as React text, never as
  HTML. Hrefs pass `safeHref`, and images pass `mediaUrl`.

## 7. Testing

- **Unit (vitest, `tests/unit/os/messenger/`):**
  - `scriptedResponder`: sequence, then the last reply repeats; an empty list;
  - `typingDelay` clamping;
  - `useConversation`: send → typing → reply with fake timers; empty input
    ignored; no update after unmount;
  - `groupBySender` and `matchesQuery`.
- **Unit (`tests/unit/cms/mappers.test.ts`):** `toMessenger` maps media URLs,
  drops unsafe links and turns empty strings into `undefined`.
- **Unit (`tests/unit/os/apps.test.ts`):** `desktopApps` drops apps with
  `desktop: false`, and `resolveApp` resolves a title and shortcut that come
  from content.
- **E2E (`tests/e2e/os.spec.ts`):** double-click the Messenger shortcut. The
  window shows the viewer, and Favorites and Friends each list the contact.
  Double-click the contact, and the Conversation window opens with a taskbar
  tab. Type and press Enter: the message appears, then the typing line, then
  the first scripted reply.
- **Gates:** `check-types`, `test`, and the e2e run against a worktree CMS on a
  copy of the DB (web on 3100, CMS on 3101). There is also a Playwright
  screenshot check of both windows against the reference.
