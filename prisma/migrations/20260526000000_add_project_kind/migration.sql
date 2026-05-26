-- Add kind column to Project: 'digital' (default) | 'physical'
ALTER TABLE "Project" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'digital';
