-- Add ProjectSecretMapping: ties a Project to a 1Password item field
-- so the worker can inject resolved secrets into the agent's subprocess env.
CREATE TABLE "ProjectSecretMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "envName" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectSecretMapping_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectSecretMapping_projectId_envName_key" ON "ProjectSecretMapping"("projectId", "envName");
CREATE INDEX "ProjectSecretMapping_projectId_idx" ON "ProjectSecretMapping"("projectId");
