import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  await db.run(sql`CREATE TABLE \`messenger_whats_new\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text NOT NULL,
  	\`link_label\` text,
  	\`url\` text,
  	\`image_id\` integer,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`messenger\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`messenger_whats_new_order_idx\` ON \`messenger_whats_new\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`messenger_whats_new_parent_id_idx\` ON \`messenger_whats_new\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`messenger_whats_new_image_idx\` ON \`messenger_whats_new\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`messenger\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text DEFAULT 'Windows Live Messenger' NOT NULL,
  	\`shortcut\` text DEFAULT 'Messenger' NOT NULL,
  	\`viewer_name\` text DEFAULT 'Visitor' NOT NULL,
  	\`viewer_status\` text DEFAULT 'available' NOT NULL,
  	\`viewer_personal_message\` text DEFAULT 'Say hi to Vinicius 👋',
  	\`viewer_listening_to\` text DEFAULT 'Daft Punk - Digital Love',
  	\`viewer_avatar_id\` integer,
  	\`contact_name\` text DEFAULT 'Vinicius Queiroz' NOT NULL,
  	\`contact_status\` text DEFAULT 'available' NOT NULL,
  	\`contact_personal_message\` text,
  	\`contact_listening_to\` text,
  	\`contact_avatar_id\` integer,
  	\`labels_search\` text DEFAULT 'Search contacts or the web...' NOT NULL,
  	\`labels_favorites\` text DEFAULT 'Favorites' NOT NULL,
  	\`labels_friends\` text DEFAULT 'Friends' NOT NULL,
  	\`labels_whats_new\` text DEFAULT 'What''s new' NOT NULL,
  	\`labels_typing\` text DEFAULT '{name} is typing a message...' NOT NULL,
  	\`labels_conversation\` text DEFAULT '{name} - Conversation' NOT NULL,
  	\`labels_send\` text DEFAULT 'Send' NOT NULL,
  	\`labels_listening_to\` text DEFAULT 'Listening to:' NOT NULL,
  	\`spotlight_title\` text,
  	\`spotlight_text\` text,
  	\`spotlight_url\` text,
  	\`spotlight_source\` text,
  	\`spotlight_image_id\` integer,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`viewer_avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`contact_avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`spotlight_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`messenger_viewer_viewer_avatar_idx\` ON \`messenger\` (\`viewer_avatar_id\`);`)
  await db.run(sql`CREATE INDEX \`messenger_contact_contact_avatar_idx\` ON \`messenger\` (\`contact_avatar_id\`);`)
  await db.run(sql`CREATE INDEX \`messenger_spotlight_spotlight_image_idx\` ON \`messenger\` (\`spotlight_image_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`messenger_contact_replies\`;`)
  await db.run(sql`DROP TABLE \`messenger_whats_new\`;`)
  await db.run(sql`DROP TABLE \`messenger\`;`)
}
