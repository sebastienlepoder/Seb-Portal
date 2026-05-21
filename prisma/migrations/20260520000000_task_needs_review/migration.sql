-- Add needs_review workflow columns to Task
ALTER TABLE "Task" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Task" ADD COLUMN "mergedAt" DATETIME;
