-- Migration: add_theme_embedding_column
--
-- The Theme table was created in the initial migration without the embedding
-- column. The Prisma schema has always declared it as vector(1536), but no
-- ALTER TABLE was ever generated. This migration adds the missing column so
-- that pgvector cosine-similarity queries in theme-clustering.service.ts
-- (SELECT ... FROM "Theme" WHERE "embedding" IS NOT NULL) do not fail with
-- "column embedding does not exist".
--
-- The column is nullable so existing rows are unaffected. The worker will
-- populate it incrementally as new feedback is processed.

ALTER TABLE "Theme" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Optional index for faster ANN (approximate nearest-neighbour) searches.
-- Uses ivfflat with 100 lists — suitable for up to ~1 M rows.
-- Omit or adjust lists= based on your dataset size.
CREATE INDEX IF NOT EXISTS "Theme_embedding_idx"
  ON "Theme" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- Add ivfflat indexes on the other two tables that already have the column
-- but were also missing the vector index.
CREATE INDEX IF NOT EXISTS "Feedback_embedding_idx"
  ON "Feedback" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "SupportTicket_embedding_idx"
  ON "SupportTicket" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
