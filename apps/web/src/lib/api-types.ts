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

export interface FeedbackCustomerSnippet {
  id: string;
  name: string;
  companyName?: string | null;
  segment?: CustomerSegment | null;
  arrValue?: number | null;
  mrrValue?: number | null;
  accountPriority: AccountPriority;
  lifecycleStage: CustomerLifecycleStage;
  churnRisk?: number | null;
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
  customer?: FeedbackCustomerSnippet | null;
  comments?: FeedbackComment[];
  confidence?: number | null;
  assignedBy?: string | null;
}

export interface ThemeFeedback {
  id?: string;
  themeId: string;
  feedbackId: string;
  theme?: Theme;
  /** Feedback fields present when theme linked feedback is expanded */
  title?: string;
  description?: string | null;
  status?: string;
  sourceType?: string;
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string;
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
  /** Alias for content — some components use body */
  body?: string;
  authorId?: string | null;
  portalUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated author object when expanded */
  author?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
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
  linkedFeedback?: (ThemeFeedback | Feedback)[];
  /** Present on detail endpoint (findOne) */
  feedbackCount?: number;
  /** Present on list endpoint (findMany) — Prisma _count include */
  _count?: { feedbacks: number };
  // ─── CIQ Priority Intelligence fields ───────────────────────────────────────
  /** CIQ priority score (0–100), null if never scored */
  priorityScore?: number | null;
  /** Timestamp of the last CIQ scoring run */
  lastScoredAt?: string | null;
  /** Raw ARR sum from linked customers (used for revenue impact display) */
  revenueInfluence?: number | null;
  /** Per-factor signal breakdown from the last CIQ scoring run (JSON) */
  signalBreakdown?: Record<string, unknown> | null;
  // ─── Stage-2 AI Narration fields ───────────────────────────────────────────
  /** LLM-generated 2–3 sentence summary of what this theme is about */
  aiSummary?: string | null;
  /** LLM-generated explanation of why this theme matters to the business */
  aiExplanation?: string | null;
  /** LLM-generated recommended action for the product team */
  aiRecommendation?: string | null;
  /** Confidence score (0–1) for the AI narration; null until first narration run */
  aiConfidence?: number | null;
  /** Timestamp of the last successful AI narration run */
  aiNarratedAt?: string | null;
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
  // Intelligence fields
  priorityScore?: number | null;
  confidenceScore?: number | null;
  revenueImpactScore?: number | null;
  revenueImpactValue?: number | null;
  dealInfluenceValue?: number | null;
  feedbackCount?: number;
  signalCount?: number;
  customerCount?: number | null;
  targetQuarter?: string | null;
  targetYear?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Extended detail view returned by GET /roadmap/:id */
export interface RoadmapItemDetail extends RoadmapItem {
  linkedFeedback: Array<{
    id: string;
    title: string;
    description?: string | null;
    status: string;
    sentiment?: number | null;
    impactScore?: number | null;
    sourceType?: string | null;
    createdAt: string;
    assignedBy?: string | null;
    assignmentConfidence?: number | null;
    customer?: {
      id: string;
      name?: string | null;
      companyName?: string | null;
      arrValue?: number | null;
    } | null;
  }>;
  signalSummary: Record<string, number>;
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
  /** Alias for sourceFeedbackId — used in some components */
  sourceId?: string;
  similarityScore: number;
  /** Alias for similarityScore — used in some components */
  similarity?: number;
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

// ─── Support Intelligence MVP ─────────────────────────────────────────────────

export type SpikeSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SupportTicket {
  id: string;
  workspaceId: string;
  customerId?: string | null;
  externalId?: string | null;
  subject: string;
  /** Alias for subject — used in some components */
  title?: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  source?: string | null;
  provider?: string;
  customerEmail?: string | null;
  arrValue?: number | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  externalCreatedAt?: string | null;
  cluster?: { id: string; title: string; themeId: string | null } | null;
}

export interface SupportTicketListResponse {
  items: SupportTicket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SupportCluster {
  id: string;
  title: string;
  description: string | null;
  ticketCount: number;
  arrExposure: number;
  themeId: string | null;
  themeTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportSpike {
  id: string;
  clusterId: string;
  clusterTitle: string;
  ticketCount: number;
  baseline: number;
  zScore: number;
  severity: SpikeSeverity;
  arrExposure: number;
  windowStart: string;
  windowEnd: string;
  themeId: string | null;
  themeTitle: string | null;
}

export interface SupportOverviewSummary {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  totalClusters: number;
  linkedClusters: number;
  totalArrExposure: number;
  activeSpikes: number;
  criticalSpikes: number;
}

export interface SupportRecentTicket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  customerEmail: string | null;
}

export interface SupportOverview {
  summary: SupportOverviewSummary;
  topClusters: SupportCluster[];
  activeSpikes: SupportSpike[];
  recentTickets: SupportRecentTicket[];
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
  email?: string;
  name?: string;
  anonymousId?: string;
}

export interface PortalCreateFeedbackResponse {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface PublicFeedbackComment {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface PublicFeedbackDetail {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  voteCount: number;
  commentCount?: number;
  createdAt: string;
  userVoted?: boolean;
  comments: PublicFeedbackComment[];
}

export interface PublicFeedbackListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PublicFeedbackListResponse {
  data: PublicFeedbackDetail[];
  meta: PublicFeedbackListMeta;
}

export interface PublicVoteDto {
  anonymousId?: string;
  email?: string;
  name?: string;
}

export interface PublicVoteResponse {
  id: string;
  feedbackId: string;
  voteCount: number;
  createdAt: string;
}

export interface PublicCommentDto {
  body: string;
  email?: string;
  name?: string;
  anonymousId?: string;
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
  description?: string;
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
  targetQuarter?: string;
  targetYear?: number;
}

export interface UpdateRoadmapItemDto {
  title?: string;
  description?: string;
  status?: RoadmapStatus;
  isPublic?: boolean;
  themeId?: string | null;
  targetQuarter?: string | null;
  targetYear?: number | null;
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
export type IntegrationHealthState = 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'UNKNOWN';

export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  /** Non-sensitive display metadata (e.g. Slack team name, Zendesk subdomain). */
  metadata: Record<string, string> | null;
  createdAt: string | null;
  /** ACTIVE | DISCONNECTED | ERROR — reflects current connection health */
  status?: 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
  /** Fine-grained health state for UI display */
  healthState?: IntegrationHealthState;
  /** Last error message if status is ERROR */
  lastErrorMessage?: string | null;
  /** When the last error occurred */
  lastErrorAt?: string | null;
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

// ─── CIQ (Customer Intelligence Quotient) Types ──────────────────────────────

/**
 * A single factor in the CIQ score breakdown.
 * Returned by /ciq-explanation and /prioritization/themes/:id/ciq endpoints.
 */
export interface CiqScoreComponent {
  /** Raw input value (e.g., request count, ARR in dollars) */
  value: number;
  /** Normalised input value in the 0–100 range used for scoring */
  normalisedValue?: number;
  /** Configured weight (0–1) from PrioritizationSettings */
  weight: number;
  /** Weighted contribution to the final score: normalisedValue × weight */
  contribution: number;
  /** Human-readable label for explainability UI */
  label: string;
}

/**
 * Full CIQ score output for a theme or roadmap item.
 * Returned by:
 *   GET  /workspaces/:id/roadmap/:itemId/ciq-explanation
 *   GET  /workspaces/:id/prioritization/themes/:themeId/ciq
 *   POST /workspaces/:id/prioritization/themes/:themeId/recalculate
 *   POST /workspaces/:id/roadmap/:itemId/refresh-intelligence
 */
export interface CiqScoreOutput {
  /** Final normalised priority score (0–100) */
  priorityScore: number;
  /** Confidence in the score (0–1): rises with more data signals */
  confidenceScore: number;
  /** Normalised revenue impact (0–100) derived from ARR + deal pipeline */
  revenueImpactScore: number;
  /** Raw ARR sum from linked customers */
  revenueImpactValue: number;
  /** Raw deal influence value from linked deals */
  dealInfluenceValue: number;
  /** Count of non-MERGED feedback items linked to this theme */
  feedbackCount: number;
  /** Count of CustomerSignal rows linked to this theme */
  signalCount: number;
  /** Number of distinct customers who submitted linked feedback */
  uniqueCustomerCount: number;
  /**
   * Per-factor breakdown for explainability.
   * Keys: requestFrequency | customerCount | arrValue | accountPriority |
   *       dealInfluence | signalStrength | storedRevenue
   */
  scoreExplanation: Record<string, CiqScoreComponent>;
  /**
   * The scoring dimension that contributed most to the final score.
   * Useful for surfacing a one-line explanation in the UI.
   */
  dominantDriver?: string;
  /** True when the score was derived from a linked theme (vs. stored values only) */
  themeScored?: boolean;
}

/**
 * Lightweight CIQ score for a single feedback item.
 * Returned by feedback-level scoring (internal use; not yet a public endpoint).
 */
export interface CiqFeedbackScore {
  /** Normalised 0–100 impact estimate for a single feedback item */
  impactScore: number;
  /** Confidence 0–1 based on available signals */
  confidenceScore: number;
  /** ARR of the submitting customer (0 if unknown) */
  customerArrValue: number;
  /** Numeric account priority (1–4) */
  accountPriorityValue: number;
  /** Sentiment: negative values increase urgency */
  sentiment: number | null;
  scoreExplanation: Record<string, CiqScoreComponent>;
}

// ─── Customer Intelligence / Revenue Types ────────────────────────────────────

export enum CustomerSegment {
  SMB         = 'SMB',
  MID_MARKET  = 'MID_MARKET',
  ENTERPRISE  = 'ENTERPRISE',
}

export enum AccountPriority {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum CustomerLifecycleStage {
  LEAD      = 'LEAD',
  PROSPECT  = 'PROSPECT',
  ACTIVE    = 'ACTIVE',
  EXPANDING = 'EXPANDING',
  AT_RISK   = 'AT_RISK',
  CHURNED   = 'CHURNED',
}

export enum DealStage {
  PROSPECTING = 'PROSPECTING',
  QUALIFYING  = 'QUALIFYING',
  PROPOSAL    = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED_WON  = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST',
}

export enum DealStatus {
  OPEN = 'OPEN',
  WON  = 'WON',
  LOST = 'LOST',
}

export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  companyName?: string | null;
  email?: string | null;
  segment?: CustomerSegment | null;
  arrValue?: number | null;
  mrrValue?: number | null;
  currency?: string | null;
  accountPriority: AccountPriority;
  lifecycleStage: CustomerLifecycleStage;
  churnRisk?: number | null;
  accountOwner?: string | null;
  externalId?: string | null;
  locale?: string | null;
  countryCode?: string | null;
  externalRef?: string | null;
  ciqInfluenceScore?: number | null;
  featureDemandScore?: number | null;
  supportIntensityScore?: number | null;
  healthScore?: number | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSignals {
  customerId: string;
  scores: {
    ciqInfluenceScore: number;
    featureDemandScore: number;
    supportIntensityScore: number;
    healthScore: number;
    churnRisk: number;
  };
  sentiment: {
    avg: number;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  };
  signals: Array<{
    id: string;
    signalType: string;
    strength: number;
    createdAt: string;
    themeId?: string | null;
    theme?: { id: string; title: string } | null;
  }>;
  lastActivityAt?: string | null;
}

export interface CustomerAnalytics {
  totalCustomers: number;
  totalARR: number;
  atRiskARR: number;
  segmentBreakdown: Array<{
    segment: string;
    count: number;
    totalARR: number;
    avgCIQ: number;
  }>;
  lifecycleDistribution: Record<string, number>;
  arrWeightedDemand: Array<{
    customerId: string;
    name: string;
    arrValue: number;
    featureDemandScore: number;
    weightedScore: number;
  }>;
  churnRiskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  topByCIQ: Array<{
    id: string;
    name: string;
    segment?: string | null;
    arrValue: number;
    ciqInfluenceScore: number;
    healthScore: number;
    lifecycleStage: string;
    feedbackCount: number;
  }>;
}

export interface CustomerRevenueIntelligence {
  arrValue: number;
  openDealValue: number;
  totalDealValue: number;
  feedbackCount: number;
  dealCount: number;
  signalCount: number;
  influencedThemeCount: number;
  influencedRoadmapCount: number;
}

export interface CustomerInfluencedTheme {
  id: string;
  title: string;
  status: string;
  priorityScore?: number | null;
  revenueInfluence?: number | null;
}

export interface CustomerDetail extends Customer {
  revenueIntelligence: CustomerRevenueIntelligence;
  influencedThemes?: CustomerInfluencedTheme[];
  feedbacks: Array<{
    id: string;
    title: string;
    description: string;
    status: FeedbackStatus;
    sourceType: string;
    sentiment?: number | null;
    impactScore?: number | null;
    createdAt: string;
    submittedAt: string;
    themes: Array<{ theme: { id: string; title: string; status: string } }>;
  }>;
  deals: DealDetail[];
  signals: Array<{
    id: string;
    signalType: string;
    strength: number;
    createdAt: string;
    themeId?: string | null;
  }>;
  influencedRoadmapItems: Array<{
    id: string;
    title: string;
    status: RoadmapStatus;
    priorityScore?: number | null;
    confidenceScore?: number | null;
    isPublic: boolean;
    targetQuarter?: string | null;
    targetYear?: number | null;
  }>;
}

export interface Deal {
  id: string;
  workspaceId: string;
  customerId: string;
  title: string;
  annualValue: number;
  currency: string;
  stage: DealStage;
  status: DealStatus;
  notes?: string | null;
  expectedCloseDate?: string | null;
  influenceWeight?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealDetail extends Deal {
  customer: {
    id: string;
    name: string;
    companyName?: string | null;
    segment?: CustomerSegment | null;
    arrValue?: number | null;
    accountPriority: AccountPriority;
    lifecycleStage: CustomerLifecycleStage;
  };
  themeLinks: Array<{
    theme: { id: string; title: string; status: string };
  }>;
}

export interface RevenueSummary {
  totalCustomers: number;
  totalARR: number;
  openDealCount: number;
  openDealValue: number;
}

export interface ThemeRevenueCustomer {
  id: string;
  name: string;
  companyName?: string | null;
  arrValue: number;
  accountPriority: string;
  lifecycleStage: string;
  churnRisk?: number | null;
  feedbackCount: number;
}

export interface ThemeRevenueIntelligence {
  deals: DealDetail[];
  totalInfluence: number;
  openInfluence: number;
  dealCount: number;
  topCustomers: ThemeRevenueCustomer[];
  totalCustomerARR: number;
}

export interface PaginatedCustomers {
  data: (Customer & { _count?: { feedbacks: number; deals: number; signals: number } })[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedDeals {
  data: DealDetail[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateCustomerPayload {
  name: string;
  companyName?: string;
  email?: string;
  arrValue?: number;
  mrrValue?: number;
  currency?: string;
  segment?: CustomerSegment;
  accountPriority?: AccountPriority;
  lifecycleStage?: CustomerLifecycleStage;
  churnRisk?: number;
  accountOwner?: string;
  externalId?: string;
  locale?: string;
  countryCode?: string;
  externalRef?: string;
}

export interface UpdateCustomerPayload extends Partial<CreateCustomerPayload> {}

export interface CreateDealPayload {
  customerId: string;
  title: string;
  annualValue?: number;
  currency?: string;
  stage: DealStage;
  status?: DealStatus;
  notes?: string;
  expectedCloseDate?: string;
  influenceWeight?: number;
  themeIds?: string[];
}

export interface UpdateDealPayload extends Partial<CreateDealPayload> {}

// ─── Voice / Audio Upload ─────────────────────────────────────────────────────

export type VoiceJobStatus = 'QUEUED' | 'RUNNING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface VoiceIntelligenceOutput {
  summary: string | null;
  painPoints: string[];
  featureRequests: string[];
  keyTopics: string[];
  sentiment: number | null;
  confidenceScore: number | null;
  linkedThemeId: string | null;
  /** Urgency signal score 0-100 extracted by AI */
  urgencySignal?: number | null;
  /** Churn risk signal score 0-100 extracted by AI */
  churnSignal?: number | null;
}
export interface VoiceUploadListItem {
  id: string;
  workspaceId: string;
  fileName: string;
  /** Human-readable label / title for the recording */
  label: string | null;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  /** Duration of the audio in seconds */
  durationSeconds: number | null;
  createdAt: string;
  jobStatus: VoiceJobStatus | null;
  jobId: string | null;
  transcript: string | null;
  feedbackId: string | null;
  feedbackTitle: string | null;
  error: string | null;
  // Intelligence fields (populated after extraction job completes)
  intelligenceStatus: VoiceJobStatus | null;
  summary: string | null;
  sentiment: number | null;
  confidenceScore: number | null;
  /** Urgency signal score 0-100 extracted by AI */
  urgencySignal: number | null;
  /** Churn risk signal score 0-100 extracted by AI */
  churnSignal: number | null;
  keyTopics: string[];
  linkedThemeId: string | null;
  /** Linked customer (if any) */
  customer: { id: string; name: string; companyName: string | null; arrValue: number | null; churnRisk: number | null } | null;
  /** Linked deal (if any) */
  deal: { id: string; title: string; stage: string; annualValue: number } | null;
}

export interface VoiceUploadDetail extends VoiceUploadListItem {
  downloadUrl: string;
  feedback: {
    id: string;
    title: string;
    description: string;
    summary: string | null;
    status: string;
    sentiment: number | null;
    impactScore: number | null;
    createdAt: string;
    themes: Array<{ id: string; title: string; status: string; priorityScore: number | null }>;
  } | null;
  intelligence: VoiceIntelligenceOutput | null;
}

export interface VoiceUploadListResponse {
  data: VoiceUploadListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VoicePresignedUrlResponse {
  signedUrl: string;
  key: string;
  bucket: string;
}

export interface VoiceFinalizeResponse {
  uploadAssetId: string;
  aiJobLogId: string;
  status: VoiceJobStatus;
}

// ─── Survey Engine ─────────────────────────────────────────────────────────────

export enum SurveyStatus {
  DRAFT     = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED    = 'CLOSED',
}

export enum SurveyType {
  NPS                = 'NPS',
  CSAT               = 'CSAT',
  FEATURE_VALIDATION = 'FEATURE_VALIDATION',
  ROADMAP_VALIDATION = 'ROADMAP_VALIDATION',
  CHURN_SIGNAL       = 'CHURN_SIGNAL',
  OPEN_INSIGHT       = 'OPEN_INSIGHT',
  CUSTOM             = 'CUSTOM',
}

export enum SurveyQuestionType {
  SHORT_TEXT      = 'SHORT_TEXT',
  LONG_TEXT       = 'LONG_TEXT',
  SINGLE_CHOICE   = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  RATING          = 'RATING',
  NPS             = 'NPS',
}

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  type: SurveyQuestionType;
  label: string;
  placeholder: string | null;
  required: boolean;
  order: number;
  options: string[] | null;
  ratingMin: number | null;
  ratingMax: number | null;
  createdAt: string;
}

export interface Survey {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  surveyType: SurveyType;
  status: SurveyStatus;
  convertToFeedback: boolean;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  linkedThemeId: string | null;
  linkedRoadmapItemId: string | null;
  linkedThemeIds: string[];
  linkedRoadmapIds: string[];
  targetSegment: string | null;
  customerSegment: string | null;
  revenueWeightedScore: number | null;
  validationScore: number | null;
  insightScore: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  questions?: SurveyQuestion[];
  _count?: { questions: number; responses: number };
}

export interface SurveyAnswer {
  id: string;
  responseId: string;
  questionId: string;
  textValue: string | null;
  numericValue: number | null;
  choiceValues: string[] | null;
  question?: SurveyQuestion;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  portalUserId: string | null;
  customerId: string | null;
  respondentEmail: string | null;
  respondentName: string | null;
  submittedAt: string;
  feedbackId: string | null;
  ciqWeight: number | null;
  revenueWeight: number | null;
  sentimentScore: number | null;
  clusterLabel: string | null;
  answers: SurveyAnswer[];
  portalUser?: { id: string; email: string; name: string | null } | null;
}

export interface SurveyListResponse {
  data: Survey[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SurveyResponseListResponse {
  data: SurveyResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateSurveyPayload {
  title: string;
  description?: string;
  surveyType?: SurveyType;
  convertToFeedback?: boolean;
  thankYouMessage?: string;
  redirectUrl?: string;
  linkedThemeId?: string;
  linkedRoadmapItemId?: string;
  linkedThemeIds?: string[];
  linkedRoadmapIds?: string[];
  targetSegment?: string;
  customerSegment?: string;
  expiresAt?: string;
}

export interface AddQuestionPayload {
  type: SurveyQuestionType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  ratingMin?: number;
  ratingMax?: number;
}

export interface SubmitSurveyResponsePayload {
  respondentEmail?: string;
  respondentName?: string;
  anonymousId?: string;
  customerId?: string;
  answers: Array<{
    questionId: string;
    textValue?: string;
    numericValue?: number;
    choiceValues?: string[];
  }>;
}

// ─── Survey Intelligence ───────────────────────────────────────────────────────

export interface RevenueWeightedCluster {
  label: string;
  count: number;
  totalArr: number;
  avgSentiment: number;
  topTopics: string[];
}

export interface ChurnSignal {
  customerId: string;
  customerName: string;
  arr: number;
  npsScore: number | null;
  sentiment: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface RevenueWeightedIntelligence {
  revenueWeightedScore: number;
  validationScore: number;
  totalRespondentArr: number;
  avgCiqWeight: number;
  clusters: RevenueWeightedCluster[];
  churnSignals: ChurnSignal[];
  topFeaturesByArr: Array<{ feature: string; arr: number; count: number }>;
  topPainsByArr: Array<{ pain: string; arr: number; count: number }>;
  enterpriseValidation: number;
  smbValidation: number;
}

export interface SurveyIntelligence {
  surveyId: string;
  totalResponses: number;
  processedCount: number;
  avgSentiment: number | null;
  avgNps: number | null;
  avgRating: number | null;
  npsScore: number | null;
  linkedThemeIds: string[];
  keyTopics: string[];
  npsResponseCount: number;
  ratingResponseCount: number;
  textResponseCount: number;
  insightScore: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number } | null;
  topFeatureRequests: string[];
  topPainPoints: string[];
  revenueWeighted: RevenueWeightedIntelligence | null;
  surveyType: SurveyType;
  validationScore: number | null;
  revenueWeightedScore: number | null;
}

// ─── Prioritization Settings ───────────────────────────────────────────────────
/**
 * Returned by GET/PATCH /workspaces/:id/prioritization/settings
 * All weight fields are 0–1 floats.
 */
export interface PrioritizationSettings {
  workspaceId: string;
  // Core signal weights
  requestFrequencyWeight: number;
  customerCountWeight: number;
  arrValueWeight: number;
  accountPriorityWeight: number;
  dealValueWeight: number;
  strategicWeight: number;
  // Extended CIQ weights (PRD formula fields)
  voteWeight: number;
  sentimentWeight: number;
  recencyWeight: number;
  // Deal stage multipliers
  dealStageProspecting: number;
  dealStageQualifying: number;
  dealStageProposal: number;
  dealStageNegotiation: number;
  dealStageClosedWon: number;
  updatedAt: string;
}

// ─── CIQ Engine Types (Full Scoring Engine) ───────────────────────────────────

export interface CiqScoreBreakdown {
  value: number;
  weight: number;
  contribution: number;
  label: string;
}

/** Returned by GET /workspaces/:id/ciq/feature-ranking */
export interface FeatureRankingItem {
  feedbackId: string;
  title: string;
  ciqScore: number;
  impactScore: number | null;
  voteCount: number;
  sentiment: number | null;
  customerName: string | null;
  customerArr: number;
  themeCount: number;
  breakdown: Record<string, CiqScoreBreakdown>;
}

/** Returned by GET /workspaces/:id/ciq/theme-ranking */
export interface ThemeRankingItem {
  themeId: string;
  title: string;
  status: string;
  ciqScore: number;
  priorityScore: number | null;
  revenueInfluence: number;
  feedbackCount: number;
  uniqueCustomerCount: number;
  dealInfluenceValue: number;
  voiceSignalScore: number;
  surveySignalScore: number;
  supportSignalScore: number;
  lastScoredAt: string | null;
  breakdown: Record<string, CiqScoreBreakdown>;
}

/** Returned by GET /workspaces/:id/ciq/customer-ranking */
export interface CustomerRankingItem {
  customerId: string;
  name: string;
  companyName: string | null;
  segment: string | null;
  arrValue: number;
  ciqScore: number;
  ciqInfluenceScore: number;
  featureDemandScore: number;
  supportIntensityScore: number;
  healthScore: number;
  dealCount: number;
  feedbackCount: number;
  churnRisk: number;
  breakdown: Record<string, CiqScoreBreakdown>;
}

export interface StrategicSignal {
  type: 'theme' | 'feedback' | 'deal' | 'customer' | 'voice' | 'survey' | 'support';
  entityId: string;
  entityTitle: string;
  signal: string;
  strength: number;
  detail: string;
  detectedAt: string;
}

/** Returned by GET /workspaces/:id/ciq/strategic-signals */
export interface StrategicSignalsOutput {
  topThemes: Array<{
    themeId: string;
    title: string;
    ciqScore: number;
    roadmapLinked: boolean;
  }>;
  roadmapRecommendations: Array<{
    themeId: string;
    title: string;
    ciqScore: number;
    currentStatus: string | null;
    recommendation: 'promote_to_planned' | 'promote_to_committed' | 'already_committed' | 'monitor';
    rationale: string;
  }>;
  signals: StrategicSignal[];
  voiceSentimentSummary: {
    avgSentiment: number;
    urgentCount: number;
    complaintCount: number;
  };
  surveyDemandSummary: {
    avgCiqWeight: number;
    validationCount: number;
    featureValidationCount: number;
  };
  supportSpikeSummary: {
    spikeCount: number;
    negativeSentimentCount: number;
  };
}

// ─── Prioritization Engine (4-Dimension) ──────────────────────────────────────

export interface PrioritizationDimensionScore {
  raw: number;
  normalised: number;
  weight: number;
  contribution: number;
  label: string;
  factors: Record<string, number>;
}

export interface PrioritizationScoreBreakdown {
  demandStrength:       PrioritizationDimensionScore;
  revenueImpact:        PrioritizationDimensionScore;
  strategicImportance:  PrioritizationDimensionScore;
  urgencySignal:        PrioritizationDimensionScore;
}

export interface FeaturePriorityItem {
  feedbackId:              string;
  title:                   string;
  featurePriorityRank:     number;
  priorityScore:           number;
  urgencyScore:            number;
  revenueOpportunityScore: number;
  voteCount:               number;
  voteVelocity:            number;
  sentiment:               number | null;
  customerName:            string | null;
  customerArr:             number;
  themeCount:              number;
  breakdown:               PrioritizationScoreBreakdown;
}

export interface ThemePriorityItem {
  themeId:                 string;
  title:                   string;
  status:                  string;
  themePriorityRank:       number;
  priorityScore:           number;
  revenueScore:            number;
  urgencyScore:            number;
  revenueOpportunityScore: number;
  feedbackCount:           number;
  uniqueCustomerCount:     number;
  revenueInfluence:        number;
  dealInfluenceValue:      number;
  strategicTag:            string | null;
  manualOverrideScore:     number | null;
  hasManualOverride:       boolean;
  lastScoredAt:            string | null;
  breakdown:               PrioritizationScoreBreakdown;
}

export type RoadmapRecommendationType =
  | 'promote_to_committed'
  | 'promote_to_planned'
  | 'keep_current'
  | 'deprioritise'
  | 'already_shipped';

export interface RoadmapRecommendationItem {
  roadmapItemId:              string;
  title:                      string;
  status:                     string;
  themeId:                    string | null;
  themeTitle:                 string | null;
  roadmapRecommendationScore: number;
  urgencyScore:               number;
  revenueOpportunityScore:    number;
  priorityScore:              number;
  recommendation:             RoadmapRecommendationType;
  rationale:                  string;
  breakdown:                  PrioritizationScoreBreakdown;
}

export interface PrioritizationOpportunity {
  type:                    'theme' | 'feature' | 'roadmap';
  entityId:                string;
  title:                   string;
  opportunityScore:        number;
  revenueOpportunityScore: number;
  urgencyScore:            number;
  reason:                  string;
  arrAtRisk:               number;
  dealCount:               number;
}

export interface FeaturePriorityResponse {
  data:        FeaturePriorityItem[];
  total:       number;
  computedAt:  string;
  cached:      boolean;
}

export interface OpportunitiesResponse {
  data:        PrioritizationOpportunity[];
  total:       number;
  computedAt:  string;
  cached:      boolean;
}

export interface RoadmapRecommendationsResponse {
  data:        RoadmapRecommendationItem[];
  total:       number;
  computedAt:  string;
  cached:      boolean;
}

// ─── Executive Dashboard Intelligence Types ───────────────────────────────────

export interface ProductDirectionFeature {
  feedbackId:        string;
  title:             string;
  ciqScore:          number;
  confidenceScore:   number;
  revenueInfluence:  number;
  voteCount:         number;
  themeTitle:        string | null;
  rationale:         string;
}

export interface ProductDirectionSummary {
  topFeatures:         ProductDirectionFeature[];
  totalFeedbackCount:  number;
  scoredFeedbackCount: number;
  lastComputedAt:      string;
}

export interface EmergingThemeItem {
  themeId:          string;
  title:            string;
  velocityScore:    number;
  feedbackDelta7d:  number;
  feedbackDelta30d: number;
  totalFeedback:    number;
  isNew:            boolean;
  urgencyScore:     number;
  signal:           string;
}

export interface DashboardSpikeEvent {
  clusterId:    string;
  clusterTitle: string;
  ticketCount:  number;
  zScore:       number;
  windowStart:  string;
}

export interface EmergingThemeRadar {
  emergingThemes:    EmergingThemeItem[];
  spikeEvents:       DashboardSpikeEvent[];
  totalActiveThemes: number;
}

export interface AtRiskCustomer {
  customerId:        string;
  name:              string;
  arrValue:          number;
  churnRisk:         number;
  topFeatureRequest: string | null;
  accountPriority:   string;
  signalCount:       number;
}

export interface ChurnLinkedFeature {
  feedbackId:      string;
  title:           string;
  churnLinkedArr:  number;
  customerCount:   number;
  urgencySignal:   number;
}

export interface RevenueRiskIndicator {
  totalArrAtRisk:        number;
  criticalCustomers:     AtRiskCustomer[];
  featuresLinkedToChurn: ChurnLinkedFeature[];
  arrExposureBySegment:  { segment: string; arrAtRisk: number; customerCount: number }[];
  totalCustomersAtRisk:  number;
}

export interface SentimentTheme {
  themeId:          string;
  title:            string;
  avgSentiment:     number;
  negativeFraction: number;
  feedbackCount:    number;
}

export interface NegativeSignal {
  feedbackId:   string;
  title:        string;
  sentiment:    number;
  urgency:      number;
  customerName: string | null;
  createdAt:    string;
}

export interface VoiceSentimentSignal {
  overallSentimentScore:  number;
  sentimentTrend:         'improving' | 'declining' | 'stable';
  negativeTrendIndicator: boolean;
  unresolvedPainSummary:  string;
  sentimentByTheme:       SentimentTheme[];
  recentNegativeSignals:  NegativeSignal[];
  voiceCallCount:         number;
  negativeFraction:       number;
}

export interface SupportPressureCluster {
  clusterId:   string;
  title:       string;
  ticketCount: number;
  arrExposure: number;
  themeTitle:  string | null;
  isSpike:     boolean;
}

export interface SupportPressureIndicator {
  openTicketCount:     number;
  ticketTrend:         'increasing' | 'stable' | 'decreasing';
  ticketDelta7d:       number;
  activeSpikeCount:    number;
  topPressureClusters: SupportPressureCluster[];
  estimatedArrAtRisk:  number;
}

export interface DelayedRoadmapItem {
  roadmapItemId:  string;
  title:          string;
  status:         string;
  themeTitle:     string | null;
  priorityScore:  number;
  daysInStatus:   number;
  recommendation: string;
}

export interface OpportunityGap {
  themeId:        string;
  title:          string;
  priorityScore:  number;
  revenueScore:   number;
  hasRoadmapItem: boolean;
  gap:            string;
}

export interface RoadmapHealthPanel {
  shippedCount:         number;
  plannedCount:         number;
  committedCount:       number;
  backlogCount:         number;
  shippedRatio:         number;
  delayedCriticalItems: DelayedRoadmapItem[];
  opportunityGaps:      OpportunityGap[];
  healthScore:          number;
  healthLabel:          'healthy' | 'at_risk' | 'critical';
}

export interface ExecutiveSummary {
  generatedAt:          string;
  weekSummary:          string;
  keyInsights:          string[];
  topAction:            string;
  riskAlert:            string | null;
  momentumSignal:       string;
  productDirectionNote: string;
}

export interface ExecutiveDashboard {
  productDirection:  ProductDirectionSummary;
  emergingThemes:    EmergingThemeRadar;
  revenueRisk:       RevenueRiskIndicator;
  voiceSentiment:    VoiceSentimentSignal;
  supportPressure:   SupportPressureIndicator;
  roadmapHealth:     RoadmapHealthPanel;
  executiveSummary:  ExecutiveSummary;
  refreshedAt:       string;
  cached:            boolean;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export interface ThemeTrendPoint {
  themeId: string;
  title: string;
  feedbackCount: number;
  ciqScore: number | null;
  revenueScore: number | null;
  urgencyScore: number | null;
  priorityScore: number | null;
  createdAt: string;
}

export interface ThemeTrendsReport {
  themes: ThemeTrendPoint[];
  totalActiveThemes: number;
  generatedAt: string;
}

export interface PriorityBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  avgCiqScore: number;
  totalFeedback: number;
}

export interface PriorityDistributionReport {
  buckets: PriorityBucket[];
  totalScored: number;
  totalUnscored: number;
  avgCiqScore: number;
  generatedAt: string;
}

export interface RevenueImpactTheme {
  themeId: string;
  title: string;
  revenueInfluence: number;
  revenueScore: number | null;
  ciqScore: number | null;
  feedbackCount: number;
  customerCount: number;
  dealCount: number;
  totalDealValue: number;
}

export interface RevenueImpactReport {
  topThemes: RevenueImpactTheme[];
  totalArrInfluenced: number;
  totalDealValue: number;
  generatedAt: string;
}

export interface RoadmapProgressBucket {
  status: string;
  count: number;
  avgPriorityScore: number | null;
  avgRevenueImpact: number | null;
  totalSignalCount: number;
}

export interface RoadmapProgressReport {
  byStatus: RoadmapProgressBucket[];
  totalItems: number;
  shippedCount: number;
  committedCount: number;
  shippedFraction: number;
  generatedAt: string;
}

export interface FeedbackVolumePoint {
  date: string;
  total: number;
  bySource: Record<string, number>;
}

export interface FeedbackVolumeReport {
  series: FeedbackVolumePoint[];
  totalFeedback: number;
  avgPerDay: number;
  topSource: string | null;
  generatedAt: string;
}

// ── Billing: Invoice ──────────────────────────────────────────────────────────

export interface InvoiceRecord {
  id: string;
  workspaceId: string;
  stripeInvoiceId: string;
  stripeSubscriptionId: string | null;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Semantic Search ───────────────────────────────────────────────────────────

/** A single feedback item returned by the semantic search endpoint. */
export interface SemanticSearchResult {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string;
  sentiment: number | null;
  createdAt: string;
  /** Cosine similarity score in [0, 1] — higher is more relevant. */
  similarity: number;
}

/** Response envelope from GET /feedback/semantic-search */
export interface SemanticSearchResponse {
  data: SemanticSearchResult[];
  query: string;
  model: string;
}

// ── Promote to Roadmap ────────────────────────────────────────────────────────

/** Response from GET /roadmap/from-theme/:themeId/preview */
export interface PromoteThemePreview {
  suggestedTitle: string;
  suggestedDescription?: string | null;
  aiSummary?: string | null;
  aiExplanation?: string | null;
  aiRecommendation?: string | null;
  aiConfidence?: number | null;
  feedbackCount: number;
  topFeedback: Array<{
    id: string;
    title: string;
    sentiment?: number | null;
    sourceType?: string | null;
  }>;
  alreadyPromoted: boolean;
  existingRoadmapItemId: string | null;
}

/** Body accepted by POST /roadmap/from-theme/:themeId */
export interface PromoteThemeDto {
  title?: string;
  description?: string;
  status?: RoadmapStatus;
}
