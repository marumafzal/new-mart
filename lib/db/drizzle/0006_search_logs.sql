CREATE TABLE IF NOT EXISTS "search_logs" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "query" text NOT NULL,
  "result_count" integer NOT NULL DEFAULT 0,
  "user_id" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "search_logs_result_count_created_at_idx" ON "search_logs" ("result_count", "created_at");
CREATE INDEX IF NOT EXISTS "search_logs_query_idx" ON "search_logs" ("query");
CREATE INDEX IF NOT EXISTS "search_logs_created_at_idx" ON "search_logs" ("created_at");
