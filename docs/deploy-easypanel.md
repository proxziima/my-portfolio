# Deploy on Easypanel

Production runs as one Easypanel **Compose** service built from this repository's `docker-compose.yml`:

| Service | Image | Port | Public URL (example) | State |
| --- | --- | --- | --- | --- |
| `web` | `apps/web/Dockerfile`: Next standalone server | 3000 | `https://example.com` | none |
| `cms` | `apps/payload/Dockerfile`: the full `cms` workspace, `next start` | 3001 | `https://cms.example.com` | volume `cms-data` at `/data` |

The `cms-data` volume holds everything that must survive a deploy: the SQLite database (`/data/payload.db`) and the uploads (`/data/media`, `/data/scenes`). Both images are built from the repository root, and every setting is read at runtime, so nothing environment-specific is baked into an image.

## Before you start

- Both hostnames (e.g. `example.com` and `cms.example.com`) point at the Easypanel server in DNS. They must share a parent domain for draft preview and live preview to work (see [Cookies](#preview-answers-403-or-the-live-preview-is-a-404)).
- The branch you deploy contains `apps/payload/src/migrations`: that's how the production schema is created.

## 1. Create the Compose service

1. In Easypanel, open a project (or create one) and choose **+ Service → Compose**.
2. **Source**: the Git repository (GitHub, or any Git URL) and the branch to deploy. Keep the build path at the repository root (`/`) and the compose file at `docker-compose.yml`.
3. Don't deploy yet: set the environment first. The compose file refuses to start while a required variable is empty.

## 2. Set the environment

Open the service's **Environment** tab and paste [`.env.deploy.example`](../.env.deploy.example) with real values:

| Variable | Used by | Value |
| --- | --- | --- |
| `WEB_PUBLIC_URL` | cms (`WEB_URL`) | The site's exact origin, e.g. `https://example.com`. It's the CMS's only CORS origin, the target of revalidations and the base of preview links. |
| `CMS_PUBLIC_URL` | web (`CMS_URL`), cms (`NEXT_PUBLIC_SERVER_URL`) | The CMS's exact origin, e.g. `https://cms.example.com`. The web fetches content from it and builds upload URLs (the Spline scene) that the browser loads from it. |
| `COOKIE_DOMAIN` | cms | The shared parent domain with a leading dot, e.g. `.example.com`. |
| `PAYLOAD_SECRET` | cms | Random. Encrypts auth tokens; changing it signs everyone out. |
| `REVALIDATE_SECRET` | cms, web | Random. Same value on both sides by construction. |
| `PREVIEW_SECRET` | cms, web | Random. Same value on both sides by construction. |
| `CRON_SECRET` | cms | Optional. Only for an external cron hitting the jobs endpoint; scheduled publishing already runs inside the CMS. |

Generate each secret with `openssl rand -hex 32`. Don't reuse the development values. Origins are `https://`, with no trailing slash and no path.

The image already sets `NODE_ENV=production`, `DATABASE_URL=file:/data/payload.db`, `MEDIA_DIR=/data/media` and `SCENES_DIR=/data/scenes`. Don't override them.

## 3. Add the domains

In the service's **Domains** tab, add one domain per app and turn HTTPS on for both:

- `example.com` → service **web**, port **3000**
- `cms.example.com` → service **cms**, port **3001**

The compose file only `expose`s these ports. It publishes no host ports, and Easypanel's proxy reaches the containers directly. HTTPS is required: in production the admin cookie is `Secure`, so signing in to the admin over plain HTTP silently fails.

## 4. The volume

`docker-compose.yml` declares the named volume `cms-data`, mounted at `/data` in `cms`. It's created on the first deploy and kept across redeploys and rebuilds. Only deleting the volume (or the whole service with its volumes) loses the data. `web` has no state.

## 5. First deploy

1. Click **Deploy**. Both images build (a few minutes: `bun install`, then `turbo run build`; `next/font/google` downloads the fonts during the web build, so the build needs network access).
2. `cms` starts first. The compose healthcheck requests `/api/globals/profile`; that first request starts Payload, which creates the schema by running the committed migrations (`Migrating: …_initial` in the cms logs). `web` starts once `cms` is healthy.
3. **Create the admin user right away** at `https://cms.example.com/admin`. Until the first user exists, anyone who opens the admin can create it.
4. Add the content, either way:
   - **Seed** the portfolio content (disciplines, experiences, projects, content, globals). In Easypanel, open the `cms` container's console (or run `docker compose exec cms …` on the server) and run:
     ```bash
     bun run seed
     ```
     The seed is idempotent (it upserts), so re-running it resets seeded fields to the seed's values.
   - Or **enter it in the admin** by hand.
5. Upload the desk model: **Site → Spline scenes → Create new** (a `.splinecode` export), then **Site settings → Figure → Scene**, pick it and save. Until a scene is picked, the site shows the static fallback bundled in the web image (`apps/web/public/spline/scene.splinecode`).
6. Open `https://example.com`. Saving anything in the admin revalidates the site within seconds.

## Updating

Push to the deployed branch, then click **Deploy** (or enable Easypanel's auto-deploy for the service). Both images are rebuilt from the new commit and the containers are replaced; the `cms-data` volume stays. When the new `cms` handles its first request, it runs any migration that isn't in `payload_migrations` yet.

**Schema changes need a migration.** Development pushes the schema automatically; production never does. After changing a collection, global or field, create a migration before you deploy and commit it:

```bash
# Against a throwaway database, so your dev payload.db is never touched.
DATABASE_URL=file:./tmp-migrate.db bun run --cwd apps/payload payload migrate:create <name>
rm -f apps/payload/tmp-migrate.db*
git add apps/payload/src/migrations
```

`migrate:create` diffs the config against the latest snapshot (`.json`) in `src/migrations`, not against the database, so a throwaway database gives the same result. Never run `payload migrate` against the dev database: it was pushed, and Payload warns that migrating it loses data. If you deploy a schema change without a migration, the production CMS runs with the old tables and fails on the new fields.

Useful commands in the `cms` console:

```bash
bun run payload migrate:status   # which migrations have run
bun run payload migrate          # run pending migrations by hand (the server does this on start)
```

## Backups

Everything is in `/data` in the `cms` container: `payload.db`, `media/` and `scenes/`.

- **Database, consistent while running.** In the `cms` console:
  ```bash
  node -e "new (require('node:sqlite').DatabaseSync)('/data/payload.db').exec(\"VACUUM INTO '/data/backup.db'\")"
  ```
  Then download `/data/backup.db` and delete it from the volume. A plain copy of `payload.db` is only safe while nothing is writing, e.g. with `cms` stopped.
- **Uploads.** Copy `/data/media` and `/data/scenes`.
- **Whole volume, on the server.** Stop `cms`, then archive the volume (find its name with `docker volume ls | grep cms-data`):
  ```bash
  docker run --rm -v <volume>:/data -v "$PWD":/backup busybox tar czf /backup/cms-data-$(date +%F).tar.gz -C /data .
  ```

To restore, put the files back in `/data` with `cms` stopped, owned by uid 1000 (`node`).

## Known issue: MCP

The CMS serves MCP at `https://cms.example.com/api/mcp` (API keys under **MCP → API Keys** in the admin), but writes through MCP are broken: `@payloadcms/plugin-mcp` resolves TypeScript 7, which lacks `ts.transpileModule`, so every create and update tool gets an empty input schema. Reads work. Edit content in the admin, or with the seed and Payload's Local API. See the root [README](../README.md#mcp).

## Troubleshooting

### The site loads but the 3D figure doesn't, or the browser console shows CORS errors

`WEB_PUBLIC_URL` must be the site's origin exactly as the browser sends it: scheme, host and port, with no trailing slash. `https://example.com` and `https://www.example.com` are different origins, as are `http` and `https`. It's the CMS's only CORS origin. If the site answers on both the apex and `www`, redirect one to the other in Easypanel.

### Preview answers 403, or the live preview is a 404

The web app checks the editor through the admin's `payload-token` cookie, so the browser has to send that cookie to the web host. That only happens when:

- both apps live under one parent domain (`cms.example.com` and `example.com`),
- `COOKIE_DOMAIN` is that parent with a leading dot (`.example.com`),
- both are served over HTTPS (the cookie is `Secure` in production),
- and you signed in **after** setting `COOKIE_DOMAIN`. Sign out and back in to get a cookie on the new domain.

`PREVIEW_SECRET` is shared by both services, so it can't mismatch unless it's overridden per service.

### Edits don't show up on the site

The CMS POSTs to `WEB_PUBLIC_URL/api/revalidate` with `REVALIDATE_SECRET`. The cms logs show `web revalidate responded …` or `web revalidate failed` when that fails. The `cms` container must be able to reach the public site URL. Otherwise the cached content still expires after 5 minutes.

### Don't copy the development database into production

A dev `payload.db` was built by schema push, not migrations: `payload_migrations` holds a `dev` row (batch -1) instead of the initial migration. Put in `/data`, the production CMS stops at Payload's interactive "you've run Payload in dev mode … data loss will occur" prompt, which nobody can answer in a container, so it exits or hangs and never becomes healthy. Answering yes by hand is no better: the initial migration then fails on tables that already exist. Start production from an empty volume and add the content with the seed or the admin. If it already happened: stop `cms`, remove `/data/payload.db` (after backing it up), and deploy again.

### `cms` stays unhealthy, so `web` never starts

Read the `cms` logs. Usual causes: an empty required variable (the deploy is refused and names it), a failed migration (see the previous section), or a volume the `node` user can't write. The healthcheck allows 60 s for the start plus five failed checks, 15 s apart.
