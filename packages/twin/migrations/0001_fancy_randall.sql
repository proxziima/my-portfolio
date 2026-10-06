ALTER TABLE "twin"."approvals" ADD COLUMN "call_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_session_call_uq" ON "twin"."approvals" USING btree ("session_id","call_id");--> statement-breakpoint
CREATE INDEX "approvals_session_source_idx" ON "twin"."approvals" USING btree ("session_id","source_id");