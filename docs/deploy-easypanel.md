# Deploy on Easypanel

Production runs as one Easypanel **Compose** service built from this repository's `docker-compose.yml`:

| Service | Image | Port | Public URL (example) | State |
| --- | --- | --- | --- | --- |
| `web` | `apps/web/Dockerfile`: Next standalone server | 3000 | `https://example.com` | none |
| `cms` | `apps/payload/Dockerfile`: the full `cms` workspace, `next start` | 3001 | `https://cms.example.com` | volume `cms-data` at `/data` |
| `postgres` | `postgres:17-alpine` | 5432 | none (internal) | volume `twin-pg` |
| `agents` | `apps/agents/Dockerfile`: the portfolio twin (eve), `eve start` | 3000 | none (internal) | none (state is in `postgres`) |

The `cms-data` volume holds the CMS's state: the SQLite database (`/data/payload.db`) and the uploads (`/data/media`, `/data/scenes`). The `twin-pg` volume holds the portfolio twin's Postgres database `twin`. That database contains both the twin's own tables (schema `twin`) and eve's durable Workflow runtime (schemas `workflow` and `graphile_worker`). Every image is built from the repository root, and every setting is read at runtime, so nothing environment-specific is baked into an image.

**`agents` must never get a domain.** It serves eve's Workflow routes (`/.well-known/workflow/v1/*`), which are unauthenticated: anyone who can reach them can forge or replay workflow steps. Only `web` talks to it, over the compose network (`http://agents:3000`). That covers the visitor BFF and the two webhook forwarders `https://<web>/api/twin/hooks/cal` and `https://<web>/api/twin/hooks/telegram`. How the twin works: [apps/agents/README.md](../apps/agents/README.md).

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

The portfolio twin adds the variables below. Each one is described in [`.env.deploy.example`](../.env.deploy.example) and in the [agent's env manifest](../apps/agents/README.md#env-manifest). `docker-compose.yml` wires the internal URLs itself:

- `TWIN_DATABASE_URL` and `WORKFLOW_POSTGRES_URL` both point at `postgres:5432/twin`;
- the agent's `CMS_URL` is `http://cms:3001`, and its `PAYLOAD_MCP_URL` is `http://cms:3001/api/mcp`;
- web's `TWIN_AGENT_URL` is `http://agents:3000`.

| Variable | Used by | Value |
| --- | --- | --- |
| `TWIN_PG_USER`, `TWIN_PG_PASSWORD` | postgres, web, agents | Credentials of the twin database. Random password. |
| `OPENROUTER_API_KEY` | agents | OpenRouter key. Give it a credit limit in OpenRouter (the hard stop behind `TWIN_DAILY_SPEND_USD`). |
| `TWIN_MODEL`, `TWIN_MODEL_FALLBACKS`, `TWIN_MODEL_CONTEXT_TOKENS`, `TWIN_CLASSIFIER_MODEL` | agents | Optional model overrides. Leave them empty for the defaults in `packages/twin/src/env.ts`. |
| `TWIN_CLASSIFIER_TIMEOUT_MS`, `TWIN_ABUSE_TIMEOUT_MS`, `TWIN_APPROVAL_TIMEOUT` | agents | Optional. Empty uses 4000 ms, 1500 ms and `15m`. |
| `TWIN_JWT_SECRET` | web, agents | Random. Web signs the 60-second visitor token, the agent verifies it. |
| `TWIN_COOKIE_SECRET` | web | Random. Signs the visitor cookie. |
| `TWIN_PROMPT_CANARY` | web, agents | Random, at least 16 characters. A reply that contains it is replaced before it reaches the browser. |
| `TWIN_STABLE_KEY_SECRET` | agents | Random. Hashes a visitor's volunteered email. |
| `TWIN_REDACT_SECRET` | cms, web, agents | Random. Authenticates `GET /api/twin/redact-terms` on the CMS. |
| `TWIN_DAILY_SPEND_USD` | web | Daily model spend cap in USD (default 5). Past it, the twin answers "offline" until 00:00 UTC. |
| `PAYLOAD_MCP_API_KEY` | agents | The twin's Payload MCP key ([step 6](#6-set-up-the-portfolio-twin)). |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `OWNER_TIMEZONE` | agents | Free/busy access ([step 6](#6-set-up-the-portfolio-twin)) and the owner's IANA zone. |
| `CAL_LINK`, `CAL_WEBHOOK_SECRET`, `TWIN_BOOKING_REF_SECRET` | agents | Cal.com event (`<user>/<event-slug>`), the webhook secret you set in Cal.com, and a random key for booking references. `CAL_ORIGIN` and `CAL_EMBED_SCRIPT_URL` are only for self-hosted Cal. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OWNER_USER_ID` | agents | Owner approvals ([step 6](#6-set-up-the-portfolio-twin)). `TELEGRAM_API_BASE` stays empty. |
| `EXA_API_KEY` | agents | Exa key for the twin's narrow web search. |

Generate each secret with `openssl rand -hex 32`. Don't reuse the development values. Origins are `https://`, with no trailing slash and no path.

The image already sets `NODE_ENV=production`, `DATABASE_URL=file:/data/payload.db`, `MEDIA_DIR=/data/media` and `SCENES_DIR=/data/scenes`. Don't override them.

## 3. Add the domains

In the service's **Domains** tab, add one domain per app and turn HTTPS on for both:

- `example.com` → service **web**, port **3000**
- `cms.example.com` → service **cms**, port **3001**

Add no domain for `agents` or `postgres`.

The compose file only `expose`s these ports. It publishes no host ports, and Easypanel's proxy reaches the containers directly. HTTPS is required: in production the admin cookie is `Secure`, so signing in to the admin over plain HTTP silently fails.

## 4. The volumes

`docker-compose.yml` declares two named volumes:

- `cms-data`, mounted at `/data` in `cms`;
- `twin-pg`, the data directory of `postgres`.

Both are created on the first deploy and kept across redeploys and rebuilds. Only deleting a volume (or the whole service with its volumes) loses its data. `web` and `agents` have no state of their own.

## 5. First deploy

1. Click **Deploy**. Both images build (a few minutes: `bun install`, then `turbo run build`; `next/font/google` downloads the fonts during the web build, so the build needs network access).
2. `cms` and `postgres` start first. The `cms` healthcheck requests `/api/globals/profile`; that first request starts Payload, which creates the schema by running the committed migrations (`Migrating: …_initial` in the cms logs).
3. `agents` starts once both are healthy. Before it listens, its command creates the Workflow world's schema (`world:setup`) and applies the twin migrations (`db:migrate`). Both are idempotent and run on every start. Its healthcheck requests `/eve/v1/health`. `web` starts once `cms`, `postgres` and `agents` are healthy.
4. **Create the admin user right away** at `https://cms.example.com/admin`. Until the first user exists, anyone who opens the admin can create it.
5. Add the content, either way:
   - **Seed** the portfolio content (disciplines, experiences, projects, content, globals). In Easypanel, open the `cms` container's console (or run `docker compose exec cms …` on the server) and run:
     ```bash
     bun run seed
     ```
     The seed is idempotent (it upserts), so re-running it resets seeded fields to the seed's values.
   - Or **enter it in the admin** by hand.
6. Upload the desk model: **Site → Spline scenes → Create new** (a `.splinecode` export), then **Site settings → Figure → Scene**, pick it and save. Until a scene is picked, the site shows the static fallback bundled in the web image (`apps/web/public/spline/scene.splinecode`).
7. Open `https://example.com`. Saving anything in the admin revalidates the site within seconds.

## 6. Set up the portfolio twin

The twin starts with the stack, but it needs these external pieces before it can answer, approve and book. `<web>` is the site's public host, e.g. `example.com`.

1. **Payload MCP key.** In the CMS admin, open **MCP → API Keys** and create a key for the twin. Enable **only** the custom tools `twinIdentity`, `twinSearch` and `twinDisclose`, and leave every collection and global capability off. The generic collection tools run as the key's user, which reads every disclosure tier, including `never`. Set the key as `PAYLOAD_MCP_API_KEY` and redeploy.
2. **Knowledge base.** Under **Context → Knowledge base**, add:
   - the facts the portfolio doesn't cover (notice period, rates policy, relocation, work authorisation);
   - 3–5 `voice` entries with real samples of your writing, `public`;
   - for anything the twin must never say, a `never` entry with its exact strings under **Redact terms**.

   Set each portfolio entry's **Disclosure** in its sidebar (`public`, `restricted` or `never`).
3. **Telegram approvals.**
   1. Create a bot with **@BotFather** (`/newbot`); its token is `TELEGRAM_BOT_TOKEN`.
   2. Get your numeric user id from **@userinfobot**; that is `TELEGRAM_OWNER_USER_ID`.
   3. **Send `/start` to your bot once.** Telegram refuses to message a user who never started the bot, and every approval would then expire.
   4. Once the stack is deployed with the variables set, register the webhook on the **web** domain:
      ```bash
      curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
        -H 'content-type: application/json' \
        -d "{\"url\":\"https://<web>/api/twin/hooks/telegram\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"callback_query\"]}"
      curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"   # check url and last_error_message
      ```
      Run it again if the domain or `TELEGRAM_WEBHOOK_SECRET` changes.
4. **Cal.com.**
   1. Create the event type the twin offers and set `CAL_LINK=<user>/<event-slug>`.
   2. Under **Settings → Developer → Webhooks**, add a webhook:
      - **Subscriber URL:** `https://<web>/api/twin/hooks/cal`;
      - **Secret:** the value of `CAL_WEBHOOK_SECRET`;
      - **Triggers:** **Booking created**, **Booking rescheduled** and **Booking cancelled**.

   Bookings made directly on Cal.com, outside the twin's dialog, carry no booking reference and are ignored.
5. **Google free/busy.**
   1. In Google Cloud, enable the **Google Calendar API**, create a service account and create a JSON key for it.
   2. Set `GOOGLE_SERVICE_ACCOUNT_JSON` to `base64 -w0 key.json`.
   3. In Google Calendar, share the calendar with the service account's `client_email` as **See only free/busy (hide details)**.
   4. Copy the **Calendar ID** (Settings → Integrate calendar) into `GOOGLE_CALENDAR_ID`.
6. **OpenRouter.** Set a credit limit on the key. `TWIN_DAILY_SPEND_USD` is enforced from a ledger that can undercount: rows are lost while the database is unreachable.

Retention runs inside `agents`. Every day at 03:00 it purges visitors not seen for 90 days, with everything they own. A visitor can delete their own data with `DELETE https://<web>/api/twin/me`.

## Updating

Push to the deployed branch, then click **Deploy** (or enable Easypanel's auto-deploy for the service). The images are rebuilt from the new commit and the containers are replaced; the `cms-data` and `twin-pg` volumes stay. On start, `agents` applies any new twin migration. When the new `cms` handles its first request, it runs any migration that isn't in `payload_migrations` yet.

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

- **Twin database.** Use `pg_dump` from the `postgres` container. It is consistent while running:
  ```bash
  docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc twin' > twin-$(date +%F).dump
  ```
  It holds visitor conversations, so store it like personal data. Restore it into an empty `twin` database with `pg_restore` while `agents` and `web` are stopped.

## Line endings (Windows checkouts)

Easypanel builds from Git, so its checkout has the line endings in the repository. A local `docker build` or `docker compose up` from a Windows working tree with `core.autocrlf=true` could otherwise get CRLF in the files that run on Linux, and the shell would read the Dockerfile's `CMD` and the scripts with stray `\r` characters. `.gitattributes` forces LF for `Dockerfile`, `*.sh`, `*.yml`, `*.yaml` and `*.ndjson`, so those check out with LF everywhere. If you add a file that runs inside a container (an entrypoint script, a file in another format), add its pattern there with `text eol=lf`. The twin's `SKILL.md` files don't need it: the skill bundler normalises CRLF.

## Known issue: MCP

The CMS serves MCP at `https://cms.example.com/api/mcp` (API keys under **MCP → API Keys** in the admin), but writes through MCP are broken: `@payloadcms/plugin-mcp` resolves TypeScript 7, which lacks `ts.transpileModule`, so every create and update tool gets an empty input schema. Reads work. Edit content in the admin, or with the seed and Payload's Local API. The portfolio twin only reads, through its three custom tools, so it isn't affected. See the root [README](../README.md#mcp).

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

### `agents` stays unhealthy, so `web` never starts

Read the `agents` logs. Usual causes:

- **A failed `world:setup` or `db:migrate`** against `postgres`.
- **A slow first start.** The healthcheck allows 60 s plus five failed checks, 15 s apart.

### The twin answers "offline"

Possible causes:

- The daily spend cap (`TWIN_DAILY_SPEND_USD`) was reached; the twin resumes at 00:00 UTC.
- `agents` is unreachable.
- **An agent variable is invalid.** The agent reads its env lazily, so this doesn't show up in the healthcheck. On the first turn, the `agents` logs show `Invalid environment:` followed by every bad variable. Check:
  - secret lengths (32+ characters);
  - `CAL_LINK` as `<user>/<slug>`;
  - `GOOGLE_SERVICE_ACCOUNT_JSON` as the base64 of the JSON key;
  - `OWNER_TIMEZONE` as a valid IANA zone.
- `web` can't fetch the redaction rules. `TWIN_REDACT_SECRET` must be the same on `cms`, `web` and `agents`: without the rules, nothing streams.

`web` logs the cause as `[twin] … failed`.

### Telegram approvals always expire

- Check that you sent `/start` to the bot from the account in `TELEGRAM_OWNER_USER_ID`.
- Check that `getWebhookInfo` shows `https://<web>/api/twin/hooks/telegram` with no `last_error_message`.
- Check that the webhook's `secret_token` equals `TELEGRAM_WEBHOOK_SECRET`. A mismatch answers 401.

### `cms` stays unhealthy, so `web` never starts

Read the `cms` logs. Usual causes: an empty required variable (the deploy is refused and names it), a failed migration (see the previous section), or a volume the `node` user can't write. The healthcheck allows 60 s for the start plus five failed checks, 15 s apart.
