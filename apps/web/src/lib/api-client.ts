import { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import axios from "axios";
import {
  ApiError,
  CreateFeedbackDto,
  CreateRoadmapItemDto,
  CreateThemeDto,
  Feedback,
  FeedbackComment,
  FeedbackListResponse,
  LoginRequest,
  LoginResponse,
  MoveFeedbackDto,
  PublicFeedbackDto,
  RoadmapItem,
  RoadmapListResponse,
  SignUpDto,
  SupportTicketListResponse,
  Theme,
  ThemeListResponse,
  UpdateFeedbackDto,
  UpdateRoadmapItemDto,
  UpdateThemeDto,
  UpdateWorkspaceDto,
  User,
  Workspace,
  WorkspaceMember,
} from "@/lib/api-types";

const getApiBaseUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";
};

const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const handleResponse = <T>(response: AxiosResponse<T>) => response.data;

const apiClient = {
  auth: {
    signUp: (data: SignUpDto): Promise<LoginResponse> =>
      api.post("/auth/signup", data).then(handleResponse),
    login: (data: LoginRequest): Promise<LoginResponse> =>
      api.post("/auth/login", data).then(handleResponse),
    logout: (): Promise<void> => api.post("/auth/logout").then(handleResponse),
    getMe: (): Promise<User> => api.get("/auth/me").then(handleResponse),
  },

  workspace: {
    getCurrent: (): Promise<Workspace> =>
      api.get("/workspace/current").then(handleResponse),
    updateCurrent: (data: UpdateWorkspaceDto): Promise<Workspace> =>
      api.patch("/workspace/current", data).then(handleResponse),
    getMembers: (workspaceId: string): Promise<WorkspaceMember[]> =>
      api.get(`/workspace/${workspaceId}/members`).then(handleResponse),
  },

  feedback: {
    list: (
      workspaceId: string,
      params?: any
    ): Promise<FeedbackListResponse> =>
      api
        .get(`/workspaces/${workspaceId}/feedback`, { params })
        .then(handleResponse),
    getById: (workspaceId: string, feedbackId: string): Promise<Feedback> =>
      api
        .get(`/workspaces/${workspaceId}/feedback/${feedbackId}`)
        .then(handleResponse),
    create: (workspaceId: string, data: CreateFeedbackDto): Promise<Feedback> =>
      api.post(`/workspaces/${workspaceId}/feedback`, data).then(handleResponse),
    update: (
      workspaceId: string,
      feedbackId: string,
      data: UpdateFeedbackDto
    ): Promise<Feedback> =>
      api
        .patch(`/workspaces/${workspaceId}/feedback/${feedbackId}`, data)
        .then(handleResponse),
    addComment: (
      workspaceId: string,
      feedbackId: string,
      data: { content: string }
    ): Promise<FeedbackComment> =>
      api
        .post(`/workspaces/${workspaceId}/feedback/${feedbackId}/comments`, data)
        .then(handleResponse),
  },

  themes: {
    list: (workspaceId: string, params?: any): Promise<ThemeListResponse> =>
      api.get(`/workspaces/${workspaceId}/themes`, { params }).then(handleResponse),
    getById: (workspaceId: string, themeId: string): Promise<Theme> =>
      api.get(`/workspaces/${workspaceId}/themes/${themeId}`).then(handleResponse),
    create: (workspaceId: string, data: CreateThemeDto): Promise<Theme> =>
      api.post(`/workspaces/${workspaceId}/themes`, data).then(handleResponse),
    update: (workspaceId: string, themeId: string, data: UpdateThemeDto): Promise<Theme> =>
      api.patch(`/workspaces/${workspaceId}/themes/${themeId}`, data).then(handleResponse),
    moveFeedback: (workspaceId: string, data: MoveFeedbackDto): Promise<void> =>
      api.post(`/workspaces/${workspaceId}/themes/feedback`, data).then(handleResponse),
  },

  roadmap: {
    list: (workspaceId: string): Promise<RoadmapListResponse> =>
      api.get(`/workspaces/${workspaceId}/roadmap`).then(handleResponse),
    create: (workspaceId: string, data: CreateRoadmapItemDto): Promise<RoadmapItem> =>
      api.post(`/workspaces/${workspaceId}/roadmap`, data).then(handleResponse),
    update: (
      workspaceId: string,
      itemId: string,
      data: UpdateRoadmapItemDto
    ): Promise<RoadmapItem> =>
      api.patch(`/workspaces/${workspaceId}/roadmap/${itemId}`, data).then(handleResponse),
    createFromTheme: (workspaceId: string, themeId: string): Promise<RoadmapItem> =>
      api
        .post(`/workspaces/${workspaceId}/roadmap/from-theme/${themeId}`)
        .then(handleResponse),
  },

  support: {
    listTickets: (
      workspaceId: string,
      params?: any
    ): Promise<SupportTicketListResponse> =>
      api
        .get(`/workspaces/${workspaceId}/support/tickets`, { params })
        .then(handleResponse),
  },

  public: {
    submitFeedback: (
      workspaceSlug: string,
      data: PublicFeedbackDto
    ): Promise<Feedback> =>
      api.post(`/public/feedback/${workspaceSlug}`, data).then(handleResponse),
  },
};

export default apiClient;

export function isApiError(
  error: unknown
): error is AxiosError<ApiError> {
  return axios.isAxiosError(error) && !!error.response?.data?.statusCode;
}
