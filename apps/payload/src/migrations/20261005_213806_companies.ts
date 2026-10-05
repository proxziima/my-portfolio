import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Both functions use only `db` (no `payload`, no `req`), so they can also be applied directly to a
// push-mode DB. SQLite migrations run outside a transaction here, so `PRAGMA foreign_keys=OFF` takes
// effect: every table rebuild sits inside it, otherwise dropping the old table would cascade-delete its
// `_rels` rows (experiences_rels, projects_rels).

type Row = Record<string, unknown>

/** Visits every Lexical node depth-first. */
const walk = (node: unknown, visit: (n: Row) => void): void => {
  if (!node || typeof node !== 'object') return
  visit(node as Row)
  for (const child of ((node as Row).children as unknown[] | undefined) ?? []) walk(child, visit)
}

const TIERS = ['public', 'restricted', 'never']

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`favicons\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`favicons_updated_at_idx\` ON \`favicons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`favicons_created_at_idx\` ON \`favicons\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`favicons_filename_idx\` ON \`favicons\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`companies\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`chip\` text NOT NULL,
  	\`url\` text,
  	\`logo_id\` integer,
  	\`favicon_id\` integer,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`favicon_id\`) REFERENCES \`favicons\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`companies_name_idx\` ON \`companies\` (\`name\`);`)
  await db.run(sql`CREATE INDEX \`companies_logo_idx\` ON \`companies\` (\`logo_id\`);`)
  await db.run(sql`CREATE INDEX \`companies_favicon_idx\` ON \`companies\` (\`favicon_id\`);`)
  await db.run(sql`CREATE INDEX \`companies_disclosure_idx\` ON \`companies\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`companies_updated_at_idx\` ON \`companies\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`companies_created_at_idx\` ON \`companies\` (\`created_at\`);`)

  // One company per distinct experience name: the chip and url of its first row by order, the url
  // falling back to the bio's chip link; its tier is the most visible tier among its experiences.
  const experiences = (await db.all(sql`SELECT "company", "chip", "url", "disclosure" FROM "experiences" ORDER BY "order", "id"`)) as Row[]
  const disciplines = (await db.all(sql`SELECT "id", "bio" FROM "disciplines"`)) as Row[]
  const bios = disciplines.filter((d) => typeof d.bio === 'string' && d.bio)
  const bioChips = new Map<string, { chip: string; url: string | null }>()
  for (const d of bios) {
    walk(JSON.parse(String(d.bio)).root, (n) => {
      const f = n.fields as Row | undefined
      if (n.type === 'inlineBlock' && f?.blockType === 'chipLink' && typeof f.label === 'string' && !bioChips.has(f.label)) {
        bioChips.set(f.label, { chip: String(f.chip ?? ''), url: typeof f.url === 'string' && f.url ? f.url : null })
      }
    })
  }
  const companies = new Map<string, { chip: string; url: string | null; tier: number }>()
  for (const e of experiences) {
    const name = String(e.company)
    const tier = Math.max(0, TIERS.indexOf(String(e.disclosure)))
    const url = typeof e.url === 'string' && e.url ? e.url : null
    const known = companies.get(name)
    if (known) {
      known.url ??= url
      known.tier = Math.min(known.tier, tier)
    } else {
      companies.set(name, { chip: String(e.chip), url, tier })
    }
  }
  for (const [name, c] of companies) {
    const url = c.url ?? bioChips.get(name)?.url ?? null
    await db.run(sql`INSERT INTO "companies" ("name", "chip", "url", "disclosure") VALUES (${name}, ${c.chip}, ${url}, ${TIERS[c.tier]})`)
  }

  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_experiences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`company_id\` integer NOT NULL,
  	\`title\` text NOT NULL,
  	\`start_year\` numeric NOT NULL,
  	\`end_year\` numeric,
  	\`order\` numeric DEFAULT 0 NOT NULL,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // company_id is NOT NULL, so a row whose company was not inserted above fails the migration loudly.
  await db.run(sql`INSERT INTO \`__new_experiences\`("id", "company_id", "title", "start_year", "end_year", "order", "disclosure", "updated_at", "created_at") SELECT "id", (SELECT "id" FROM "companies" WHERE "companies"."name" = "experiences"."company"), "title", "start_year", "end_year", "order", "disclosure", "updated_at", "created_at" FROM \`experiences\`;`)
  await db.run(sql`DROP TABLE \`experiences\`;`)
  await db.run(sql`ALTER TABLE \`__new_experiences\` RENAME TO \`experiences\`;`)
  // The generator added these foreign-key columns with `ALTER TABLE … ADD … REFERENCES`, which cannot
  // carry the schema's ON DELETE action: the FKs would be NO ACTION instead of SET NULL / CASCADE, so
  // deleting a referenced media, favicon or company would fail, and the next dev push would see a diff
  // and rebuild the tables itself. Rebuilding them here gives exactly the schema the config describes.
  await db.run(sql`CREATE TABLE \`__new_projects\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`chip\` text NOT NULL,
  	\`url\` text,
  	\`logo_id\` integer,
  	\`favicon_id\` integer,
  	\`summary\` text NOT NULL,
  	\`company_id\` integer,
  	\`order\` numeric DEFAULT 0 NOT NULL,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`favicon_id\`) REFERENCES \`favicons\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_projects\`("id", "name", "chip", "url", "summary", "order", "disclosure", "updated_at", "created_at") SELECT "id", "name", "chip", "url", "summary", "order", "disclosure", "updated_at", "created_at" FROM \`projects\`;`)
  await db.run(sql`DROP TABLE \`projects\`;`)
  await db.run(sql`ALTER TABLE \`__new_projects\` RENAME TO \`projects\`;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`disciplines_id\` integer,
  	\`companies_id\` integer,
  	\`experiences_id\` integer,
  	\`projects_id\` integer,
  	\`content_id\` integer,
  	\`knowledge_id\` integer,
  	\`posts_id\` integer,
  	\`categories_id\` integer,
  	\`media_id\` integer,
  	\`favicons_id\` integer,
  	\`scenes_id\` integer,
  	\`users_id\` integer,
  	\`search_id\` integer,
  	\`redirects_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`disciplines_id\`) REFERENCES \`disciplines\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`companies_id\`) REFERENCES \`companies\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`experiences_id\`) REFERENCES \`experiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`projects_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`knowledge_id\`) REFERENCES \`knowledge\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`favicons_id\`) REFERENCES \`favicons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`scenes_id\`) REFERENCES \`scenes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`search_id\`) REFERENCES \`search\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`redirects_id\`) REFERENCES \`redirects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "knowledge_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "knowledge_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`experiences_company_idx\` ON \`experiences\` (\`company_id\`);`)
  await db.run(sql`CREATE INDEX \`experiences_order_idx\` ON \`experiences\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`experiences_disclosure_idx\` ON \`experiences\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`experiences_updated_at_idx\` ON \`experiences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`experiences_created_at_idx\` ON \`experiences\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`projects_logo_idx\` ON \`projects\` (\`logo_id\`);`)
  await db.run(sql`CREATE INDEX \`projects_favicon_idx\` ON \`projects\` (\`favicon_id\`);`)
  await db.run(sql`CREATE INDEX \`projects_company_idx\` ON \`projects\` (\`company_id\`);`)
  await db.run(sql`CREATE INDEX \`projects_order_idx\` ON \`projects\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`projects_disclosure_idx\` ON \`projects\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`projects_updated_at_idx\` ON \`projects\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`projects_created_at_idx\` ON \`projects\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_disciplines_id_idx\` ON \`payload_locked_documents_rels\` (\`disciplines_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_companies_id_idx\` ON \`payload_locked_documents_rels\` (\`companies_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_experiences_id_idx\` ON \`payload_locked_documents_rels\` (\`experiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_projects_id_idx\` ON \`payload_locked_documents_rels\` (\`projects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_content_id_idx\` ON \`payload_locked_documents_rels\` (\`content_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_knowledge_id_idx\` ON \`payload_locked_documents_rels\` (\`knowledge_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_favicons_id_idx\` ON \`payload_locked_documents_rels\` (\`favicons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_scenes_id_idx\` ON \`payload_locked_documents_rels\` (\`scenes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_redirects_id_idx\` ON \`payload_locked_documents_rels\` (\`redirects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`companies_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`companies_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`companies_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`companies_delete\` integer DEFAULT false;`)

  // A bio chip link whose label names a company (first) or a project becomes a link to that record;
  // any other chip link (e.g. "Ted Lasso") stays as it is.
  const ids = async (table: 'companies' | 'projects') =>
    new Map(((await db.all(sql.raw(`SELECT "id", "name" FROM "${table}"`))) as Row[]).map((r) => [String(r.name), Number(r.id)]))
  const companyIds = await ids('companies')
  const projectIds = await ids('projects')
  for (const d of bios) {
    const bio = JSON.parse(String(d.bio))
    walk(bio.root, (n) => {
      const f = n.fields as Row | undefined
      if (n.type !== 'inlineBlock' || f?.blockType !== 'chipLink' || typeof f.label !== 'string') return
      const companyId = companyIds.get(f.label)
      const projectId = companyId === undefined ? projectIds.get(f.label) : undefined
      if (companyId === undefined && projectId === undefined) return
      n.fields = {
        id: f.id,
        blockName: f.blockName ?? '',
        blockType: 'recordLink',
        record: companyId !== undefined ? { relationTo: 'companies', value: companyId } : { relationTo: 'projects', value: projectId },
      }
    })
    await db.run(sql`UPDATE "disciplines" SET "bio" = ${JSON.stringify(bio)} WHERE "id" = ${d.id}`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Bio record links turn back into chip links carrying the record's name, chip and url. A link whose
  // record no longer exists has nothing to show, so it is removed.
  const records = async (table: 'companies' | 'projects') =>
    new Map(
      ((await db.all(sql.raw(`SELECT "id", "name", "chip", "url" FROM "${table}"`))) as Row[]).map((r) => [
        Number(r.id),
        { label: String(r.name), chip: String(r.chip), url: typeof r.url === 'string' && r.url ? r.url : null },
      ]),
    )
  const byCollection: Record<string, Map<number, { label: string; chip: string; url: string | null }>> = {
    companies: await records('companies'),
    projects: await records('projects'),
  }
  const disciplines = (await db.all(sql`SELECT "id", "bio" FROM "disciplines"`)) as Row[]
  for (const d of disciplines) {
    if (typeof d.bio !== 'string' || !d.bio) continue
    const bio = JSON.parse(d.bio)
    let changed = false
    walk(bio.root, (n) => {
      if (!Array.isArray(n.children)) return
      n.children = (n.children as Row[]).flatMap((child) => {
        const f = child.fields as Row | undefined
        if (child.type !== 'inlineBlock' || f?.blockType !== 'recordLink') return [child]
        changed = true
        const ref = f.record as { relationTo?: string; value?: unknown } | undefined
        const value = ref?.value && typeof ref.value === 'object' ? (ref.value as Row).id : ref?.value
        const record = ref?.relationTo ? byCollection[ref.relationTo]?.get(Number(value)) : undefined
        if (!record) return []
        return [{ ...child, fields: { id: f.id, blockName: f.blockName ?? '', blockType: 'chipLink', ...record } }]
      })
    })
    if (changed) await db.run(sql`UPDATE "disciplines" SET "bio" = ${JSON.stringify(bio)} WHERE "id" = ${d.id}`)
  }

  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_experiences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`company\` text NOT NULL,
  	\`chip\` text NOT NULL,
  	\`url\` text,
  	\`title\` text NOT NULL,
  	\`start_year\` numeric NOT NULL,
  	\`end_year\` numeric,
  	\`order\` numeric DEFAULT 0 NOT NULL,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_experiences\`("id", "company", "chip", "url", "title", "start_year", "end_year", "order", "disclosure", "updated_at", "created_at") SELECT "id", (SELECT "name" FROM "companies" WHERE "companies"."id" = "experiences"."company_id"), (SELECT "chip" FROM "companies" WHERE "companies"."id" = "experiences"."company_id"), (SELECT "url" FROM "companies" WHERE "companies"."id" = "experiences"."company_id"), "title", "start_year", "end_year", "order", "disclosure", "updated_at", "created_at" FROM \`experiences\`;`)
  await db.run(sql`DROP TABLE \`experiences\`;`)
  await db.run(sql`ALTER TABLE \`__new_experiences\` RENAME TO \`experiences\`;`)
  await db.run(sql`CREATE INDEX \`experiences_order_idx\` ON \`experiences\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`experiences_disclosure_idx\` ON \`experiences\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`experiences_updated_at_idx\` ON \`experiences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`experiences_created_at_idx\` ON \`experiences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_projects\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`chip\` text NOT NULL,
  	\`url\` text,
  	\`summary\` text NOT NULL,
  	\`order\` numeric DEFAULT 0 NOT NULL,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_projects\`("id", "name", "chip", "url", "summary", "order", "disclosure", "updated_at", "created_at") SELECT "id", "name", "chip", "url", "summary", "order", "disclosure", "updated_at", "created_at" FROM \`projects\`;`)
  await db.run(sql`DROP TABLE \`projects\`;`)
  await db.run(sql`ALTER TABLE \`__new_projects\` RENAME TO \`projects\`;`)
  await db.run(sql`CREATE INDEX \`projects_order_idx\` ON \`projects\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`projects_disclosure_idx\` ON \`projects\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`projects_updated_at_idx\` ON \`projects\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`projects_created_at_idx\` ON \`projects\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`disciplines_id\` integer,
  	\`experiences_id\` integer,
  	\`projects_id\` integer,
  	\`content_id\` integer,
  	\`knowledge_id\` integer,
  	\`posts_id\` integer,
  	\`categories_id\` integer,
  	\`media_id\` integer,
  	\`scenes_id\` integer,
  	\`users_id\` integer,
  	\`search_id\` integer,
  	\`redirects_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`disciplines_id\`) REFERENCES \`disciplines\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`experiences_id\`) REFERENCES \`experiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`projects_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`knowledge_id\`) REFERENCES \`knowledge\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`scenes_id\`) REFERENCES \`scenes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`search_id\`) REFERENCES \`search\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`redirects_id\`) REFERENCES \`redirects\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "knowledge_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "knowledge_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`companies\`;`)
  await db.run(sql`DROP TABLE \`favicons\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_disciplines_id_idx\` ON \`payload_locked_documents_rels\` (\`disciplines_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_experiences_id_idx\` ON \`payload_locked_documents_rels\` (\`experiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_projects_id_idx\` ON \`payload_locked_documents_rels\` (\`projects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_content_id_idx\` ON \`payload_locked_documents_rels\` (\`content_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_knowledge_id_idx\` ON \`payload_locked_documents_rels\` (\`knowledge_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_scenes_id_idx\` ON \`payload_locked_documents_rels\` (\`scenes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_redirects_id_idx\` ON \`payload_locked_documents_rels\` (\`redirects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`companies_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`companies_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`companies_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`companies_delete\`;`)
}
