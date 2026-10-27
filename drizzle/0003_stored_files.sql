CREATE TABLE "stored_file_chunks" (
	"key" text NOT NULL,
	"idx" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_file_chunks_key_idx_pk" PRIMARY KEY("key","idx")
);
