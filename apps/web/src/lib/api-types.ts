/* eslint-disable @typescript-eslint/no-explicit-any */
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
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
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
  billingPlan: BillingPlan;
  billingStatus: BillingStatus;
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
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Feedback {
  id: string;
  workspaceId: string;
  customerId?: string | null;
  /** PortalUser FK — set for PUBLIC_PORTAL submissions */
  portalUserId?: string | null;
  sourceType: FeedbackSourceType;
  sourceRef?: string | null;
  title: string;
  description: string;
  /** Original unmodified text before normalization */
  rawText?: string | null;
  normalizedText?: string | null;
  language?: string | null;
  summary?: string | null;
  status: FeedbackStatus;
  sentiment?: number | null;
  impactScore?: number | null;
  /** Arbitrary source metadata (Slack channel, CSV row, etc.) */
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  mergedIntoId?: string | null;
  /** Included by findAll and findOne (include: { attachments: true }) */
  attachments?: FeedbackAttachment[];
  /**
   * Workspace-scoped comments — not yet returned by the backend.
   * Field is reserved for when the backend adds the route.
   */
  comments?: FeedbackComment[];
}

export interface Theme {
  id: string;
  title: string;
  description?: string;
  status: ThemeStatus;
  pinned: boolean;
  feedbackCount: number;
  customerCount: number;
  totalArr: number;
  totalDealValue: number;
  priorityScore: number;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  status: RoadmapStatus;
  isPublic: boolean;
  targetQuarter?: string;
  targetYear?: number;
  feedbackCount: number;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalUser {
  id: string;
  workspaceId: string;
  customerId?: string;
  email: string;
  verified: boolean;
  createdAt: string;
}

export interface FeedbackVote {
  id: string;
  feedbackId: string;
  portalUserId?: string;
  userId?: string;
  createdAt: string;
}

export interface FeedbackComment {
  id: string;
  feedbackId: string;
  portalUserId?: string;
  userId?: string;
  body: string;
  createdAt: string;
  author?: { firstName: string; lastName: string };
}

// --- API Payloads & Responses ---

// Generic Paginated Response
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Auth
export interface SignUpDto {
  firstName: string;
  lastName: string;
  /** Human-readable organization name. Derives the workspace slug. */
  organizationName: string;
  email: string;
  password: string;
}

export interface InviteMemberDto {
  email: string;
  role: WorkspaceRole;
  /** Pre-filled first name for the invitee */
  firstName?: string;
  /** Pre-filled last name for the invitee */
  lastName?: string;
  /** Job title / position for the invitee */
  position?: string;
}

/** Shape returned by GET /auth/invite?token=... */
export interface InviteInfo {
  email: string;
  role: WorkspaceRole;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  workspaceName: string;
  workspaceSlug: string;
}

export interface LoginRequest extends Pick<User, 'email'> {
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// Feedback
/**
 * Backend returns flat pagination: { data, total, page, limit }
 * NOT wrapped in a `meta` object like PaginatedResponse.
 */
export interface FeedbackListResponse {
  data: Feedback[];
  total: number;
  page: number;
  limit: number;
}
export interface CreateFeedbackDto {
  title: string;
  description?: string;
  sourceType: FeedbackSourceType;
  customerId?: string;
}
export interface UpdateFeedbackDto {
  title?: string;
  description?: string;
  status?: FeedbackStatus;
  customerId?: string;
}
export interface PublicFeedbackDto {
  title: string;
  description?: string;
  submitterEmail?: string;
  email?: string;
}

// Themes
export type ThemeListResponse = PaginatedResponse<Theme>;
export interface CreateThemeDto extends Pick<Theme, 'title' | 'description'> {
  feedbackIds?: string[];
}
export interface UpdateThemeDto extends Partial<Pick<Theme, 'title' | 'description' | 'status' | 'pinned'>> {}
export interface MoveFeedbackDto {
  feedbackIds: string[];
  sourceThemeId?: string;
  targetThemeId?: string;
}

// Roadmap
export type RoadmapListResponse = RoadmapItem[];
export interface CreateRoadmapItemDto extends Pick<RoadmapItem, 'title' | 'description' | 'targetQuarter' | 'targetYear'> { isPublic?: boolean; status?: RoadmapStatus; }
export interface UpdateRoadmapItemDto extends Partial<CreateRoadmapItemDto & { status: RoadmapStatus }> {}

// Workspace
export interface UpdateWorkspaceDto extends Partial<Pick<Workspace, 'name' | 'description'>> {}

// Support
export interface SupportTicket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  source: string;
}
export type SupportTicketListResponse = PaginatedResponse<SupportTicket>;

// Public Portal

/** A single feedback item as returned by the public portal list endpoint */
export interface PublicFeedbackItem {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  voteCount: number;
  commentCount: number;
  createdAt: string;
}

/** A single comment as returned by the public portal detail endpoint */
export interface PublicComment {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

/** Full detail response for a single public feedback item */
export interface PublicFeedbackDetail {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  voteCount: number;
  createdAt: string;
  comments: PublicComment[];
}

export interface PublicFeedbackListResponse {
  data: PublicFeedbackItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** A single public roadmap item */
export interface PublicRoadmapItem {
  id: string;
  title: string;
  description?: string;
  status: RoadmapStatus;
  targetQuarter?: string;
  targetYear?: number;
  customerCount?: number;
  createdAt: string;
}

export interface PublicRoadmapResponse {
  data: PublicRoadmapItem[];
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

/** DTO for POST /portal/:orgSlug/feedback */
export interface PortalCreateFeedbackDto {
  title: string;
  description?: string;
  email?: string;
  name?: string;
  anonymousId?: string;
}

/** Response from POST /portal/:orgSlug/feedback */
export interface PortalCreateFeedbackResponse {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string;
  createdAt: string;
  portalUserId: string | null;
}

// A generic type for API errors
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
