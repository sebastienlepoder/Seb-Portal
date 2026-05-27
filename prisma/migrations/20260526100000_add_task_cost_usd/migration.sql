-- Add costUsd column to Task: dollar cost reported by the Claude Agent SDK.
-- NULL = unknown (rows that ran before this column existed).
-- 0    = Max OAuth path used (no per-token billing).
-- > 0  = ANTHROPIC_API_KEY fallback path used.
ALTER TABLE "Task" ADD COLUMN "costUsd" REAL;
