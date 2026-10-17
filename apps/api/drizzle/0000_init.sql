CREATE SEQUENCE "public"."copy_barcode_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."member_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_copies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"book_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_copies_status_valid" CHECK ("book_copies"."status" in ('available', 'on_loan', 'lost', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"authors" text[] NOT NULL,
	"published_year" integer,
	"genre_id" uuid NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "books_title_not_blank" CHECK (length(btrim("books"."title")) > 0),
	CONSTRAINT "books_has_author" CHECK (cardinality("books"."authors") >= 1),
	CONSTRAINT "books_year_plausible" CHECK ("books"."published_year" is null or "books"."published_year" between 1000 and 2100)
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"loan_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waived_by" uuid,
	"waive_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fines_amount_positive" CHECK ("fines"."amount_minor" > 0),
	CONSTRAINT "fines_settled_once" CHECK (not ("fines"."paid_at" is not null and "fines"."waived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "genres_name_not_blank" CHECK (length(btrim("genres"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"copy_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"borrowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"renewals" integer DEFAULT 0 NOT NULL,
	"issued_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "loans_renewals_non_negative" CHECK ("loans"."renewals" >= 0),
	CONSTRAINT "loans_due_after_borrow" CHECK ("loans"."due_at" > "loans"."borrowed_at")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_number" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "members_status_valid" CHECK ("members"."status" in ('active', 'suspended')),
	CONSTRAINT "members_email_lowercase" CHECK ("members"."email" = lower("members"."email")),
	CONSTRAINT "members_name_not_blank" CHECK (length(btrim("members"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" text DEFAULT 'librarian' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_role_valid" CHECK ("users"."role" in ('librarian', 'admin')),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_book_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."book_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "book_copies_barcode_uq" ON "book_copies" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "book_copies_book_status_idx" ON "book_copies" USING btree ("book_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "books_isbn_live_uq" ON "books" USING btree ("isbn") WHERE "books"."deleted_at" is null and "books"."isbn" is not null;--> statement-breakpoint
CREATE INDEX "books_genre_idx" ON "books" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "books_title_idx" ON "books" USING btree (lower("title"));--> statement-breakpoint
CREATE UNIQUE INDEX "fines_one_per_loan" ON "fines" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "fines_member_open_idx" ON "fines" USING btree ("member_id") WHERE "fines"."paid_at" is null and "fines"."waived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "genres_name_live_uq" ON "genres" USING btree (lower("name")) WHERE "genres"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_one_open_per_copy" ON "loans" USING btree ("copy_id") WHERE "loans"."returned_at" is null;--> statement-breakpoint
CREATE INDEX "loans_member_idx" ON "loans" USING btree ("member_id","borrowed_at");--> statement-breakpoint
CREATE INDEX "loans_open_due_idx" ON "loans" USING btree ("due_at") WHERE "loans"."returned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "members_card_uq" ON "members" USING btree ("card_number");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_live_uq" ON "members" USING btree ("email") WHERE "members"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_live_uq" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;