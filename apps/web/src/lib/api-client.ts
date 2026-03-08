/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralized API client using Axios.
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  AddFeedbackToThemeDto,
  ApiError,
  CreateFeedbackDto,
  CreateRoadmapItemDto,
  CreateThemeDto,
  Feedback,
  FeedbackListResponse,
  LoginRequest,
  LoginResponse,
  RoadmapItem,
  RoadmapListResponse,
  Theme,
  ThemeListResponse,
  UpdateFeedbackDto,
  UpdateRoadmapItemDto,
  UpdateThemeDto,
  UpdateWorkspaceDto,
  User,
  Workspace,
  WorkspaceMember,
} from '@/lib/api-types';

const getApiBaseUrl = () => {
  // Use NEXT_PUBLIC_API_URL if available, otherwise default to local dev
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
};

const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- API Client Methods ---

const apiClient = {
  // Auth
  login: (data: LoginRequest): Promise<LoginResponse> => api.post('/auth/login', data).then(res => res.data),
  getMe: (): Promise<User> => api.get('/auth/me').then(res => res.data),

  // Workspace
  getCurrentWorkspace: (): Promise<Workspace> => api.get('/workspace/current').then(res => res.data),
  updateCurrentWorkspace: (data: UpdateWorkspaceDto): Promise<Workspace> => api.patch('/workspace/current', data).then(res => res.data),
  getWorkspaceMembers: (workspaceId: string): Promise<WorkspaceMember[]> => api.get(`/workspace/${workspaceId}/members`).then(res => res.data),

  // Feedback
  getFeedbackList: (workspaceId: string, params?: any): Promise<FeedbackListResponse> => api.get(`/workspaces/${workspaceId}/feedback`, { params }).then(res => res.data),
  getFeedbackById: (workspaceId: string, feedbackId: string): Promise<Feedback> => api.get(`/workspaces/${workspaceId}/feedback/${feedbackId}`).then(res => res.data),
  createFeedback: (workspaceId: string, data: CreateFeedbackDto): Promise<Feedback> => api.post(`/workspaces/${workspaceId}/feedback`, data).then(res => res.data),
  updateFeedback: (workspaceId: string, feedbackId: string, data: UpdateFeedbackDto): Promise<Feedback> => api.patch(`/workspaces/${workspaceId}/feedback/${feedbackId}`, data).then(res => res.data),

  // Themes
  getThemeList: (workspaceId: string, params?: any): Promise<ThemeListResponse> => api.get(`/workspaces/${workspaceId}/themes`, { params }).then(res => res.data),
  getThemeById: (workspaceId: string, themeId: string): Promise<Theme> => api.get(`/workspaces/${workspaceId}/themes/${themeId}`).then(res => res.data),
  createTheme: (workspaceId: string, data: CreateThemeDto): Promise<Theme> => api.post(`/workspaces/${workspaceId}/themes`, data).then(res => res.data),
  updateTheme: (workspaceId: string, themeId: string, data: UpdateThemeDto): Promise<Theme> => api.patch(`/workspaces/${workspaceId}/themes/${themeId}`, data).then(res => res.data),
  addFeedbackToTheme: (workspaceId: string, themeId: string, data: AddFeedbackToThemeDto): Promise<void> => api.post(`/workspaces/${workspaceId}/themes/${themeId}/feedback`, data).then(res => res.data),

  // Roadmap
  getRoadmap: (workspaceId: string): Promise<RoadmapListResponse> => api.get(`/workspaces/${workspaceId}/roadmap`).then(res => res.data),
  createRoadmapItem: (workspaceId: string, data: CreateRoadmapItemDto): Promise<RoadmapItem> => api.post(`/workspaces/${workspaceId}/roadmap`, data).then(res => res.data),
  updateRoadmapItem: (workspaceId: string, itemId: string, data: UpdateRoadmapItemDto): Promise<RoadmapItem> => api.patch(`/workspaces/${workspaceId}/roadmap/${itemId}`, data).then(res => res.data),
  createRoadmapItemFromTheme: (workspaceId: string, themeId: string): Promise<RoadmapItem> => api.post(`/workspaces/${workspaceId}/roadmap/from-theme/${themeId}`).then(res => res.data),
  
  // Feature Flags (dummy implementation)
  getFeatureFlag: (flagName: string): Promise<{ enabled: boolean }> => {
    console.log(`Checking feature flag: ${flagName}`);
    // In a real app, this would call a feature flag service like LaunchDarkly
    const flags: Record<string, boolean> = {
      'new-dashboard': true,
      'voice-feedback': false,
    };
    return Promise.resolve({ enabled: flags[flagName] || false });
  },
};

export default apiClient;

// Type guard for API errors
export function isApiError(error: unknown): error is AxiosResponse<ApiError> {
  return axios.isAxiosError(error) && error.response?.data?.statusCode !== undefined;
}
