-- Add position to WorkspaceMember
ALTER TABLE "WorkspaceMember" ADD COLUMN "position" TEXT;

-- Add firstName, lastName, position to WorkspaceInvite
ALTER TABLE "WorkspaceInvite" ADD COLUMN "firstName" TEXT;
ALTER TABLE "WorkspaceInvite" ADD COLUMN "lastName" TEXT;
ALTER TABLE "WorkspaceInvite" ADD COLUMN "position" TEXT;
