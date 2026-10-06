CREATE SCHEMA "twin";
--> statement-breakpoint
CREATE TABLE "twin"."approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"source_id" text NOT NULL,
	"topic" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"webhook_url" text,
	"telegram_message_id" bigint,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"actor" text,
	"reasoning" text
);
--> statement-breakpoint
CREATE TABLE "twin"."bookings" (
	"uid" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"status" text NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twin"."conversations" (
	"session_id" text PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twin"."intent_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"score" real NOT NULL,
	"tier" text NOT NULL,
	"classification" text,
	"reasons" text[] NOT NULL,
	"signals" jsonb NOT NULL,
	"outcome" text DEFAULT 'none' NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intent_evaluations_message_uq" UNIQUE("session_id","turn_id","sequence"),
	CONSTRAINT "intent_evaluations_reasons_nonempty" CHECK (cardinality("twin"."intent_evaluations"."reasons") >= 1)
);
--> statement-breakpoint
CREATE TABLE "twin"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "twin"."search_cache" (
	"session_id" text NOT NULL,
	"query_norm" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_cache_session_id_query_norm_pk" PRIMARY KEY("session_id","query_norm")
);
--> statement-breakpoint
CREATE TABLE "twin"."spend_ledger" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"model_id" text NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twin"."transcripts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"turn_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_message_uq" UNIQUE("session_id","turn_id","sequence","role")
);
--> statement-breakpoint
CREATE TABLE "twin"."visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "twin"."approvals" ADD CONSTRAINT "approvals_session_id_conversations_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "twin"."conversations"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin"."bookings" ADD CONSTRAINT "bookings_session_id_conversations_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "twin"."conversations"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin"."conversations" ADD CONSTRAINT "conversations_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "twin"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin"."intent_evaluations" ADD CONSTRAINT "intent_evaluations_session_id_conversations_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "twin"."conversations"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin"."search_cache" ADD CONSTRAINT "search_cache_session_id_conversations_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "twin"."conversations"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin"."transcripts" ADD CONSTRAINT "transcripts_session_id_conversations_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "twin"."conversations"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_visitor_idx" ON "twin"."conversations" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "spend_ledger_created_idx" ON "twin"."spend_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visitors_stable_key_idx" ON "twin"."visitors" USING btree ("stable_key_hash");--> statement-breakpoint
CREATE INDEX "visitors_last_seen_idx" ON "twin"."visitors" USING btree ("last_seen_at");