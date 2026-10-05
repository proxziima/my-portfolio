import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`profile\` ADD \`status_message\` text DEFAULT 'building things on the web, one pixel at a time';`)
  // The owner's Messenger identity moves to Profile: carry over what the contact group held
  // (a deployed CMS may have set it), before the Messenger table is rebuilt without it.
  await db.run(sql`UPDATE \`profile\` SET
    \`status_message\` = COALESCE((SELECT \`contact_personal_message\` FROM \`messenger\` LIMIT 1), \`status_message\`),
    \`avatar_id\` = COALESCE(\`avatar_id\`, (SELECT \`contact_avatar_id\` FROM \`messenger\` LIMIT 1));`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_messenger\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text DEFAULT 'Windows Live Messenger' NOT NULL,
  	\`shortcut\` text DEFAULT 'Messenger' NOT NULL,
  	\`viewer_name\` text DEFAULT 'Visitor' NOT NULL,
  	\`viewer_status\` text DEFAULT 'available' NOT NULL,
  	\`viewer_personal_message\` text DEFAULT 'Say hi to Vinicius 👋',
  	\`viewer_listening_to\` text DEFAULT 'Daft Punk - Digital Love',
  	\`viewer_avatar_id\` integer,
  	\`contact_listening_to\` text,
  	\`labels_search\` text DEFAULT 'Search contacts or the web...' NOT NULL,
  	\`labels_favorites\` text DEFAULT 'Favorites' NOT NULL,
  	\`labels_friends\` text DEFAULT 'Friends' NOT NULL,
  	\`labels_whats_new\` text DEFAULT 'What''s new' NOT NULL,
  	\`labels_typing\` text DEFAULT '{name} is typing a message...' NOT NULL,
  	\`labels_conversation\` text DEFAULT '{name} - Conversation' NOT NULL,
  	\`labels_send\` text DEFAULT 'Send' NOT NULL,
  	\`labels_listening_to\` text DEFAULT 'Listening to:' NOT NULL,
  	\`labels_throttled\` text DEFAULT 'Give me a minute, I''m getting a lot of messages. Try again shortly.' NOT NULL,
  	\`labels_too_long\` text DEFAULT 'That message is a bit long for me. Could you shorten it?' NOT NULL,
  	\`labels_ended\` text DEFAULT 'I''ll stop here for this conversation. Feel free to book a call instead.' NOT NULL,
  	\`labels_offline\` text DEFAULT 'I can''t reply right now. Try again in a little while.' NOT NULL,
  	\`labels_privacy\` text DEFAULT 'This chat is with an AI version of me. Messages are stored for 90 days, then deleted.' NOT NULL,
  	\`labels_delete_data\` text DEFAULT 'Delete my data' NOT NULL,
  	\`labels_booking_title\` text DEFAULT 'Schedule a call' NOT NULL,
  	\`labels_your_time\` text DEFAULT 'Your time' NOT NULL,
  	\`labels_my_time\` text DEFAULT 'My time' NOT NULL,
  	\`labels_booking_notice\` text DEFAULT 'Call booked for {time}.' NOT NULL,
  	\`spotlight_title\` text,
  	\`spotlight_text\` text,
  	\`spotlight_url\` text,
  	\`spotlight_source\` text,
  	\`spotlight_image_id\` integer,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`viewer_avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`spotlight_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_messenger\`("id", "title", "shortcut", "viewer_name", "viewer_status", "viewer_personal_message", "viewer_listening_to", "viewer_avatar_id", "contact_listening_to", "labels_search", "labels_favorites", "labels_friends", "labels_whats_new", "labels_typing", "labels_conversation", "labels_send", "labels_listening_to", "labels_throttled", "labels_too_long", "labels_ended", "labels_offline", "labels_privacy", "labels_delete_data", "labels_booking_title", "labels_your_time", "labels_my_time", "labels_booking_notice", "spotlight_title", "spotlight_text", "spotlight_url", "spotlight_source", "spotlight_image_id", "updated_at", "created_at") SELECT "id", "title", "shortcut", "viewer_name", "viewer_status", "viewer_personal_message", "viewer_listening_to", "viewer_avatar_id", "contact_listening_to", "labels_search", "labels_favorites", "labels_friends", "labels_whats_new", "labels_typing", "labels_conversation", "labels_send", "labels_listening_to", "labels_throttled", "labels_too_long", "labels_ended", "labels_offline", "labels_privacy", "labels_delete_data", "labels_booking_title", "labels_your_time", "labels_my_time", "labels_booking_notice", "spotlight_title", "spotlight_text", "spotlight_url", "spotlight_source", "spotlight_image_id", "updated_at", "created_at" FROM \`messenger\`;`)
  await db.run(sql`DROP TABLE \`messenger\`;`)
  await db.run(sql`ALTER TABLE \`__new_messenger\` RENAME TO \`messenger\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`messenger_viewer_viewer_avatar_idx\` ON \`messenger\` (\`viewer_avatar_id\`);`)
  await db.run(sql`CREATE INDEX \`messenger_spotlight_spotlight_image_idx\` ON \`messenger\` (\`spotlight_image_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`contact_name\` text DEFAULT 'Vinicius Queiroz' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`contact_status\` text DEFAULT 'available' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`contact_personal_message\` text;`)
  await db.run(sql`ALTER TABLE \`messenger\` ADD \`contact_avatar_id\` integer REFERENCES media(id);`)
  await db.run(sql`CREATE INDEX \`messenger_contact_contact_avatar_idx\` ON \`messenger\` (\`contact_avatar_id\`);`)
  await db.run(sql`UPDATE \`messenger\` SET
    \`contact_name\` = COALESCE((SELECT \`name\` FROM \`profile\` LIMIT 1), \`contact_name\`),
    \`contact_personal_message\` = (SELECT \`status_message\` FROM \`profile\` LIMIT 1),
    \`contact_avatar_id\` = (SELECT \`avatar_id\` FROM \`profile\` LIMIT 1);`)
  await db.run(sql`ALTER TABLE \`profile\` DROP COLUMN \`status_message\`;`)
}
