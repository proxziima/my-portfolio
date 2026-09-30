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
| `scenes` | Spline scenes (group Site) | upload (`.spline` / `.splinecode` only), `title`, `notes`? |
| `users` | Users | auth, `name` (required display name, shown as the post author) |

The bio's inline blocks are `chipLink` { `label`, `chip`, `url`? } and `curiousToggle` { `word`, default "curious" }. Keep the same sentence skeleton across disciplines and change only the vocabulary: the page animates just the words that differ.

### Globals

| Slug | Fields |
|---|---|
| `profile` | `name`, `headlineTail` ("and builder."), `email`, `location`?, `avatar`? (media) |
| `contact` | `links[]` { `label`, `chip`, `url` }: the row under the figure (message, LinkedIn, GitHub) |
| `navigation` | `items[]` { `label`, `href`, `newTab` }: rendered as a quiet footer nav; section anchors (`#work`, `#projects`, `#content`) are valid hrefs |
| `site-settings` | `seo` { `title`, `description`, `ogImage`? }, `defaultDiscipline` (relation), `figure` { `scene`? (scenes upload, wins over the URL), `splineSceneUrl`? }, `sectionLabels` { `work`, `projects`, `content` }, `pickerHint`, `pageNotes` { `headline`, `columnWidth` (supports `{w}`), `wallSwitch`, `sectionGap`, `chips`, `role` } |

Access: public `read` on all portfolio collections and globals; writes need an authenticated user.

## Updating the desk model

The web app's figure is a Spline scene, uploaded to the `scenes` collection and picked in Site settings.

1. In Spline, export the scene (**Export → Code**, which downloads a `.splinecode`) or save the editor file (`.spline`).
2. In the admin, open **Site → Spline scenes → Create new**, give it a title (and optional notes) and upload the file.
3. Open **Site settings → Figure → Scene**, pick it and save.
4. The save revalidates the web app within seconds (`WEB_URL` + `REVALIDATE_SECRET`). Hard-refresh the page.

How it works:

- **Accepted files.** Spline files are msgpack binaries with no standard MIME type (browsers send `application/octet-stream` or nothing), so the collection sets no `mimeTypes`: with a list set, Payload's sniffing finds no type and its extension fallback calls them `text/plain`. Instead the `requireSplineFile` hook (`src/hooks/require-spline-file.ts`) accepts only `.spline` / `.splinecode` names (`isSplineFile` in `src/uploads/spline-file.ts`). Payload's own restricted-type check (`.html`, `.exe`…) still runs. There are no image sizes, and Payload hands only images to sharp, so the file is stored as-is.
- **Storage and URL.** Files are stored in `public/scenes/` (git-ignored) and served by `/api/scenes/file/<filename>` as `application/octet-stream`. The web app resolves that path against `CMS_URL`.
- **CORS.** The Spline runtime fetches the scene from the browser, on the web origin. `cors` in `src/payload.config.ts` is `[WEB_URL]`, so `WEB_URL` must be the web app's exact origin, with no trailing slash. Check it after an upload:

  ```bash
  curl -s -o /dev/null -D - -H "Origin: http://localhost:3000" http://localhost:3001/api/scenes/file/<filename>
  # expect: 200, Content-Type: application/octet-stream, Access-Control-Allow-Origin: http://localhost:3000
  ```

- **Fallbacks.** Without an uploaded scene the web app uses **Spline scene URL**, then the static `apps/web/public/spline/scene.splinecode`. `docs/assets/interactive_workspace.spline` is only a working copy; nothing reads it.

## Blog

The CMS is ready to author a blog (following Payload's [website/blog guide](https://payloadcms.com/posts/blog/how-to-build-a-website-blog-or-portfolio-with-nextjs)). The public blog is not launched yet: the web app renders posts only as draft previews for signed-in editors.

| Slug | Fields |
|---|---|
| `posts` | `title`, `excerpt`?, `heroImage`? (media), `content` (Lexical, see below), `slug` (unique; Payload's core slug field keeps it in sync with the title until you **Unlock** and edit it), `publishedAt` (stamped on first publish), `authors` (users, defaults to you), `categories`, `relatedPosts` (never itself), `meta` (SEO tab: `title`, `description`, `image`) and a read-only `populatedAuthors[]` { `id`, `name` } |
| `categories` | `title`, `slug` (unique, generated from the title), `parent` + `breadcrumbs[]` (nested docs; the breadcrumb `url` is the slug path, e.g. `/engineering/web`) |
| `search` | generated by the search plugin from **published** posts: `title`, `slug`, `excerpt`, `categories[]` { `title` }, `priority` (posts = 10) |
| `redirects` | `from` → `to` (a post or a custom URL) |

- **Drafts:** posts autosave as drafts after a ~2s pause in typing (**Save draft** saves right away), keep 50 versions and can be scheduled to publish or unpublish. The public REST API only returns published posts; signed-in users see drafts too.
- **Scheduled publishing** runs through the jobs queue. The dev/start server runs the `default` queue every minute (`jobs.autoRun`). On a serverless host, call `GET /api/payload-jobs/run` from a cron with `Authorization: Bearer $CRON_SECRET` instead.
- **Editor:** paragraphs, h2–h4, bold / italic / underline / strikethrough / inline code, links (to posts or safe external URLs), lists, blockquote, horizontal rule, media uploads and the blocks `code` { `language`, `code` }, `banner` { `style`: info / warning / error / success, `content` } and `mediaBlock` { `media` }.
- **Authors:** `users` is private, so post responses expose author names through `populatedAuthors`, never emails.
- **SEO:** the generated title is `<post title> | <profile name>` and the URL is `WEB_URL/blog/<slug>`.
- Posts, categories, search and redirects are not exposed over MCP.
- **Preview:** the post editor's **Preview** button opens `WEB_URL/api/preview?path=/blog/<slug>&previewSecret=…` (built in `src/plugins/preview-url.ts`; hidden until the post has a slug and `WEB_URL` + `PREVIEW_SECRET` are set). The web app checks the secret, verifies you through your `payload-token` admin cookie (cookies are per host, not per port, so the localhost cookie reaches the web app), enables Next draft mode and shows the latest draft at `/blog/<slug>`. `PREVIEW_SECRET` must match in `apps/payload/.env` and `apps/web/.env.local`. Exit through the banner link (`/api/exit-preview`). Without draft mode, `/blog/*` is a 404.
- **Live preview:** open a saved post and switch to the **Live Preview** tab in the document controls. The iframe loads `WEB_URL/blog/preview/<id>` directly (`admin.livePreview.url` in `src/collections/Posts.ts`), with no `/api/preview` hop, no secret and no draft mode: a draft-mode cookie set inside the iframe doesn't survive, so the page authenticates every request with your `payload-token` cookie (checked against `/api/users/me`) and is a 404 without a valid session. It's keyed by id because the slug follows the title while you type, so a slug URL would point at a draft that isn't saved yet. Until the draft is saved the page shows "This draft isn't saved yet" and recovers on the next save. Pick **Mobile** (375×667), **Tablet** (768×1024) or **Desktop** (1440×900) from the toolbar (`admin.livePreview.breakpoints` in `src/payload.config.ts`; **Responsive** is built in). The preview refreshes after a ~2s pause in typing, or right away with **Save draft**: every save posts a message to the iframe and the page's `RefreshRouteOnSave` calls `router.refresh()`, which re-fetches the draft on the server. The web app only accepts that message from `NEXT_PUBLIC_CMS_URL` (falling back to `CMS_URL`), which must be the admin's browser origin exactly (`http://localhost:3001`, not `127.0.0.1`). In production the iframe only gets the admin cookie when both apps share a cookie domain (see below).
- **Preview in production:** the web app can only see the admin cookie if both apps share a cookie domain. Host them under one parent domain (e.g. `cms.example.com` and `example.com`) and set the Users collection's `auth.cookies.domain` to it (e.g. `.example.com`, with `secure: true`); otherwise every preview ends in 403. Locally this works because cookies are scoped to `localhost`, not to the port.

## MCP

1. Start the CMS and open http://localhost:3001/admin → **MCP → API Keys** → create a key with the permissions you want.
2. Connect Claude Code:

```bash
claude mcp add --transport http payload http://127.0.0.1:3001/api/mcp --header "Authorization: Bearer <MCP_API_KEY>"
```
