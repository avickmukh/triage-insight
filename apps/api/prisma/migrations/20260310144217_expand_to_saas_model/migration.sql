-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_REVIEW', 'PROCESSED', 'ARCHIVED', 'MERGED');

-- CreateEnum
CREATE TYPE "FeedbackSourceType" AS ENUM ('MANUAL', 'PUBLIC_PORTAL', 'EMAIL', 'SLACK', 'CSV_IMPORT', 'VOICE', 'API');

-- CreateEnum
CREATE TYPE "DuplicateSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ThemeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('EXPLORING', 'PLANNED', 'COMMITTED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('ZENDESK', 'INTERCOM', 'FRESHDESK', 'SLACK', 'EMAIL', 'HUBSPOT', 'SALESFORCE', 'STRIPE');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'SOLVED', 'CLOSED', 'RESOLVED', 'ESCALATED', 'REJECTED', 'BACKLOG', 'IN_PROGRESS', 'ON_HOLD', 'WONT_FIX', 'DUPLICATE', 'INVALID', 'NEEDS_INFO', 'REOPENED', 'SPAM', 'ARCHIVED', 'OTHER');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('PROSPECTING', 'QUALIFYING', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('SMB', 'MID_MARKET', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "AccountPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CustomerLifecycleStage" AS ENUM ('LEAD', 'PROSPECT', 'ACTIVE', 'EXPANDING', 'AT_RISK', 'CHURNED');

-- CreateEnum
CREATE TYPE "ChurnRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('USER_INVITED', 'MEMBER_ROLE_CHANGED', 'WORKSPACE_CREATED', 'WORKSPACE_STATUS_CHANGED', 'BILLING_UPDATED', 'FEEDBACK_CREATE', 'FEEDBACK_UPDATE', 'FEEDBACK_STATUS_CHANGE', 'FEEDBACK_MERGE', 'DUPLICATE_DECISION', 'THEME_CREATE', 'THEME_UPDATE', 'THEME_DELETE', 'THEME_MERGE', 'THEME_SPLIT', 'THEME_FEEDBACK_ADD', 'THEME_FEEDBACK_REMOVE', 'PRIORITIZATION_SETTINGS_UPDATE', 'ROADMAP_ITEM_CREATE', 'ROADMAP_ITEM_UPDATE', 'ROADMAP_ITEM_STATUS_CHANGE', 'INTEGRATION_CONNECTED', 'INTEGRATION_SYNC', 'SUPPORT_CLUSTER_CREATED', 'SUPPORT_SPIKE_DETECTED', 'DIGEST_SENT', 'VOICE_PROCESSED', 'CHURN_SCORE_UPDATED');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('FEEDBACK_SUMMARY', 'FEEDBACK_DUPLICATE_DETECTION', 'THEME_CLUSTERING', 'VOICE_TRANSCRIPTION', 'VOICE_EXTRACTION', 'SUPPORT_CLUSTERING', 'SUPPORT_CORRELATION', 'CHURN_SCORING');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PublicPortalVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "platformRole" "PlatformRole",
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'PENDING',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "portalVisibility" "PublicPortalVisibility" NOT NULL DEFAULT 'PUBLIC',
    "billingPlan" "BillingPlan" NOT NULL DEFAULT 'FREE',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
    "billingEmail" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "segment" "CustomerSegment",
    "arrValue" DOUBLE PRECISION DEFAULT 0,
    "currency" TEXT DEFAULT 'USD',
    "accountPriority" "AccountPriority" NOT NULL DEFAULT 'MEDIUM',
    "lifecycleStage" "CustomerLifecycleStage" NOT NULL DEFAULT 'PROSPECT',
    "locale" TEXT,
    "countryCode" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "annualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stage" "DealStage" NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealThemeLink" (
    "dealId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealThemeLink_pkey" PRIMARY KEY ("dealId","themeId")
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "name" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "sourceType" "FeedbackSourceType" NOT NULL,
    "sourceRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "normalizedText" TEXT,
    "language" TEXT,
    "summary" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "sentiment" DOUBLE PRECISION,
    "impactScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),
    "mergedIntoId" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT,
    "portalUserId" TEXT,
    "anonymousId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT,
    "portalUserId" TEXT,
    "anonymousId" TEXT,
    "authorName" TEXT,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackDuplicateSuggestion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "status" "DuplicateSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackDuplicateSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ThemeStatus" NOT NULL DEFAULT 'DRAFT',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeFeedback" (
    "themeId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeFeedback_pkey" PRIMARY KEY ("themeId","feedbackId")
);

-- CreateTable
CREATE TABLE "CustomerSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "themeId" TEXT,
    "signalType" TEXT NOT NULL,
    "sourceId" TEXT,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "themeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RoadmapStatus" NOT NULL DEFAULT 'EXPLORING',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "priorityScore" DOUBLE PRECISION,
    "revenueImpactValue" DOUBLE PRECISION,
    "dealInfluenceValue" DOUBLE PRECISION,
    "customerCount" INTEGER,
    "targetQuarter" TEXT,
    "targetYear" INTEGER,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrioritizationSettings" (
    "workspaceId" TEXT NOT NULL,
    "requestFrequencyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "customerCountWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "arrValueWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "accountPriorityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "dealValueWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "strategicWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "dealStageProspecting" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "dealStageQualifying" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "dealStageProposal" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "dealStageNegotiation" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "dealStageClosedWon" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrioritizationSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "subdomain" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "externalId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "customerEmail" TEXT,
    "tags" TEXT[],
    "arrValue" DOUBLE PRECISION,
    "externalCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(1536),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportIssueCluster" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "themeId" TEXT,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "arrExposure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportIssueCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportIssueClusterMap" (
    "clusterId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportIssueClusterMap_pkey" PRIMARY KEY ("clusterId","ticketId")
);

-- CreateTable
CREATE TABLE "IssueSpikeEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "zScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueSpikeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerChurnScore" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "riskLevel" "ChurnRiskLevel" NOT NULL,
    "reasons" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerChurnScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "summary" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobType" "AiJobType" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "entityType" TEXT,
    "entityId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditLogAction" NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "UsageMetric_workspaceId_idx" ON "UsageMetric"("workspaceId");

-- CreateIndex
CREATE INDEX "UsageMetric_metricKey_idx" ON "UsageMetric"("metricKey");

-- CreateIndex
CREATE INDEX "UsageMetric_periodStart_idx" ON "UsageMetric"("periodStart");

-- CreateIndex
CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_companyName_idx" ON "Customer"("companyName");

-- CreateIndex
CREATE INDEX "Customer_arrValue_idx" ON "Customer"("arrValue");

-- CreateIndex
CREATE INDEX "Customer_accountPriority_idx" ON "Customer"("accountPriority");

-- CreateIndex
CREATE INDEX "Deal_workspaceId_idx" ON "Deal"("workspaceId");

-- CreateIndex
CREATE INDEX "Deal_customerId_idx" ON "Deal"("customerId");

-- CreateIndex
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "DealThemeLink_themeId_idx" ON "DealThemeLink"("themeId");

-- CreateIndex
CREATE INDEX "PortalUser_workspaceId_idx" ON "PortalUser"("workspaceId");

-- CreateIndex
CREATE INDEX "PortalUser_customerId_idx" ON "PortalUser"("customerId");

-- CreateIndex
CREATE INDEX "PortalUser_email_idx" ON "PortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_workspaceId_email_key" ON "PortalUser"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Feedback_workspaceId_idx" ON "Feedback"("workspaceId");

-- CreateIndex
CREATE INDEX "Feedback_customerId_idx" ON "Feedback"("customerId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_sourceType_idx" ON "Feedback"("sourceType");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_submittedAt_idx" ON "Feedback"("submittedAt");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_workspaceId_idx" ON "FeedbackAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackVote_workspaceId_idx" ON "FeedbackVote"("workspaceId");

-- CreateIndex
CREATE INDEX "FeedbackVote_feedbackId_idx" ON "FeedbackVote"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackVote_userId_idx" ON "FeedbackVote"("userId");

-- CreateIndex
CREATE INDEX "FeedbackVote_portalUserId_idx" ON "FeedbackVote"("portalUserId");

-- CreateIndex
CREATE INDEX "FeedbackVote_anonymousId_idx" ON "FeedbackVote"("anonymousId");

-- CreateIndex
CREATE INDEX "FeedbackComment_workspaceId_idx" ON "FeedbackComment"("workspaceId");

-- CreateIndex
CREATE INDEX "FeedbackComment_feedbackId_idx" ON "FeedbackComment"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackComment_userId_idx" ON "FeedbackComment"("userId");

-- CreateIndex
CREATE INDEX "FeedbackComment_portalUserId_idx" ON "FeedbackComment"("portalUserId");

-- CreateIndex
CREATE INDEX "FeedbackComment_anonymousId_idx" ON "FeedbackComment"("anonymousId");

-- CreateIndex
CREATE INDEX "FeedbackDuplicateSuggestion_status_idx" ON "FeedbackDuplicateSuggestion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackDuplicateSuggestion_sourceId_targetId_key" ON "FeedbackDuplicateSuggestion"("sourceId", "targetId");

-- CreateIndex
CREATE INDEX "Theme_workspaceId_idx" ON "Theme"("workspaceId");

-- CreateIndex
CREATE INDEX "Theme_status_idx" ON "Theme"("status");

-- CreateIndex
CREATE INDEX "Theme_pinned_idx" ON "Theme"("pinned");

-- CreateIndex
CREATE INDEX "ThemeFeedback_feedbackId_idx" ON "ThemeFeedback"("feedbackId");

-- CreateIndex
CREATE INDEX "CustomerSignal_workspaceId_idx" ON "CustomerSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomerSignal_customerId_idx" ON "CustomerSignal"("customerId");

-- CreateIndex
CREATE INDEX "CustomerSignal_themeId_idx" ON "CustomerSignal"("themeId");

-- CreateIndex
CREATE INDEX "CustomerSignal_signalType_idx" ON "CustomerSignal"("signalType");

-- CreateIndex
CREATE INDEX "RoadmapItem_workspaceId_idx" ON "RoadmapItem"("workspaceId");

-- CreateIndex
CREATE INDEX "RoadmapItem_status_idx" ON "RoadmapItem"("status");

-- CreateIndex
CREATE INDEX "RoadmapItem_isPublic_idx" ON "RoadmapItem"("isPublic");

-- CreateIndex
CREATE INDEX "RoadmapItem_themeId_idx" ON "RoadmapItem"("themeId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_workspaceId_idx" ON "IntegrationConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_workspaceId_provider_key" ON "IntegrationConnection"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "SupportTicket_workspaceId_idx" ON "SupportTicket"("workspaceId");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket"("customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_externalCreatedAt_idx" ON "SupportTicket"("externalCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_workspaceId_provider_externalId_key" ON "SupportTicket"("workspaceId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "SupportIssueCluster_workspaceId_idx" ON "SupportIssueCluster"("workspaceId");

-- CreateIndex
CREATE INDEX "SupportIssueCluster_themeId_idx" ON "SupportIssueCluster"("themeId");

-- CreateIndex
CREATE INDEX "SupportIssueClusterMap_ticketId_idx" ON "SupportIssueClusterMap"("ticketId");

-- CreateIndex
CREATE INDEX "IssueSpikeEvent_workspaceId_idx" ON "IssueSpikeEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "IssueSpikeEvent_clusterId_idx" ON "IssueSpikeEvent"("clusterId");

-- CreateIndex
CREATE INDEX "IssueSpikeEvent_windowStart_idx" ON "IssueSpikeEvent"("windowStart");

-- CreateIndex
CREATE INDEX "CustomerChurnScore_workspaceId_idx" ON "CustomerChurnScore"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomerChurnScore_customerId_idx" ON "CustomerChurnScore"("customerId");

-- CreateIndex
CREATE INDEX "CustomerChurnScore_riskLevel_idx" ON "CustomerChurnScore"("riskLevel");

-- CreateIndex
CREATE INDEX "CustomerChurnScore_calculatedAt_idx" ON "CustomerChurnScore"("calculatedAt");

-- CreateIndex
CREATE INDEX "DigestSubscription_workspaceId_idx" ON "DigestSubscription"("workspaceId");

-- CreateIndex
CREATE INDEX "DigestSubscription_userId_idx" ON "DigestSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DigestSubscription_workspaceId_userId_frequency_key" ON "DigestSubscription"("workspaceId", "userId", "frequency");

-- CreateIndex
CREATE INDEX "DigestRun_workspaceId_idx" ON "DigestRun"("workspaceId");

-- CreateIndex
CREATE INDEX "DigestRun_sentAt_idx" ON "DigestRun"("sentAt");

-- CreateIndex
CREATE INDEX "UploadAsset_workspaceId_idx" ON "UploadAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "AiJobLog_workspaceId_idx" ON "AiJobLog"("workspaceId");

-- CreateIndex
CREATE INDEX "AiJobLog_jobType_idx" ON "AiJobLog"("jobType");

-- CreateIndex
CREATE INDEX "AiJobLog_status_idx" ON "AiJobLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageMetric" ADD CONSTRAINT "UsageMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealThemeLink" ADD CONSTRAINT "DealThemeLink_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealThemeLink" ADD CONSTRAINT "DealThemeLink_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackDuplicateSuggestion" ADD CONSTRAINT "FeedbackDuplicateSuggestion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackDuplicateSuggestion" ADD CONSTRAINT "FeedbackDuplicateSuggestion_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeFeedback" ADD CONSTRAINT "ThemeFeedback_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeFeedback" ADD CONSTRAINT "ThemeFeedback_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSignal" ADD CONSTRAINT "CustomerSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSignal" ADD CONSTRAINT "CustomerSignal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSignal" ADD CONSTRAINT "CustomerSignal_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrioritizationSettings" ADD CONSTRAINT "PrioritizationSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIssueCluster" ADD CONSTRAINT "SupportIssueCluster_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIssueCluster" ADD CONSTRAINT "SupportIssueCluster_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIssueClusterMap" ADD CONSTRAINT "SupportIssueClusterMap_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "SupportIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIssueClusterMap" ADD CONSTRAINT "SupportIssueClusterMap_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueSpikeEvent" ADD CONSTRAINT "IssueSpikeEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueSpikeEvent" ADD CONSTRAINT "IssueSpikeEvent_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "SupportIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerChurnScore" ADD CONSTRAINT "CustomerChurnScore_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerChurnScore" ADD CONSTRAINT "CustomerChurnScore_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestSubscription" ADD CONSTRAINT "DigestSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestSubscription" ADD CONSTRAINT "DigestSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestRun" ADD CONSTRAINT "DigestRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobLog" ADD CONSTRAINT "AiJobLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
