ALTER TABLE "twin"."approvals" ADD COLUMN "reply_code" text;--> statement-breakpoint
UPDATE "twin"."approvals" SET "reply_code" = upper(substr(md5("id"::text), 1, 4));--> statement-breakpoint
ALTER TABLE "twin"."approvals" ALTER COLUMN "reply_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "twin"."approvals" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "twin"."approvals" SET "notified_at" = "requested_at" WHERE "telegram_message_id" IS NOT NULL AND "status" <> 'pending';--> statement-breakpoint
ALTER TABLE "twin"."approvals" DROP COLUMN "telegram_message_id";--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_pending_code_uq" ON "twin"."approvals" USING btree ("reply_code") WHERE "twin"."approvals"."status" = 'pending';
