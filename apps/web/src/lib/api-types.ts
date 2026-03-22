/**
 * This file contains all the TypeScript types for the API client.
 * It is based on the Prisma schema and the NestJS DTOs.
 */

// --- Enums ---

export enum PlatformRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
}

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  DISABLED = 'DISABLED',
}

export enum WorkspaceStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export enum BillingPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

export enum TrialStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CONVERTED = 'CONVERTED',
}

export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

export enum BillingStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  UNPAID = 'UNPAID',
}

export enum FeedbackStatus {
  NEW = 'NEW',
  IN_REVIEW = 'IN_REVIEW',
  PROCESSED = 'PROCESSED',
  ARCHIVED = 'ARCHIVED',
  MERGED = 'MERGED',
}

export enum FeedbackSourceType {
  MANUAL = 'MANUAL',
  PUBLIC_PORTAL = 'PUBLIC_PORTAL',
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  CSV_IMPORT = 'CSV_IMPORT',
  VOICE = 'VOICE',
  API = 'API',
}

export enum ThemeStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum RoadmapStatus {
  BACKLOG = 'BACKLOG',
  EXPLORING = 'EXPLORING',
  PLANNED = 'PLANNED',
  COMMITTED = 'COMMITTED',
  SHIPPED = 'SHIPPED',
}

export enum PublicPortalVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

// --- Models ---

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole?: PlatformRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: WorkspaceStatus;
  /** IANA timezone string, e.g. "America/New_York" */
  timezone: string;
  /** BCP-47 locale tag, e.g. "en" */
  defaultLocale: string;
  /** ISO 4217 currency code, e.g. "USD" */
  defaultCurrency: string;
  /** Whether the public portal is visible to unauthenticated visitors */
  portalVisibility: PublicPortalVisibility;
  billingPlan: BillingPlan;
  billingStatus: BillingStatus;
  billingEmail?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  /** Job title / position within the workspace */
  position?: string | null;
  user: User;
  joinedAt: string;
}

/** Attachment record returned by the backend on feedback detail/list */
export interface FeedbackAttachment {
  id: string;
  feedbackId: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  s3Bucket: string;
  createdAt: string;
}

export interface Feedback {
  id: string;
  workspaceId: string;
  customerId?: string | null;
  portalUserId?: string | null;
  sourceType: FeedbackSourceType;
  sourceRef?: string | null;
  title: string;
  description: string;
  rawText?: string | null;
  normalizedText?: string | null;
  language?: string | null;
  summary?: string | null;
  status: FeedbackStatus;
  sentiment?: number | null;
  impactScore?: number | null;
  metadata?: Record<string, unknown> | null;
  mergedIntoId?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  attachments?: FeedbackAttachment[];
  themes?: ThemeFeedback[];
}

export interface ThemeFeedback {
  themeId: string;
  feedbackId: string;
  theme?: Theme;
}

export interface FeedbackListResponse {
  data: Feedback[];
  total: number;
  page: number;
  limit: number;
}

export interface FeedbackComment {
  id: string;
  feedbackId: string;
  workspaceId: string;
  content: string;
  authorId?: string | null;
  portalUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Theme {
  id: string;
  workspaceId: string;
  /** Matches the Prisma `title` field on the Theme model */
  title: string;
  description?: string | null;
  status: ThemeStatus;
  pinned: boolean;
  aggregatedPriorityScore?: number | null;
  linkedFeedback?: ThemeFeedback[];
  /** Present on detail endpoint (findOne) */
  feedbackCount?: number;
  /** Present on list endpoint (findMany) — Prisma _count include */
  _count?: { feedbacks: number };
  createdAt: string;
  updatedAt: string;
}

export interface ThemeListResponse {
  data: Theme[];
  total: number;
  page: number;
  limit: number;
}

export interface ThemeLinkedFeedbackResponse {
  data: Feedback[];
  total: number;
  page: number;
  limit: number;
}

export interface ThemeReclusterResponse {
  jobId: string;
  message: string;
}

export interface RoadmapItem {
  id: string;
  workspaceId: string;
  title: string;
  description?: string | null;
  status: RoadmapStatus;
  isPublic: boolean;
  themeId?: string | null;
  theme?: Theme | null;
  feedbackCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapListResponse {
  data: RoadmapItem[];
  total: number;
}

export interface RoadmapBoardResponse {
  [status: string]: RoadmapItem[];
}

export interface DuplicateSuggestion {
  id: string;
  sourceFeedbackId: string;
  targetFeedbackId: string;
  similarityScore: number;
  status: DuplicateSuggestionStatus;
  createdAt: string;
  updatedAt: string;
  sourceFeedback?: Feedback;
  targetFeedback?: Feedback;
}

export enum DuplicateSuggestionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export interface SupportTicket {
  id: string;
  workspaceId: string;
  customerId?: string | null;
  externalId?: string | null;
  subject: string;
  body?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketListResponse {
  data: SupportTicket[];
  total: number;
  page: number;
  limit: number;
}

// --- Public Portal ---

export interface PublicFeedbackDto {
  title: string;
  description: string;
  email?: string;
  name?: string;
}

export interface PortalCreateFeedbackDto {
  title: string;
  description: string;
}

export interface PortalCreateFeedbackResponse {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface PublicFeedbackDetail {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  voteCount: number;
  commentCount: number;
  createdAt: string;
  userVoted?: boolean;
}

export interface PublicFeedbackListResponse {
  data: PublicFeedbackDetail[];
  total: number;
  page: number;
  limit: number;
}

export interface PublicVoteDto {
  value: 1 | -1;
}

export interface PublicVoteResponse {
  voteCount: number;
  userVoted: boolean;
}

export interface PublicCommentDto {
  content: string;
}

export interface PublicRoadmapResponse {
  data: RoadmapItem[];
}

// --- Auth ---

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface SignUpDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  /** Optional plan selected on the pricing page; defaults to FREE */
  planType?: BillingPlan;
}

export interface InviteInfo {
  email: string;
  role: WorkspaceRole;
  workspaceName: string;
  workspaceSlug: string;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  expiresAt: string;
}

/** Alias kept for backward compatibility with components that import ThemeLinkedFeedback */
export type ThemeLinkedFeedback = Feedback;

// --- DTOs ---

export interface CreateFeedbackDto {
  title: string;
  description: string;
  sourceType?: FeedbackSourceType;
  sourceRef?: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFeedbackDto {
  title?: string;
  description?: string;
  status?: FeedbackStatus;
  sourceType?: FeedbackSourceType;
  sourceRef?: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

export interface InviteMemberDto {
  email: string;
  role: WorkspaceRole;
  firstName?: string;
  lastName?: string;
  position?: string;
}

/**
 * Fields an ADMIN may update on the workspace.
 * Mirrors UpdateWorkspaceDto on the backend.
 */
export interface UpdateWorkspaceDto {
  name?: string;
  description?: string;
  /** IANA timezone string, e.g. "America/New_York" */
  timezone?: string;
  /** BCP-47 locale tag, e.g. "en" */
  defaultLocale?: string;
  /** ISO 4217 currency code, e.g. "USD" */
  defaultCurrency?: string;
  /** Whether the public portal is visible to unauthenticated visitors */
  portalVisibility?: PublicPortalVisibility;
  /** Billing contact email */
  billingEmail?: string;
}

export interface CreateThemeDto {
  title: string;
  description?: string;
  status?: ThemeStatus;
  pinned?: boolean;
}
export interface UpdateThemeDto {
  title?: string;
  description?: string;
  status?: ThemeStatus;
  pinned?: boolean;
}

export interface MoveFeedbackDto {
  feedbackIds: string[];
  targetThemeId: string;
  sourceThemeId?: string;
}

export interface CreateRoadmapItemDto {
  title: string;
  description?: string;
  status?: RoadmapStatus;
  isPublic?: boolean;
  themeId?: string;
}

export interface UpdateRoadmapItemDto {
  title?: string;
  description?: string;
  status?: RoadmapStatus;
  isPublic?: boolean;
  themeId?: string | null;
}

// --- Integrations ---

/**
 * Mirrors the Prisma IntegrationProvider enum.
 * Keep in sync with apps/api/prisma/schema.prisma.
 */
export enum IntegrationProvider {
  ZENDESK    = 'ZENDESK',
  INTERCOM   = 'INTERCOM',
  FRESHDESK  = 'FRESHDESK',
  SLACK      = 'SLACK',
  EMAIL      = 'EMAIL',
  HUBSPOT    = 'HUBSPOT',
  SALESFORCE = 'SALESFORCE',
  STRIPE     = 'STRIPE',
}

/**
 * Returned by GET /workspaces/:id/integrations
 * Every known provider is always present (connected: false when not wired).
 */
export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  /** Non-sensitive display metadata (e.g. Slack team name, Zendesk subdomain). */
  metadata: Record<string, string> | null;
  createdAt: string | null;
}

export interface ConnectZendeskDto {
  subdomain: string;
  accessToken: string;
}

export interface ConnectIntercomDto {
  accessToken: string;
}

export interface ConnectSlackDto {
  accessToken: string;
  teamId?: string;
  teamName?: string;
}

// --- Billing ---

/**
 * A single row from the Plan config table (managed by SUPER_ADMIN).
 * Returned by GET /billing/plans.
 *
 * Plans: FREE | PRO ($29/mo) | BUSINESS ($49/mo)
 */
export interface PlanConfig {
  planType: BillingPlan;
  displayName: string;
  description: string | null;
  /** Monthly price in USD cents (0 = free) */
  priceMonthly: number;
  trialDays: number;
  /** Max ADMIN-role members allowed (null = unlimited) */
  adminLimit: number | null;
  seatLimit: number | null;
  aiUsageLimit: number | null;
  feedbackLimit: number | null;
  /** Monthly voice upload slots (0 = disabled, null = unlimited) */
  voiceUploadLimit: number | null;
  /** Monthly survey response slots (0 = disabled, null = unlimited) */
  surveyResponseLimit: number | null;
  aiInsights: boolean;
  aiThemeClustering: boolean;
  ciqPrioritization: boolean;
  explainableAi: boolean;
  weeklyDigest: boolean;
  voiceFeedback: boolean;
  survey: boolean;
  integrations: boolean;
  publicPortal: boolean;
  csvImport: boolean;
  apiAccess: boolean;
  executiveReporting: boolean;
  /** Custom domain — coming soon; always false for now */
  customDomain: boolean;
  isActive: boolean;
  isDefault: boolean;
}

/**
 * Full billing snapshot returned by GET /billing/status.
 * All authenticated members can read this; only ADMIN can mutate.
 */
export interface BillingStatusResponse {
  workspaceId: string;
  // Plan identity
  billingPlan: BillingPlan;
  billingStatus: BillingStatus;
  planStatus: PlanStatus;
  // Trial lifecycle
  trialStatus: TrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  /** Number of days remaining in the trial; null when not trialing */
  trialDaysRemaining: number | null;
  // Billing period (populated by Stripe webhooks)
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  // Contact
  billingEmail: string | null;
  /** True when a Stripe customer record exists for this workspace */
  hasStripeCustomer: boolean;
  // Workspace-level overrides
  seatLimit: number;
  aiUsageLimit: number;
  // DB-driven plan config
  planConfig: Omit<PlanConfig, 'planType' | 'isActive' | 'isDefault'>;
}

export interface UpdateBillingEmailDto {
  billingEmail: string;
}

export interface RequestPlanChangeDto {
  targetPlan: BillingPlan;
}

export interface RequestPlanChangeResponse {
  requested: boolean;
  currentPlan: BillingPlan;
  targetPlan: BillingPlan;
  message: string;
}

// --- Domain Management ---
export enum DomainVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

/**
 * Returned by GET/PUT/POST/DELETE /workspace/current/domain.
 * Contains the full domain state for the calling user's workspace.
 */
export interface DomainSettings {
  /** The default slug-based domain, e.g. "acme.triageinsight.com" */
  defaultDomain: string;
  /** Custom domain set by the admin, or null if not configured */
  customDomain: string | null;
  domainVerificationStatus: DomainVerificationStatus;
  /** TXT record value the admin must add to their DNS zone */
  domainVerificationToken: string | null;
  /** ISO timestamp of the last verification attempt, or null */
  domainLastCheckedAt: string | null;
}

export interface SetDomainDto {
  /** Bare hostname, no protocol or trailing slash, e.g. "feedback.acme.com" */
  customDomain: string;
}

// --- API Error ---
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// --- Plan Limit Summary ---
export interface LimitSlot {
  used: number;
  /** null means unlimited */
  limit: number | null;
  unlimited: boolean;
}

/**
 * Returned by GET /workspace/current/limits.
 * Shows current usage vs plan limits for the workspace.
 */
export interface WorkspaceLimitSummary {
  seats: LimitSlot;
  admins: LimitSlot;
  feedbackThisMonth: LimitSlot;
  voiceThisMonth: LimitSlot;
  surveyResponsesThisMonth: LimitSlot;
  plan: {
    planType: BillingPlan;
    displayName: string;
    priceMonthly: number;
  };
}
