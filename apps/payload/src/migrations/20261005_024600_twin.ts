import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`knowledge_redact_terms\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`term\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`knowledge\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`knowledge_redact_terms_order_idx\` ON \`knowledge_redact_terms\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_redact_terms_parent_id_idx\` ON \`knowledge_redact_terms\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`knowledge\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`topic\` text NOT NULL,
  	\`category\` text DEFAULT 'other' NOT NULL,
  	\`answer\` text NOT NULL,
  	\`order\` numeric DEFAULT 0 NOT NULL,
  	\`disclosure\` text DEFAULT 'public' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`knowledge_order_idx\` ON \`knowledge\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_disclosure_idx\` ON \`knowledge\` (\`disclosure\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_updated_at_idx\` ON \`knowledge\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`knowledge_created_at_idx\` ON \`knowledge\` (\`created_at\`);`)
  await db.run(sql`DROP TABLE \`messenger_contact_replies\`;`)
  await db.run(sql`ALTER TABLE \`disciplines\` ADD \`disclosure\` text DEFAULT 'public' NOT NULL;`)
  await db.run(sql`CREATE INDEX \`disciplines_disclosure_idx\` ON \`disciplines\` (\`disclosure\`);`)
  await db.run(sql`ALTER TABLE \`experiences\` ADD \`disclosure\` text DEFAULT 'public' NOT NULL;`)
  await db.run(sql`CREATE INDEX \`experiences_disclosure_idx\` ON \`experiences\` (\`disclosure\`);`)
  await db.run(sql`ALTER TABLE \`projects\` ADD \`disclosure\` text DEFAULT 'public' NOT NULL;`)
  await db.run(sql`CREATE INDEX \`projects_disclosure_idx\` ON \`projects\` (\`disclosure\`);`)
  await db.run(sql`ALTER TABLE \`content\` ADD \`disclosure\` text DEFAULT 'public' NOT NULL;`)
  await db.run(sql`CREATE INDEX \`content_disclosure_idx\` ON \`content\` (\`disclosure\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`knowledge_delete\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_twin_identity\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_twin_search\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_twin_disclose\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`knowledge_id\` integer REFERENCES knowledge(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_knowledge_id_idx\` ON \`payload_locked_documents_rels\` (\`knowledge_id\`);`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_throttled\` text DEFAULT 'Give me a minute, I''m getting a lot of messages. Try again shortly.' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_too_long\` text DEFAULT 'That message is a bit long for me. Could you shorten it?' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_ended\` text DEFAULT 'I''ll stop here for this conversation. Feel free to book a call instead.' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_offline\` text DEFAULT 'I can''t reply right now. Try again in a little while.' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_privacy\` text DEFAULT 'This chat is with an AI version of me. Messages are stored for 90 days, then deleted.' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_delete_data\` text DEFAULT 'Delete my data' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_booking_title\` text DEFAULT 'Schedule a call' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_your_time\` text DEFAULT 'Your time' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_my_time\` text DEFAULT 'My time' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`labels_booking_notice\` text DEFAULT 'Call booked for {time}.' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`messenger_contact_replies\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`messenger\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`messenger_contact_replies_order_idx\` ON \`messenger_contact_replies\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`messenger_contact_replies_parent_id_idx\` ON \`messenger_contact_replies\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`knowledge_redact_terms\`;`)
  await db.run(sql`DROP TABLE \`knowledge\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`disciplines_id\` integer,
  	\`experiences_id\` integer,
  	\`projects_id\` integer,
  	\`content_id\` integer,
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
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "disciplines_id", "experiences_id", "projects_id", "content_id", "posts_id", "categories_id", "media_id", "scenes_id", "users_id", "search_id", "redirects_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_disciplines_id_idx\` ON \`payload_locked_documents_rels\` (\`disciplines_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_experiences_id_idx\` ON \`payload_locked_documents_rels\` (\`experiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_projects_id_idx\` ON \`payload_locked_documents_rels\` (\`projects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_content_id_idx\` ON \`payload_locked_documents_rels\` (\`content_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_scenes_id_idx\` ON \`payload_locked_documents_rels\` (\`scenes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_redirects_id_idx\` ON \`payload_locked_documents_rels\` (\`redirects_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`DROP INDEX \`disciplines_disclosure_idx\`;`)
  await db.run(sql`ALTER TABLE \`disciplines\` DROP COLUMN \`disclosure\`;`)
  await db.run(sql`DROP INDEX \`experiences_disclosure_idx\`;`)
  await db.run(sql`ALTER TABLE \`experiences\` DROP COLUMN \`disclosure\`;`)
  await db.run(sql`DROP INDEX \`projects_disclosure_idx\`;`)
  await db.run(sql`ALTER TABLE \`projects\` DROP COLUMN \`disclosure\`;`)
  await db.run(sql`DROP INDEX \`content_disclosure_idx\`;`)
  await db.run(sql`ALTER TABLE \`content\` DROP COLUMN \`disclosure\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`knowledge_delete\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_twin_identity\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_twin_search\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_twin_disclose\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_throttled\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_too_long\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_ended\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_offline\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_privacy\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_delete_data\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_booking_title\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_your_time\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_my_time\`;`)
  await db.run(sql`ALTER TABLE \`messenger\` DROP COLUMN \`labels_booking_notice\`;`)
}
