CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"book_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"copy_id" uuid,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"fulfilled_loan_id" uuid,
	"placed_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "holds_status_valid" CHECK ("holds"."status" in ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
	CONSTRAINT "holds_ready_shape" CHECK ("holds"."status" <> 'ready' or ("holds"."copy_id" is not null and "holds"."expires_at" is not null and "holds"."closed_at" is null)),
	CONSTRAINT "holds_waiting_shape" CHECK ("holds"."status" <> 'waiting' or ("holds"."copy_id" is null and "holds"."ready_at" is null and "holds"."closed_at" is null)),
	CONSTRAINT "holds_closed_shape" CHECK ("holds"."status" in ('waiting', 'ready') or "holds"."closed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "book_copies" DROP CONSTRAINT "book_copies_status_valid";--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_copy_id_book_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."book_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_fulfilled_loan_id_loans_id_fk" FOREIGN KEY ("fulfilled_loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holds_one_live_per_member_book" ON "holds" USING btree ("member_id","book_id") WHERE "holds"."status" in ('waiting', 'ready');--> statement-breakpoint
CREATE UNIQUE INDEX "holds_one_ready_per_copy" ON "holds" USING btree ("copy_id") WHERE "holds"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "holds_queue_idx" ON "holds" USING btree ("book_id","placed_at") WHERE "holds"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "holds_member_idx" ON "holds" USING btree ("member_id","placed_at");--> statement-breakpoint
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_status_valid" CHECK ("book_copies"."status" in ('available', 'held', 'on_loan', 'lost', 'withdrawn'));