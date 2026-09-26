CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text DEFAULT '' NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" text NOT NULL,
  "role" varchar(16) DEFAULT 'user' NOT NULL,
  "company_name" text DEFAULT '' NOT NULL,
  "ico" text DEFAULT '' NOT NULL,
  "dic" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "ico" text DEFAULT '' NOT NULL,
  "neplavec_dph" boolean DEFAULT true NOT NULL,
  "bank_account" text DEFAULT '' NOT NULL,
  "iban" text DEFAULT '' NOT NULL,
  "swift" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "web" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" uuid NOT NULL,
  "number" text DEFAULT '' NOT NULL,
  "status" varchar(16) DEFAULT 'unpaid' NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_invoice_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text DEFAULT 'public-free-invoice' NOT NULL,
  "contact_email" text DEFAULT '' NOT NULL,
  "gdpr_accepted" boolean DEFAULT false NOT NULL,
  "terms_accepted" boolean DEFAULT false NOT NULL,
  "invoice" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
