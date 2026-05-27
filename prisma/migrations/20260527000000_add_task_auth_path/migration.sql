-- Add authPath to Task: which auth the worker used for this run.
-- 'oauth' = Claude Max subscription (no per-token billing).
-- 'api_key' = ANTHROPIC_API_KEY path (billed by Anthropic).
-- NULL = legacy row written before this column existed.
ALTER TABLE "Task" ADD COLUMN "authPath" TEXT;
