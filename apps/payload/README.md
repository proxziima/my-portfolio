# Portfolio CMS

Headless [Payload](https://payloadcms.com) 3 CMS (SQLite, Lexical) that feeds the portfolio in `apps/web`. It has no frontend of its own: the admin panel lives at `/admin`, content is read over REST by the web app, and the same content is exposed over MCP so an AI client can edit it.

## Run

```bash
bun run --cwd apps/payload dev    # http://localhost:3001/admin
bun run --cwd apps/payload seed   # load the portfolio content (idempotent)
```

Copy `.env.example` to `.env` first. `WEB_URL` and `REVALIDATE_SECRET` let the CMS ping the web app's `/api/revalidate` endpoint after every change.

## Content model

### Collections

| Slug | Admin label | Fields |
|---|---|---|
| `disciplines` | Disciplines (roles) | `title` ("Software engineer"), `slug` (unique, e.g. `se`), `order` (number), `level` ("LV 9 · backend", shown in the picker), `bio` (Lexical: paragraphs, bold, and inline blocks `chipLink` + `curiousToggle`), `figureCaption`, `curiousNotes[]` { `side`: left/right, `text`, `formula`? } |
| `experiences` | Professional background | `company`, `chip` (≤3 chars), `url`?, `title`, `startYear`, `endYear`? (empty = present), `disciplines` (hasMany relation), `order` |
| `projects` | Portfolio | `name`, `chip`, `url`?, `summary`, `disciplines` (hasMany), `order` |
| `content` | Content & community | `title`, `kind` (article / talk / podcast / open-source / community), `venue`?, `url`, `date`, `disciplines` (hasMany; empty = every role), `order` |
| `media` | Media | upload (alt required) |
| `users` | Users | auth |

The bio's inline blocks are `chipLink` { `label`, `chip`, `url`? } and `curiousToggle` { `word`, default "curious" }. Keep the same sentence skeleton across disciplines and change only the vocabulary: the page animates just the words that differ.

### Globals

| Slug | Fields |
|---|---|
| `profile` | `name`, `headlineTail` ("and builder."), `email`, `location`?, `avatar`? (media) |
| `contact` | `links[]` { `label`, `chip`, `url` }: the row under the figure (message, LinkedIn, GitHub) |
| `navigation` | `items[]` { `label`, `href`, `newTab` }: rendered as a quiet footer nav; section anchors (`#work`, `#projects`, `#content`) are valid hrefs |
| `site-settings` | `seo` { `title`, `description`, `ogImage`? }, `defaultDiscipline` (relation), `figure` { `splineSceneUrl`? }, `sectionLabels` { `work`, `projects`, `content` }, `pickerHint`, `pageNotes` { `headline`, `columnWidth` (supports `{w}`), `wallSwitch`, `sectionGap`, `chips`, `role` } |

Access: public `read` on all portfolio collections and globals; writes need an authenticated user.

## MCP

1. Start the CMS and open http://localhost:3001/admin → **MCP → API Keys** → create a key with the permissions you want.
2. Connect Claude Code:

```bash
claude mcp add --transport http payload http://127.0.0.1:3001/api/mcp --header "Authorization: Bearer <MCP_API_KEY>"
```
