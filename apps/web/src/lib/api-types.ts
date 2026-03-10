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
  user: User;
  joinedAt: string;
}

export interface Feedback {
  id: string;
  title: string;
  description: string;
  summary?: string;
  status: FeedbackStatus;
  sourceType: FeedbackSourceType;
  customerId?: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  mergedIntoId?: string;
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
export interface SignUpDto extends Pick<User, 'email' | 'firstName' | 'lastName'> {
  password: string;
}

export interface LoginRequest extends Pick<User, 'email'> {
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// Feedback
export type FeedbackListResponse = PaginatedResponse<Feedback>;
export interface CreateFeedbackDto extends Pick<Feedback, 'title' | 'sourceType' | 'customerId'> { description?: string; }
export interface UpdateFeedbackDto extends Partial<Pick<Feedback, 'title' | 'description' | 'status' | 'customerId'>> {}
export interface PublicFeedbackDto extends Pick<Feedback, 'title' | 'description'> {
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

// A generic type for API errors
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
