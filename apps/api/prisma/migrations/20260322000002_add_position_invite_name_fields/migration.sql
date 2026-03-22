-- CreateTable: WorkspaceInvite (was missing from base migration)
CREATE TABLE IF NOT EXISTS "WorkspaceInvite" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "firstName"   TEXT,
    "lastName"    TEXT,
    "position"    TEXT,
    "role"        "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "token"       TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "usedAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_email_key" ON "WorkspaceInvite"("workspaceId", "email");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite"("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_token_idx" ON "WorkspaceInvite"("token");

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add position to WorkspaceMember
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "position" TEXT;
