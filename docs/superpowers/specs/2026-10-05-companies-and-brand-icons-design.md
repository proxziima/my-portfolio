# Companies collection and brand icons — design

Date: 2026-10-05 · Branch: `feat/companies`

## Goal

A company (e.g. Autodoc) is written once and reused by Professional background (experiences),
Portfolio (projects) and the role bios (disciplines), instead of repeating its name, chip and URL in
every row and every bio paragraph. Companies and projects also get a real icon: an uploaded logo,
otherwise the website's favicon, otherwise the existing text chip.

## Decisions

Per the owner's standing instruction, design calls were made without a question round. Each is
recorded here with its reason.

1. **New `companies` collection.** Fields: `name` (required, unique), `chip`, `url`, `logo`,
   `favicon`, `disclosure`. This is the single source of a company's identity.
2. **Experiences reference a company.** `company` becomes a required relationship to `companies`;
   the experience's own `chip` and `url` fields go away (they belong to the company). Admin title
   becomes `title`, and the list columns show `title, company, startYear, endYear`.
3. **Projects can reference a company.** There is a new optional `company` relationship (the
   company the project was built at or for). The site shows the company's name in the project
   row's aside slot, the same slot that shows an experience's period. Projects keep their own
   `chip`, `url`, `logo` and `favicon`, because a project is a brand in its own right.
4. **Bios link records, not free text.** There is a new inline block, `recordLink` ("Company or
   project link"), with one polymorphic relationship, `record`, to `companies | projects`. Its
   label, chip, URL and icon come from the record. The old `chipLink` block stays for links that
   are not records (e.g. "Ted Lasso"). One polymorphic block instead of two near-identical blocks
   keeps it DRY.
5. **Icon precedence: logo → favicon → chip.** The shared `brandFields()` factory adds
   `chip, url, logo, favicon` to both Companies and Projects, so the rule is written once:
   - `logo`: optional upload to `media`. It always wins when set.
   - `favicon`: upload to a new hidden `favicons` collection. It is read-only in the admin and
     filled by a hook from `url`.
   - `chip`: stays required, because it is the guaranteed fallback.
6. **Favicons are fetched on save and self-hosted.** They are not hotlinked or fetched at render
   time. An `afterChange` hook resolves the site's icon when `url` changes or no favicon is stored
   yet, then saves the bytes into the hidden `favicons` upload collection and writes the favicon's
   id back onto the record. The hook runs *after* the record has been validated and written: a
   `beforeChange` hook runs before field validation, so a save that then failed validation would
   leave orphaned icons, or an icon replaced for a URL that was never saved. Field-level access
   (`create`/`update: () => false`) keeps API clients from setting `favicon` themselves; the hook
   writes it through the Local API. Reasons for self-hosting:
   - Visitors' browsers never call third-party hosts.
   - A site that later moves its icon can't break the page.
   - The web app just renders an uploaded image URL, the same path as the logo.

   There is one favicon document per owner. It is replaced in place when the URL changes, and
   deleted when the URL is cleared, the fetch finds nothing, or the owner is deleted.
7. **Favicon discovery.** The lookup runs in this order:
   1. Only `http(s)` URLs qualify. `mailto:`, `#` and `/path` links have no favicon.
   2. GET the URL, with a 5 s timeout and a 1 MB cap. Parse `<link rel~=icon | shortcut icon |
      apple-touch-icon href>` tags, ranking them by declared `sizes` (largest first, with `any`
      or SVG counted as largest).
   3. Fall back to `<origin>/favicon.ico`.
   4. Take the first candidate that returns `200` with an `image/*` content type and a non-empty
      body under 512 KB. Store it with that MIME type and a filename derived from the owner.
   5. On any failure (fetch or store), log a warning and never fail the save. If the URL changed,
      the old favicon is removed. If an unchanged URL is being refreshed, the old favicon is kept.
      One exception: when replacing the file in place fails, the old favicon is removed too,
      because Payload deletes the old file before it writes the new one.
   6. Only raster icons (ICO, PNG, JPEG, GIF, WebP, AVIF) are accepted. SVG is excluded because a
      third-party SVG served from the CMS origin could run script if opened directly.

   `context.skipFavicon` turns the hook off (tests, migrations), and `context.refreshFavicon`
   forces a re-fetch.

   The URL is entered only by authenticated editors (the admin or the owner's MCP key), so the
   timeout, size caps and the http(s)-only rule are the only network guards. There is no SSRF
   allow-list.
8. **Disclosure.** Companies get the same `disclosure` tier and `disclosureRead` access as every
   other twin-readable collection. Without it, a company behind a `never` experience would become
   publicly listable at `/api/companies`, which today it is not. The tier rules:
   - **Effective tier.** An experience *is* "a role at a company", so its tier is the *stricter* of
     its own tier and its company's. A shared `stricterTier(a, b)` helper computes it. A project
     keeps its own tier, because its name is public on the site whatever its company is. It names
     its company only while that company is public.
   - **Website.** Anonymous REST only returns public companies, so an experience whose company
     the site can't read is dropped, and a project's company aside is omitted.
   - **Bios.** The relationship in `recordLink` has
     `filterOptions: { disclosure: { equals: 'public' } }`, so bios (always public prose) can only
     link public records. A record made non-public later disappears from the bio, which is the
     owner hiding it everywhere.
   - **Twin.** The corpus applies the same rules: effective tiers for experiences, and bio links
     resolve only public names. Restricted entries expose their title as a topic stub, so an
     experience at a non-public company is titled "<role> (company undisclosed)". The company's
     name is only in the body, which the twin reveals after the owner approves. Entries whose
     effective tier is `never` are dropped when the corpus is loaded.
9. **Web resolves references through a lookup, not deep population.** `getPortfolio` also fetches
   `companies` (depth 1, so `logo` and `favicon` are populated). It builds one lookup keyed by
   `relationTo:id` from companies and projects, and every reference (experience → company,
   project → company, bio → record) resolves through it. This avoids depending on how deep
   Payload populates relationships inside Lexical blocks, and gives one resolution path for all
   three consumers.
10. **One render primitive.** `chipLinkHtml` and `ChipLink` take
    `{ label, chip, href?, icon? }`. When `icon` is set, the chip slot renders
    `<img class="chip chip-img" src alt="" aria-hidden loading="lazy" decoding="async">` instead of
    `<i class="chip">`. It keeps class `chip`, so size, spacing, the morph tokenizer (which treats
    `<a class="fav">…</a>` as atomic) and curious-mode measurements are unchanged. `Entry` gains
    `icon?: string`. `brandIcon(doc, base) = mediaUrl(logo) ?? mediaUrl(favicon)` lives in the
    mappers.
11. **Migration carries the owner's data over.** A Payload migration
    (`*_companies.ts`, generated with `migrate:create` and then hand-edited) does the following:
    - Creates `companies` and `favicons`, plus the logo/favicon columns on `projects`.
    - Inserts one company per distinct experience `company` name, taking the chip and URL from
      that name's first row by `order`.
    - Points `experiences.company_id` at that company, then rebuilds `experiences` without the
      old `company`/`chip`/`url` columns.
    - Rewrites every discipline bio. A `chipLink` whose label equals a company or project name
      becomes a `recordLink` to that record; any other chip link stays as it is.
    - `down` reverses the schema and turns `recordLink` back into `chipLink` with the record's
      label, chip and URL.

    Favicons are not fetched in the migration (no network in migrations). A maintenance script,
    `bun run --cwd apps/payload favicons:refresh`, re-saves every company and project that has a
    URL with `refreshFavicon`. It backfills after the migration and can refresh stale icons later.
12. **Seed.** It covers:
    - `data.ts` gains `companies`. Experiences reference companies by name, and projects may.
    - The bios use a new `link('companies' | 'projects', name)` helper instead of `chip(...)` for
      records. `chip(...)` stays for free-form links.
    - `run.ts` seeds in the order companies → disciplines (bios with record links rendered as
      plain text, because projects don't exist yet) → experiences → projects → a second
      discipline pass that writes the final bios with record links resolved. The circularity is
      real: projects reference disciplines, and bios reference projects.
13. **MCP.** `companies` is exposed with CRUD, and the experiences/projects descriptions mention
    the company relation and the logo/favicon/chip icon rule. The hidden `favicons` collection is
    not exposed.

## Units

| Unit | Location | Purpose |
|---|---|---|
| `stricterTier` | `apps/payload/src/fields/disclosure.ts` | Combines two tiers |
| `brandFields()` | `apps/payload/src/fields/brand.ts` | chip, url, logo, favicon fields |
| `discoverFavicon(url, fetchImpl?)` | `apps/payload/src/favicons/discover.ts` | Pure network lookup → `{ data, mimetype, filename } \| null` |
| `faviconHooks` | `apps/payload/src/favicons/hooks.ts` | afterChange/afterDelete keeping the favicon doc in step with `url` |
| `Favicons` | `apps/payload/src/collections/Favicons.ts` | Hidden upload collection (`FAVICONS_DIR` / `public/favicons`), public read, `focalPoint:false`, `crop:false` |
| `Companies` | `apps/payload/src/collections/Companies.ts` | The new collection |
| `RecordLinkBlock` | `apps/payload/src/blocks/record-link.ts` | Polymorphic bio link |
| migration | `apps/payload/src/migrations/*_companies.ts` | Schema + data |
| `favicons:refresh` | `apps/payload/src/scripts/refresh-favicons.ts` | Backfill / refresh |
| twin corpus | `apps/payload/src/mcp/twin-tools.ts`, `twin-corpus.ts` | Company names, effective tiers, `lexicalText` resolving record links |
| web lookup + mappers | `apps/web/lib/cms/{queries,mappers,bio-html,types}.ts` | Resolve references, `brandIcon`, `Entry.icon` |
| render | `apps/web/shared/ui/{chip-markup.ts,ChipLink.tsx}`, `styles/base.css`, `features/os/os.css` | Icon in the chip slot |

## Testing

- **CMS unit/int tests (vitest):**
  - `discoverFavicon` with a stubbed fetch: link ranking, relative hrefs, the `/favicon.ico`
    fallback, non-image and oversize rejection, timeouts, non-http URLs.
  - The hook: create, URL change replaces in place, URL cleared deletes, failed fetch saves
    without a favicon, `skipFavicon`.
  - Storing an `.ico` and a `.png` in `favicons`.
  - The `recordLink` filter rejecting a non-public record.
  - Companies' disclosure read.
  - Twin corpus effective tiers and bio names.
  - Seed data.
- **Migration:** run `up` on a copy of the owner's DB, check the companies, experience links and
  bio record links, then run `down` and `up` again.
- **Web unit tests:**
  - `chipLinkHtml`/`ChipLink` with and without an icon.
  - `bioParagraphs` with record links (resolved, unresolved, chip link untouched).
  - Mappers: `brandIcon` precedence, an experience dropped when its company is unresolved, the
    project company aside.
- **Real-browser E2E:** in the worktree, the CMS runs on a DB copy on 3101 and the web app on
  3100. Check that the Work rows, the Projects rows and the bio show the Autodoc favicon image,
  a company with an uploaded logo shows the logo, and a company with no URL shows the chip. Test
  both a fresh visit and a role switch (morph), with no console errors.

## Rollout to the owner's DB

The owner's dev CMS (port 3001) runs from the main checkout in push mode. To keep the push from
prompting, or dropping `experiences.company` before the data is carried over:

1. Back up `apps/payload/payload.db` to a timestamped `.bak`.
2. Run the migration against it from the worktree (`payload migrate`), so that the schema matches
   the new config before the code lands.
3. Fast-forward `feat/portfolio-twin-agent` to `feat/companies`. The dev server's push then finds
   no diff.
4. Run `favicons:refresh`.

## Out of scope

- Logos/favicons for Content items and Contact links (they keep chips).
- Auto-refreshing favicons on a schedule.
