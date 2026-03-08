/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * This file contains all the TypeScript types for the API client.
 * It is based on the Prisma schema and the NestJS DTOs.
 */

// --- Enums ---

export enum Role {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
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
}

export enum RoadmapStatus {
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
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  role: Role;
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
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  feedbackCount: number;
  customerCount: number;
  priorityScore: number;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  targetQuarter: string;
  targetYear: number;
  feedbackCount: number;
  customerCount: number;
  totalArr: number;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
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
export interface LoginRequest extends Pick<User, 'email'> {
  password: string;
}
export interface LoginResponse {
  accessToken: string;
}

// Feedback
export type FeedbackListResponse = PaginatedResponse<Feedback>;
export interface CreateFeedbackDto extends Pick<Feedback, 'title' | 'description' | 'sourceType' | 'customerId'> {}
export interface UpdateFeedbackDto extends Partial<Pick<Feedback, 'title' | 'description' | 'status'>> {}

// Themes
export type ThemeListResponse = PaginatedResponse<Theme>;
export interface CreateThemeDto extends Pick<Theme, 'name' | 'description'> {}
export interface UpdateThemeDto extends Partial<Pick<Theme, 'name' | 'description'>> {}
export interface AddFeedbackToThemeDto {
  feedbackIds: string[];
}

// Roadmap
export type RoadmapListResponse = RoadmapItem[];
export interface CreateRoadmapItemDto extends Pick<RoadmapItem, 'title' | 'description' | 'targetQuarter' | 'targetYear'> {}
export interface UpdateRoadmapItemDto extends Partial<CreateRoadmapItemDto & { status: RoadmapStatus }> {}

// Workspace
export interface UpdateWorkspaceDto extends Partial<Pick<Workspace, 'name' | 'description'>> {}

// A generic type for API errors
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
