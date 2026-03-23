import { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import axios from "axios";
import { getAccessToken, getRefreshToken, setAccessToken, clearTokens } from "@/lib/token-storage";
import {
  ApiError,
  BillingStatusResponse,
  ConnectIntercomDto,
  ConnectSlackDto,
  ConnectZendeskDto,
  CreateFeedbackDto,
  CreateRoadmapItemDto,
  CreateThemeDto,
  DuplicateSuggestion,
  ThemeLinkedFeedbackResponse,
  ThemeReclusterResponse,
  DuplicateSuggestionStatus,
  Feedback,
  FeedbackComment,
  FeedbackListResponse,
  IntegrationStatus,
  InviteMemberDto,
  UpdateBillingEmailDto,
  PlanConfig,
  RequestPlanChangeDto,
  RequestPlanChangeResponse,
  InviteInfo,
  LoginRequest,
  LoginResponse,
  MoveFeedbackDto,
  PortalCreateFeedbackDto,
  PortalCreateFeedbackResponse,
  PublicCommentDto,
  PublicFeedbackDetail,
  PublicFeedbackDto,
  PublicFeedbackListResponse,
  PublicRoadmapResponse,
  PublicVoteDto,
  PublicVoteResponse,
  RoadmapBoardResponse,
  RoadmapItem,
  RoadmapItemDetail,
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
  DomainSettings,
  SetDomainDto,
  WorkspaceLimitSummary,
  CiqScoreOutput,
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
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
    logout: (data: { refreshToken: string }): Promise<void> =>
      api.post("/auth/logout", data).then(handleResponse),
    refresh: (data: { refreshToken: string }): Promise<LoginResponse> =>
      api.post("/auth/refresh", data).then(handleResponse),
    getMe: (): Promise<User> => api.get("/auth/me").then(handleResponse),
    updateProfile: (data: { firstName?: string; lastName?: string }): Promise<User> =>
      api.patch("/auth/me", data).then(handleResponse),
    changePassword: (data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> =>
      api.patch("/auth/me/password", data).then(handleResponse),
    getInviteInfo: (token: string): Promise<InviteInfo> =>
      api.get("/auth/invite", { params: { token } }).then(handleResponse),
    setupPassword: (data: { token: string; password: string }): Promise<LoginResponse> =>
      api.post("/auth/setup-password", data).then(handleResponse),
    portalSignUp: (
      workspaceSlug: string,
      data: { email: string; name?: string; password: string },
    ): Promise<{ portalUser: { id: string; email: string; name: string | null }; accessToken: string }> =>
      api.post(`/auth/portal/${workspaceSlug}/signup`, data).then(handleResponse),
    portalLogin: (
      workspaceSlug: string,
      data: { email: string; password: string },
    ): Promise<{ portalUser: { id: string; email: string; name: string | null }; accessToken: string }> =>
      api.post(`/auth/portal/${workspaceSlug}/login`, data).then(handleResponse),
  },

  workspace: {
    getCurrent: (): Promise<Workspace> =>
      api.get("/workspace/current").then(handleResponse),
    updateCurrent: (data: UpdateWorkspaceDto): Promise<Workspace> =>
      api.patch("/workspace/current", data).then(handleResponse),
    getMembers: (workspaceId: string): Promise<WorkspaceMember[]> =>
      api.get(`/workspace/${workspaceId}/members`).then(handleResponse),
    inviteMember: (data: InviteMemberDto): Promise<{ inviteToken: string; email: string; role: string; expiresAt: string }> =>
      api.post("/workspace/current/invite", data).then(handleResponse),
    getPendingInvites: (): Promise<Array<{ id: string; email: string; role: string; expiresAt: string; createdAt: string }>> =>
      api.get("/workspace/current/invites").then(handleResponse),
    revokeInvite: (inviteId: string): Promise<{ message: string }> =>
      api.delete(`/workspace/current/invites/${inviteId}`).then(handleResponse),
    removeMember: (userId: string): Promise<{ message: string }> =>
      api.delete(`/workspace/current/members/${userId}`).then(handleResponse),
    updateMemberRole: (userId: string, role: string): Promise<WorkspaceMember> =>
      api.patch(`/workspace/current/members/${userId}/role`, { role }).then(handleResponse),
    getLimits: (): Promise<WorkspaceLimitSummary> =>
      api.get('/workspace/current/limits').then(handleResponse),
  },

  feedback: {
    list: (
      workspaceId: string,
      params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        sourceType?: string;
        customerId?: string;
      }
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
    remove: (workspaceId: string, feedbackId: string): Promise<void> =>
      api
        .delete(`/workspaces/${workspaceId}/feedback/${feedbackId}`)
        .then(handleResponse),
    /**
     * NOTE: The workspace feedback controller does not expose a comments
     * endpoint. Comments on workspace feedback are an internal-only feature
     * that has not yet been implemented in the backend. This method is kept
     * as a typed stub so callers compile; it will 404 until the backend
     * adds the route.
     */
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
    /** GET /workspaces/:id/themes — flat pagination { data, total, page, limit } */
    list: (
      workspaceId: string,
      params?: { page?: number; limit?: number; search?: string; status?: string; pinned?: boolean }
    ): Promise<ThemeListResponse> =>
      api.get(`/workspaces/${workspaceId}/themes`, { params }).then(handleResponse),
    /** GET /workspaces/:id/themes/:themeId — includes linkedFeedback[] and aggregatedPriorityScore */
    getById: (workspaceId: string, themeId: string): Promise<Theme> =>
      api.get(`/workspaces/${workspaceId}/themes/${themeId}`).then(handleResponse),
    /** POST /workspaces/:id/themes */
    create: (workspaceId: string, data: CreateThemeDto): Promise<Theme> =>
      api.post(`/workspaces/${workspaceId}/themes`, data).then(handleResponse),
    /** PATCH /workspaces/:id/themes/:themeId */
    update: (workspaceId: string, themeId: string, data: UpdateThemeDto): Promise<Theme> =>
      api.patch(`/workspaces/${workspaceId}/themes/${themeId}`, data).then(handleResponse),
    /** GET /workspaces/:id/themes/:themeId/feedback — paginated linked feedback */
    listLinkedFeedback: (
      workspaceId: string,
      themeId: string,
      params?: { page?: number; limit?: number }
    ): Promise<ThemeLinkedFeedbackResponse> =>
      api.get(`/workspaces/${workspaceId}/themes/${themeId}/feedback`, { params }).then(handleResponse),
    /** POST /workspaces/:id/themes/:themeId/feedback/:feedbackId — manually link feedback */
    addFeedback: (workspaceId: string, themeId: string, feedbackId: string): Promise<void> =>
      api.post(`/workspaces/${workspaceId}/themes/${themeId}/feedback/${feedbackId}`).then(handleResponse),
    /** DELETE /workspaces/:id/themes/:themeId/feedback/:feedbackId — unlink feedback */
    removeFeedback: (workspaceId: string, themeId: string, feedbackId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/themes/${themeId}/feedback/${feedbackId}`).then(handleResponse),
    /** POST /workspaces/:id/themes/feedback — bulk move feedback between themes */
    moveFeedback: (workspaceId: string, data: MoveFeedbackDto): Promise<void> =>
      api.post(`/workspaces/${workspaceId}/themes/feedback`, data).then(handleResponse),
    /** POST /workspaces/:id/themes/recluster — trigger workspace-wide reclustering job */
    triggerRecluster: (workspaceId: string): Promise<ThemeReclusterResponse> =>
      api.post(`/workspaces/${workspaceId}/themes/recluster`).then(handleResponse),
  },

  roadmap: {
    /** GET /workspaces/:id/roadmap — returns kanban-grouped columns */
    list: (workspaceId: string, params?: { search?: string; isPublic?: boolean }): Promise<RoadmapBoardResponse> =>
      api.get(`/workspaces/${workspaceId}/roadmap`, { params }).then(handleResponse),
    /** GET /workspaces/:id/roadmap/:itemId — full detail with linkedFeedback + signalSummary */
    getById: (workspaceId: string, itemId: string): Promise<RoadmapItemDetail> =>
      api.get(`/workspaces/${workspaceId}/roadmap/${itemId}`).then(handleResponse),
    /** POST /workspaces/:id/roadmap/:itemId/refresh-intelligence — synchronous CIQ rescore */
    refreshIntelligence: (workspaceId: string, itemId: string): Promise<RoadmapItem & { scoreExplanation?: CiqScoreOutput['scoreExplanation'] }> =>
      api.post(`/workspaces/${workspaceId}/roadmap/${itemId}/refresh-intelligence`).then(handleResponse),
    /** GET /workspaces/:id/roadmap/:itemId/ciq-explanation — full CIQ breakdown */
    getCiqExplanation: (workspaceId: string, itemId: string): Promise<CiqScoreOutput> =>
      api.get(`/workspaces/${workspaceId}/roadmap/${itemId}/ciq-explanation`).then(handleResponse),
    /** POST /workspaces/:id/roadmap */
    create: (workspaceId: string, data: CreateRoadmapItemDto): Promise<RoadmapItem> =>
      api.post(`/workspaces/${workspaceId}/roadmap`, data).then(handleResponse),
    /** PATCH /workspaces/:id/roadmap/:itemId */
    update: (
      workspaceId: string,
      itemId: string,
      data: UpdateRoadmapItemDto
    ): Promise<RoadmapItem> =>
      api.patch(`/workspaces/${workspaceId}/roadmap/${itemId}`, data).then(handleResponse),
    /** DELETE /workspaces/:id/roadmap/:itemId */
    remove: (workspaceId: string, itemId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/roadmap/${itemId}`).then(handleResponse),
    /** POST /workspaces/:id/roadmap/from-theme/:themeId */
    createFromTheme: (workspaceId: string, themeId: string): Promise<RoadmapItem> =>
      api
        .post(`/workspaces/${workspaceId}/roadmap/from-theme/${themeId}`)
        .then(handleResponse),
  },

  prioritization: {
    /** GET /workspaces/:id/prioritization/themes — weighted priority list */
    getThemes: (workspaceId: string, params?: { page?: number; limit?: number }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> =>
      api.get(`/workspaces/${workspaceId}/prioritization/themes`, { params }).then(handleResponse),
    /** GET /workspaces/:id/prioritization/themes/:themeId/ciq — real CIQ score */
    getThemeCiq: (workspaceId: string, themeId: string): Promise<CiqScoreOutput> =>
      api.get(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/ciq`).then(handleResponse),
    /** POST /workspaces/:id/prioritization/themes/:themeId/recalculate — force rescore */
    recalculateThemeCiq: (workspaceId: string, themeId: string): Promise<CiqScoreOutput> =>
      api.post(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/recalculate`).then(handleResponse),
    /** GET /workspaces/:id/prioritization/settings */
    getSettings: (workspaceId: string): Promise<unknown> =>
      api.get(`/workspaces/${workspaceId}/prioritization/settings`).then(handleResponse),
    /** PATCH /workspaces/:id/prioritization/settings */
    updateSettings: (workspaceId: string, data: Record<string, number>): Promise<unknown> =>
      api.patch(`/workspaces/${workspaceId}/prioritization/settings`, data).then(handleResponse),
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
    /** Legacy submit endpoint — POST /public/feedback/:workspaceSlug */
    submitFeedback: (
      workspaceSlug: string,
      data: PublicFeedbackDto
    ): Promise<Feedback> =>
      api.post(`/public/feedback/${workspaceSlug}`, data).then(handleResponse),

    /** GET /public/:workspaceSlug/feedback */
    listFeedback: (
      workspaceSlug: string,
      params?: { page?: number; limit?: number; search?: string }
    ): Promise<PublicFeedbackListResponse> =>
      api
        .get(`/public/${workspaceSlug}/feedback`, { params })
        .then(handleResponse),

    /** GET /public/:workspaceSlug/feedback/:id */
    getFeedbackDetail: (
      workspaceSlug: string,
      feedbackId: string
    ): Promise<PublicFeedbackDetail> =>
      api
        .get(`/public/${workspaceSlug}/feedback/${feedbackId}`)
        .then(handleResponse),

    /** GET /public/:workspaceSlug/roadmap */
    listRoadmap: (workspaceSlug: string): Promise<PublicRoadmapResponse> =>
      api.get(`/public/${workspaceSlug}/roadmap`).then(handleResponse),

    /** POST /public/:workspaceSlug/feedback/:id/vote */
    vote: (
      workspaceSlug: string,
      feedbackId: string,
      data: PublicVoteDto
    ): Promise<PublicVoteResponse> =>
      api
        .post(`/public/${workspaceSlug}/feedback/${feedbackId}/vote`, data)
        .then(handleResponse),

    /** POST /public/:workspaceSlug/feedback/:id/comments */
    addComment: (
      workspaceSlug: string,
      feedbackId: string,
      data: PublicCommentDto
    ): Promise<{ id: string; feedbackId: string; body: string; authorName: string | null; createdAt: string }> =>
      api
        .post(`/public/${workspaceSlug}/feedback/${feedbackId}/comments`, data)
        .then(handleResponse),
  },

  portal: {
    /** GET /portal/:orgSlug/feedback */
    listFeedback: (
      orgSlug: string,
      params?: { page?: number; limit?: number; search?: string }
    ): Promise<PublicFeedbackListResponse> =>
      api
        .get(`/portal/${orgSlug}/feedback`, { params })
        .then(handleResponse),

    /** GET /portal/:orgSlug/feedback/:id */
    getFeedbackDetail: (
      orgSlug: string,
      feedbackId: string
    ): Promise<PublicFeedbackDetail> =>
      api
        .get(`/portal/${orgSlug}/feedback/${feedbackId}`)
        .then(handleResponse),

    /** POST /portal/:orgSlug/feedback */
    createFeedback: (
      orgSlug: string,
      data: PortalCreateFeedbackDto
    ): Promise<PortalCreateFeedbackResponse> =>
      api.post(`/portal/${orgSlug}/feedback`, data).then(handleResponse),

    /** GET /portal/:orgSlug/roadmap */
    listRoadmap: (orgSlug: string): Promise<PublicRoadmapResponse> =>
      api.get(`/portal/${orgSlug}/roadmap`).then(handleResponse),

    /** POST /portal/:orgSlug/feedback/:id/vote */
    vote: (
      orgSlug: string,
      feedbackId: string,
      data: PublicVoteDto
    ): Promise<PublicVoteResponse> =>
      api
        .post(`/portal/${orgSlug}/feedback/${feedbackId}/vote`, data)
        .then(handleResponse),

    /** POST /portal/:orgSlug/feedback/:id/comments */
    addComment: (
      orgSlug: string,
      feedbackId: string,
      data: PublicCommentDto
    ): Promise<{ id: string; feedbackId: string; body: string; authorName: string | null; createdAt: string }> =>
      api
        .post(`/portal/${orgSlug}/feedback/${feedbackId}/comments`, data)
        .then(handleResponse),
  },

  integrations: {
    /**
     * GET /workspaces/:id/integrations
     * Returns connection status for every known provider.
     * Accessible to ADMIN, EDITOR, and VIEWER.
     */
    list: (workspaceId: string): Promise<IntegrationStatus[]> =>
      api.get(`/workspaces/${workspaceId}/integrations`).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/zendesk/connect
     */
    connectZendesk: (workspaceId: string, data: ConnectZendeskDto): Promise<IntegrationStatus> =>
      api.post(`/workspaces/${workspaceId}/integrations/zendesk/connect`, data).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/intercom/connect
     */
    connectIntercom: (workspaceId: string, data: ConnectIntercomDto): Promise<IntegrationStatus> =>
      api.post(`/workspaces/${workspaceId}/integrations/intercom/connect`, data).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/slack/connect
     */
    connectSlack: (workspaceId: string, data: ConnectSlackDto): Promise<IntegrationStatus> =>
      api.post(`/workspaces/${workspaceId}/integrations/slack/connect`, data).then(handleResponse),

    /**
     * DELETE /workspaces/:id/integrations/:provider
     * Disconnects (removes) an integration. Returns 204 No Content.
     */
    disconnect: (workspaceId: string, provider: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/integrations/${provider.toLowerCase()}`).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/sync
     * Triggers a background sync job for all connected integrations.
     */
    sync: (workspaceId: string): Promise<{ message: string }> =>
      api.post(`/workspaces/${workspaceId}/integrations/sync`).then(handleResponse),
  },

  duplicates: {
    /**
     * GET /workspaces/:id/duplicate-suggestions
     * List all suggestions for the workspace (default: PENDING).
     */
    listForWorkspace: (
      workspaceId: string,
      status?: DuplicateSuggestionStatus
    ): Promise<DuplicateSuggestion[]> =>
      api
        .get(`/workspaces/${workspaceId}/duplicate-suggestions`, {
          params: status ? { status } : undefined,
        })
        .then(handleResponse),

    /**
     * GET /workspaces/:id/feedback/:feedbackId/duplicate-suggestions
     * List suggestions for a specific feedback item (as source or target).
     */
    listForFeedback: (
      workspaceId: string,
      feedbackId: string,
      status?: DuplicateSuggestionStatus
    ): Promise<DuplicateSuggestion[]> =>
      api
        .get(
          `/workspaces/${workspaceId}/feedback/${feedbackId}/duplicate-suggestions`,
          { params: status ? { status } : undefined }
        )
        .then(handleResponse),

    /**
     * POST /workspaces/:id/duplicate-suggestions/:suggestionId/accept
     * Accept a suggestion — triggers merge of source into target.
     */
    accept: (
      workspaceId: string,
      suggestionId: string
    ): Promise<DuplicateSuggestion> =>
      api
        .post(
          `/workspaces/${workspaceId}/duplicate-suggestions/${suggestionId}/accept`
        )
        .then(handleResponse),

    /**
     * POST /workspaces/:id/duplicate-suggestions/:suggestionId/reject
     * Reject a suggestion — marks it REJECTED, no merge.
     */
    reject: (
      workspaceId: string,
      suggestionId: string
    ): Promise<DuplicateSuggestion> =>
      api
        .post(
          `/workspaces/${workspaceId}/duplicate-suggestions/${suggestionId}/reject`
        )
        .then(handleResponse),
  },

  billing: {
    /**
     * GET /billing/status
     * Returns the full billing snapshot for the calling user's workspace.
     * Accessible to ADMIN, EDITOR, and VIEWER.
     */
    getStatus: (): Promise<BillingStatusResponse> =>
      api.get('/billing/status').then(handleResponse),
    /**
     * PATCH /billing/email
     * Updates the billing contact email. ADMIN only.
     */
    updateEmail: (data: UpdateBillingEmailDto): Promise<{ billingEmail: string | null }> =>
      api.patch('/billing/email', data).then(handleResponse),
    /**
     * GET /billing/plans
     * Returns all active plan config rows for the feature comparison table.
     * Accessible to all authenticated members.
     */
    listPlans: (): Promise<PlanConfig[]> =>
      api.get('/billing/plans').then(handleResponse),
    /**
     * POST /billing/request-plan-change
     * Records a plan-change intent. ADMIN only.
     * MVP: logs the request; Production: creates a Stripe Checkout Session.
     */
    requestPlanChange: (data: RequestPlanChangeDto): Promise<RequestPlanChangeResponse> =>
      api.post('/billing/request-plan-change', data).then(handleResponse),
  },

  domain: {
    /**
     * GET /workspace/current/domain
     * Returns domain settings for the calling user's workspace.
     * Accessible to all authenticated members.
     */
    getSettings: (): Promise<DomainSettings> =>
      api.get('/workspace/current/domain').then(handleResponse),

    /**
     * PUT /workspace/current/domain
     * Sets or replaces the custom domain. ADMIN only.
     * Returns updated DomainSettings with a fresh verification token.
     */
    setDomain: (data: SetDomainDto): Promise<DomainSettings> =>
      api.put('/workspace/current/domain', data).then(handleResponse),

    /**
     * POST /workspace/current/domain/verify
     * Triggers a verification check. ADMIN only.
     */
    verify: (): Promise<DomainSettings> =>
      api.post('/workspace/current/domain/verify').then(handleResponse),

    /**
     * DELETE /workspace/current/domain
     * Removes the custom domain and resets all domain fields. ADMIN only.
     */
    remove: (): Promise<DomainSettings> =>
      api.delete('/workspace/current/domain').then(handleResponse),
  },
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const { accessToken } = await apiClient.auth.refresh({ refreshToken });
          // Update both localStorage and the middleware cookie
          setAccessToken(accessToken);
          axios.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
          originalRequest.headers["Authorization"] = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          console.error("Token refresh failed:", refreshError);
          // Clear both localStorage and the middleware cookie
          clearTokens();
          if (typeof window !== "undefined") {
            const path = window.location.pathname;
            // Match /:orgSlug/app/* and /:orgSlug/admin/* (workspace-scoped protected routes)
            const isProtected =
              /^\/[^/]+\/app(\/|$)/.test(path) ||
              /^\/[^/]+\/admin(\/|$)/.test(path);
            if (isProtected) {
              // Redirect to workspace login if we can extract the slug, else global login
              const slugMatch = path.match(/^\/([^/]+)\//); 
              const slug = slugMatch ? slugMatch[1] : null;
              window.location.href = slug ? `/${slug}/login` : "/login";
            }
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

export function isApiError(
  error: unknown
): error is AxiosError<ApiError> {
  return axios.isAxiosError(error) && !!error.response?.data?.statusCode;
}
