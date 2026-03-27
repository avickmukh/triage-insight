import { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import axios from "axios";
import { getAccessToken, getRefreshToken, setAccessToken, setTokens, clearTokens } from "@/lib/token-storage";
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
  SupportOverview,
  SupportCluster,
  SupportSpike,
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
  Customer,
  CustomerDetail,
  CustomerAnalytics,
  CustomerSignals,
  PaginatedCustomers,
  PaginatedDeals,
  RevenueSummary,
  ThemeRevenueIntelligence,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CreateDealPayload,
  UpdateDealPayload,
  DealDetail,
  VoicePresignedUrlResponse,
  VoiceFinalizeResponse,
  VoiceUploadListResponse,
  VoiceUploadDetail,
  Survey,
  SurveyListResponse,
  SurveyResponseListResponse,
  SurveyIntelligence,
  CreateSurveyPayload,
  AddQuestionPayload,
  SubmitSurveyResponsePayload,
  PrioritizationSettings,
  FeatureRankingItem,
  ThemeRankingItem,
  CustomerRankingItem,
  StrategicSignalsOutput,
  FeaturePriorityResponse,
  OpportunitiesResponse,
  RoadmapRecommendationsResponse,
  ThemePriorityItem,
  ExecutiveDashboard,
  EmergingThemeRadar,
  RevenueRiskIndicator,
  VoiceSentimentSignal,
  SupportPressureIndicator,
  RoadmapHealthPanel,
  ThemeTrendsReport,
  PriorityDistributionReport,
  RevenueImpactReport,
  RoadmapProgressReport,
  FeedbackVolumeReport,
  InvoiceRecord,
  PromoteThemePreview,
  PromoteThemeDto,
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
    forgotPassword: (data: { email: string }): Promise<{ message: string; resetToken?: string }> =>
      api.post("/auth/forgot-password", data).then(handleResponse),
    resetPassword: (data: { token: string; password: string }): Promise<{ message: string }> =>
      api.post("/auth/reset-password", data).then(handleResponse),
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
    getPortalSettings: (): Promise<{
      portalVisibility: string;
      name: string;
      description?: string;
      slug: string;
      portalUrl: string;
      customDomain?: string | null;
    }> =>
      api.get('/workspace/current/portal-settings').then(handleResponse),
    updatePortalSettings: (data: {
      portalVisibility?: string;
      name?: string;
      description?: string;
    }): Promise<{
      portalVisibility: string;
      name: string;
      description?: string;
      slug: string;
      portalUrl: string;
    }> =>
      api.patch('/workspace/current/portal-settings', data).then(handleResponse),
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
    /**
     * POST /workspaces/:id/feedback/import/csv
     * Uploads a .csv file and bulk-imports feedback rows.
     * Requires ADMIN or EDITOR role.
     * Returns { imported, skipped, errors }.
     */
    importCsv: (
      workspaceId: string,
      file: File
    ): Promise<{ imported: number; skipped: number; errors: string[] }> => {
      const form = new FormData();
      form.append('file', file);
      return api
        .post(`/workspaces/${workspaceId}/feedback/import/csv`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(handleResponse);
    },
    /**
     * GET /workspaces/:id/feedback/semantic-search?q=&limit=&threshold=
     * Generates an embedding for `q` and returns the top feedback items
     * ranked by cosine similarity (pgvector).
     */
    semanticSearch: (
      workspaceId: string,
      q: string,
      limit = 10,
      threshold = 0.5
    ): Promise<import('./api-types').SemanticSearchResponse> =>
      api
        .get(`/workspaces/${workspaceId}/feedback/semantic-search`, {
          params: { q, limit, threshold },
        })
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
    /** GET /workspaces/:id/roadmap?flat=true — flat sorted array for the Prioritization Board */
    listFlat: (
      workspaceId: string,
      params?: {
        search?: string;
        sortBy?: 'priorityScore' | 'manualRank' | 'feedbackCount' | 'createdAt' | 'updatedAt';
        sortOrder?: 'asc' | 'desc';
        status?: string[];
      }
    ): Promise<RoadmapItem[]> =>
      api.get(`/workspaces/${workspaceId}/roadmap`, { params: { ...params, flat: true } }).then(handleResponse),
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
    /** GET /workspaces/:id/roadmap/from-theme/:themeId/preview — AI-prefilled suggestion, no side effects */
    previewFromTheme: (workspaceId: string, themeId: string): Promise<PromoteThemePreview> =>
      api.get(`/workspaces/${workspaceId}/roadmap/from-theme/${themeId}/preview`).then(handleResponse),
    /** POST /workspaces/:id/roadmap/from-theme/:themeId — accepts optional override body */
    createFromTheme: (workspaceId: string, themeId: string, override?: PromoteThemeDto): Promise<RoadmapItem> =>
      api
        .post(`/workspaces/${workspaceId}/roadmap/from-theme/${themeId}`, override ?? {})
        .then(handleResponse),
  },

  prioritization: {
    /** GET /workspaces/:id/prioritization/themes — weighted priority list */
    getThemes: (workspaceId: string, params?: { page?: number; limit?: number; sortBy?: string }): Promise<{ data: ThemePriorityItem[]; total: number; page: number; limit: number }> =>
      api.get(`/workspaces/${workspaceId}/prioritization/themes`, { params }).then(handleResponse),
    /** GET /workspaces/:id/prioritization/themes/:themeId/ciq — real CIQ score */
    getThemeCiq: (workspaceId: string, themeId: string): Promise<CiqScoreOutput> =>
      api.get(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/ciq`).then(handleResponse),
    /** POST /workspaces/:id/prioritization/themes/:themeId/recalculate — async enqueue */
    recalculateThemeCiq: (workspaceId: string, themeId: string): Promise<{ jobId: string | number; message: string }> =>
      api.post(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/recalculate`).then(handleResponse),
    /** POST /workspaces/:id/prioritization/recalculate-all — bulk async enqueue */
    recalculateAll: (workspaceId: string): Promise<{ enqueued: number; message: string }> =>
      api.post(`/workspaces/${workspaceId}/prioritization/recalculate-all`).then(handleResponse),
    /** GET /workspaces/:id/prioritization/settings */
    getSettings: (workspaceId: string): Promise<PrioritizationSettings> =>
      api.get(`/workspaces/${workspaceId}/prioritization/settings`).then(handleResponse),
    /** PATCH /workspaces/:id/prioritization/settings */
    updateSettings: (workspaceId: string, data: Partial<PrioritizationSettings>): Promise<PrioritizationSettings> =>
      api.patch(`/workspaces/${workspaceId}/prioritization/settings`, data).then(handleResponse),
    /** GET /workspaces/:id/prioritization/features — feature priority ranking */
    getFeatures: (workspaceId: string, limit?: number): Promise<FeaturePriorityResponse> =>
      api.get(`/workspaces/${workspaceId}/prioritization/features`, { params: { limit } }).then(handleResponse),
    /** GET /workspaces/:id/prioritization/opportunities — revenue opportunities */
    getOpportunities: (workspaceId: string, limit?: number): Promise<OpportunitiesResponse> =>
      api.get(`/workspaces/${workspaceId}/prioritization/opportunities`, { params: { limit } }).then(handleResponse),
    /** GET /workspaces/:id/prioritization/roadmap — roadmap recommendations */
    getRoadmapRecommendations: (workspaceId: string, limit?: number): Promise<RoadmapRecommendationsResponse> =>
      api.get(`/workspaces/${workspaceId}/prioritization/roadmap`, { params: { limit } }).then(handleResponse),
    /** POST /workspaces/:id/prioritization/recompute — full workspace recompute */
    recompute: (workspaceId: string): Promise<{ jobId: string | number; message: string }> =>
      api.post(`/workspaces/${workspaceId}/prioritization/recompute`).then(handleResponse),
    /** POST /workspaces/:id/prioritization/themes/:themeId/override — manual override */
    setThemeOverride: (workspaceId: string, themeId: string, data: { manualOverrideScore: number | null; strategicTag?: string | null; overrideReason?: string | null }): Promise<Theme> =>
      api.post(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/override`, data).then(handleResponse),
    /** PATCH /workspaces/:id/prioritization/themes/:themeId/strategic-tag */
    setStrategicTag: (workspaceId: string, themeId: string, strategicTag: string | null): Promise<Theme> =>
      api.patch(`/workspaces/${workspaceId}/prioritization/themes/${themeId}/strategic-tag`, { strategicTag }).then(handleResponse),
  },

  support: {
    getOverview: (workspaceId: string): Promise<SupportOverview> =>
      api.get(`/workspaces/${workspaceId}/support/overview`).then(handleResponse),
    listTickets: (
      workspaceId: string,
      params?: { page?: number; limit?: number; status?: string; search?: string }
    ): Promise<SupportTicketListResponse> =>
      api
        .get(`/workspaces/${workspaceId}/support/tickets`, { params })
        .then(handleResponse),
    getClusters: (workspaceId: string, limit?: number): Promise<SupportCluster[]> =>
      api.get(`/workspaces/${workspaceId}/support/clusters`, { params: { limit } }).then(handleResponse),
    getSpikes: (workspaceId: string): Promise<SupportSpike[]> =>
      api.get(`/workspaces/${workspaceId}/support/spikes`).then(handleResponse),
    triggerSync: (workspaceId: string): Promise<{ message: string; workspaceId: string }> =>
      api.post(`/workspaces/${workspaceId}/support/sync`).then(handleResponse),
    triggerRecluster: (workspaceId: string): Promise<{ message: string; workspaceId: string }> =>
      api.post(`/workspaces/${workspaceId}/support/recluster`).then(handleResponse),
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
     * GET /workspaces/:id/integrations/slack/channels
     * Lists all Slack channels available to the connected bot token.
     */
    listSlackChannels: (workspaceId: string): Promise<{ channels: Array<{ id: string; name: string; memberCount?: number }> }> =>
      api.get(`/workspaces/${workspaceId}/integrations/slack/channels`).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/slack/channels
     * Saves the selected channels into IntegrationConnection.metadata.
     */
    configureSlackChannels: (
      workspaceId: string,
      data: { channels: Array<{ id: string; name: string }> },
    ): Promise<IntegrationStatus> =>
      api.post(`/workspaces/${workspaceId}/integrations/slack/channels`, data).then(handleResponse),

    /**
     * POST /workspaces/:id/integrations/slack/sync
     * Triggers an immediate Slack ingestion job.
     */
    syncSlack: (workspaceId: string): Promise<{ message: string }> =>
      api.post(`/workspaces/${workspaceId}/integrations/slack/sync`).then(handleResponse),

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
    /** GET /billing/status — billing snapshot for the calling user's workspace */
    getStatus: (): Promise<BillingStatusResponse> =>
      api.get('/billing/status').then(handleResponse),
    /** PATCH /billing/email — update billing contact email. ADMIN only */
    updateEmail: (data: UpdateBillingEmailDto): Promise<{ billingEmail: string | null }> =>
      api.patch('/billing/email', data).then(handleResponse),
    /** GET /billing/plans — all active plan config rows */
    listPlans: (): Promise<PlanConfig[]> =>
      api.get('/billing/plans').then(handleResponse),
    /**
     * POST /billing/checkout
     * Creates a Stripe Checkout Session for plan upgrade/downgrade.
     * Returns { url } — redirect the user to this URL.
     * ADMIN only.
     */
    createCheckoutSession: (data: {
      targetPlan: string;
      successUrl: string;
      cancelUrl: string;
    }): Promise<{ url: string; mode: string }> =>
      api.post('/billing/checkout', data).then(handleResponse),
    /**
     * POST /billing/portal
     * Creates a Stripe Customer Portal session for self-service management.
     * Returns { url } — redirect the user to this URL.
     * ADMIN only.
     */
    createPortalSession: (data: {
      returnUrl: string;
    }): Promise<{ url: string }> =>
      api.post('/billing/portal', data).then(handleResponse),
    /**
     * GET /billing/invoices
     * Returns cached invoices from the Invoice table (synced from Stripe).
     * ADMIN only.
     */
    listInvoices: (): Promise<InvoiceRecord[]> =>
      api.get('/billing/invoices').then(handleResponse),
  },

  customers: {
    /** GET /workspaces/:id/customers/revenue-summary */
    getRevenueSummary: (workspaceId: string): Promise<RevenueSummary> =>
      api.get(`/workspaces/${workspaceId}/customers/revenue-summary`).then(handleResponse),
    /** GET /workspaces/:id/customers */
    list: (
      workspaceId: string,
      params?: {
        search?: string;
        segment?: string;
        accountPriority?: string;
        lifecycleStage?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        page?: number;
        limit?: number;
      }
    ): Promise<PaginatedCustomers> =>
      api.get(`/workspaces/${workspaceId}/customers`, { params }).then(handleResponse),
    /** GET /workspaces/:id/customers/:customerId */
    getById: (workspaceId: string, customerId: string): Promise<CustomerDetail> =>
      api.get(`/workspaces/${workspaceId}/customers/${customerId}`).then(handleResponse),
    /** POST /workspaces/:id/customers */
    create: (workspaceId: string, data: CreateCustomerPayload): Promise<Customer> =>
      api.post(`/workspaces/${workspaceId}/customers`, data).then(handleResponse),
    /** PATCH /workspaces/:id/customers/:customerId */
    update: (workspaceId: string, customerId: string, data: UpdateCustomerPayload): Promise<Customer> =>
      api.patch(`/workspaces/${workspaceId}/customers/${customerId}`, data).then(handleResponse),
    /** DELETE /workspaces/:id/customers/:customerId */
    remove: (workspaceId: string, customerId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/customers/${customerId}`).then(handleResponse),
    /** GET /workspaces/:id/customers/analytics */
    getAnalytics: (workspaceId: string): Promise<CustomerAnalytics> =>
      api.get(`/workspaces/${workspaceId}/customers/analytics`).then(handleResponse),
    /** GET /workspaces/:id/customers/:customerId/signals */
    getSignals: (workspaceId: string, customerId: string): Promise<CustomerSignals> =>
      api.get(`/workspaces/${workspaceId}/customers/${customerId}/signals`).then(handleResponse),
    /** POST /workspaces/:id/customers/:customerId/rescore */
    rescore: (workspaceId: string, customerId: string): Promise<{ queued: boolean }> =>
      api.post(`/workspaces/${workspaceId}/customers/${customerId}/rescore`).then(handleResponse),
    /** POST /workspaces/:id/customers/rescore-all */
    rescoreAll: (workspaceId: string): Promise<{ queued: boolean }> =>
      api.post(`/workspaces/${workspaceId}/customers/rescore-all`).then(handleResponse),
  },

  deals: {
    /** GET /workspaces/:id/deals */
    list: (
      workspaceId: string,
      params?: {
        search?: string;
        stage?: string;
        status?: string;
        customerId?: string;
        page?: number;
        limit?: number;
      }
    ): Promise<PaginatedDeals> =>
      api.get(`/workspaces/${workspaceId}/deals`, { params }).then(handleResponse),
    /** GET /workspaces/:id/deals/:dealId */
    getById: (workspaceId: string, dealId: string): Promise<DealDetail> =>
      api.get(`/workspaces/${workspaceId}/deals/${dealId}`).then(handleResponse),
    /** POST /workspaces/:id/deals */
    create: (workspaceId: string, data: CreateDealPayload): Promise<DealDetail> =>
      api.post(`/workspaces/${workspaceId}/deals`, data).then(handleResponse),
    /** PATCH /workspaces/:id/deals/:dealId */
    update: (workspaceId: string, dealId: string, data: UpdateDealPayload): Promise<DealDetail> =>
      api.patch(`/workspaces/${workspaceId}/deals/${dealId}`, data).then(handleResponse),
    /** DELETE /workspaces/:id/deals/:dealId */
    remove: (workspaceId: string, dealId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/deals/${dealId}`).then(handleResponse),
    /** POST /workspaces/:id/deals/:dealId/themes/:themeId */
    linkTheme: (workspaceId: string, dealId: string, themeId: string): Promise<{ success: boolean }> =>
      api.post(`/workspaces/${workspaceId}/deals/${dealId}/themes/${themeId}`).then(handleResponse),
    /** DELETE /workspaces/:id/deals/:dealId/themes/:themeId */
    unlinkTheme: (workspaceId: string, dealId: string, themeId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/deals/${dealId}/themes/${themeId}`).then(handleResponse),
  },

  voice: {
    /**
     * POST /workspaces/:id/voice/presigned-url
     * Returns a pre-signed S3 PUT URL for direct browser upload.
     */
    getPresignedUrl: (
      workspaceId: string,
      data: { fileName: string; mimeType: string; sizeBytes: number }
    ): Promise<VoicePresignedUrlResponse> =>
      api.post(`/workspaces/${workspaceId}/voice/presigned-url`, data).then(handleResponse),
    /**
     * POST /workspaces/:id/voice/finalize
     * Creates UploadAsset + AiJobLog and enqueues transcription.
     */
    finalize: (
      workspaceId: string,
      data: { s3Key: string; s3Bucket?: string; fileName: string; mimeType: string; sizeBytes: number; label?: string; customerId?: string; dealId?: string }
    ): Promise<VoiceFinalizeResponse> =>
      api.post(`/workspaces/${workspaceId}/voice/finalize`, data).then(handleResponse),
    /**
     * GET /workspaces/:id/voice
     * Lists all voice uploads for the workspace.
     */
    list: (
      workspaceId: string,
      params?: { page?: number; limit?: number }
    ): Promise<VoiceUploadListResponse> =>
      api.get(`/workspaces/${workspaceId}/voice`, { params }).then(handleResponse),
    /**
     * GET /workspaces/:id/voice/:uploadId
     * Returns full detail for a single upload including signed download URL.
     */
    getById: (workspaceId: string, uploadId: string): Promise<VoiceUploadDetail> =>
      api.get(`/workspaces/${workspaceId}/voice/${uploadId}`).then(handleResponse),
    /**
     * POST /workspaces/:id/voice/:uploadId/reprocess
     * Re-enqueues the transcription pipeline for an existing upload.
     */
    reprocess: (workspaceId: string, uploadId: string): Promise<VoiceFinalizeResponse> =>
      api.post(`/workspaces/${workspaceId}/voice/${uploadId}/reprocess`).then(handleResponse),
    /**
     * POST /workspaces/:id/voice/:uploadId/link-theme
     * Manually links the voice upload's feedback to a theme.
     */
    linkTheme: (workspaceId: string, uploadId: string, themeId: string): Promise<{ uploadAssetId: string; themeId: string; feedbackId: string | null }> =>
      api.post(`/workspaces/${workspaceId}/voice/${uploadId}/link-theme`, { themeId }).then(handleResponse),
    /**
     * POST /workspaces/:id/voice/:uploadId/link-customer
     * Associates the voice upload with a customer record.
     */
    linkCustomer: (workspaceId: string, uploadId: string, customerId: string): Promise<{ uploadAssetId: string; customerId: string; feedbackId: string | null }> =>
      api.post(`/workspaces/${workspaceId}/voice/${uploadId}/link-customer`, { customerId }).then(handleResponse),
  },

  themeRevenue: {
    /** GET /workspaces/:id/themes/:themeId/revenue-intelligence */
    getByTheme: (workspaceId: string, themeId: string): Promise<ThemeRevenueIntelligence> =>
      api.get(`/workspaces/${workspaceId}/themes/${themeId}/revenue-intelligence`).then(handleResponse),
    /** POST /workspaces/:id/themes/:themeId/link-deal */
    linkDeal: (workspaceId: string, themeId: string, dealId: string): Promise<{ success: boolean }> =>
      api.post(`/workspaces/${workspaceId}/themes/${themeId}/link-deal`, { dealId }).then(handleResponse),
    /** DELETE /workspaces/:id/themes/:themeId/link-deal/:dealId */
    unlinkDeal: (workspaceId: string, themeId: string, dealId: string): Promise<{ success: boolean }> =>
      api.delete(`/workspaces/${workspaceId}/themes/${themeId}/link-deal/${dealId}`).then(handleResponse),
    /** POST /workspaces/:id/themes/:themeId/link-customer */
    linkCustomer: (workspaceId: string, themeId: string, customerId: string): Promise<{ success: boolean }> =>
      api.post(`/workspaces/${workspaceId}/themes/${themeId}/link-customer`, { customerId }).then(handleResponse),
    /** DELETE /workspaces/:id/themes/:themeId/link-customer/:customerId */
    unlinkCustomer: (workspaceId: string, themeId: string, customerId: string): Promise<{ success: boolean }> =>
      api.delete(`/workspaces/${workspaceId}/themes/${themeId}/link-customer/${customerId}`).then(handleResponse),
  },

  surveys: {
    list: (workspaceId: string, params?: { status?: string; surveyType?: string; search?: string; page?: number; limit?: number }): Promise<SurveyListResponse> =>
      api.get(`/workspaces/${workspaceId}/surveys`, { params }).then(handleResponse),
    getById: (workspaceId: string, surveyId: string): Promise<Survey> =>
      api.get(`/workspaces/${workspaceId}/surveys/${surveyId}`).then(handleResponse),
    create: (workspaceId: string, data: CreateSurveyPayload): Promise<Survey> =>
      api.post(`/workspaces/${workspaceId}/surveys`, data).then(handleResponse),
    update: (workspaceId: string, surveyId: string, data: Partial<CreateSurveyPayload>): Promise<Survey> =>
      api.patch(`/workspaces/${workspaceId}/surveys/${surveyId}`, data).then(handleResponse),
    publish: (workspaceId: string, surveyId: string): Promise<Survey> =>
      api.post(`/workspaces/${workspaceId}/surveys/${surveyId}/publish`).then(handleResponse),
    unpublish: (workspaceId: string, surveyId: string): Promise<Survey> =>
      api.post(`/workspaces/${workspaceId}/surveys/${surveyId}/unpublish`).then(handleResponse),
    close: (workspaceId: string, surveyId: string): Promise<Survey> =>
      api.post(`/workspaces/${workspaceId}/surveys/${surveyId}/close`).then(handleResponse),
    delete: (workspaceId: string, surveyId: string): Promise<void> =>
      api.delete(`/workspaces/${workspaceId}/surveys/${surveyId}`).then(handleResponse),
    addQuestion: (workspaceId: string, surveyId: string, data: AddQuestionPayload): Promise<Survey> =>
      api.post(`/workspaces/${workspaceId}/surveys/${surveyId}/questions`, data).then(handleResponse),
    deleteQuestion: (workspaceId: string, surveyId: string, questionId: string): Promise<Survey> =>
      api.delete(`/workspaces/${workspaceId}/surveys/${surveyId}/questions/${questionId}`).then(handleResponse),
    getResponses: (workspaceId: string, surveyId: string, params?: { page?: number; limit?: number }): Promise<SurveyResponseListResponse> =>
      api.get(`/workspaces/${workspaceId}/surveys/${surveyId}/responses`, { params }).then(handleResponse),
    getIntelligence: (workspaceId: string, surveyId: string): Promise<SurveyIntelligence> =>
      api.get(`/workspaces/${workspaceId}/surveys/${surveyId}/intelligence`).then(handleResponse),
  },

  portalSurveys: {
    list: (orgSlug: string): Promise<Survey[]> =>
      api.get(`/portal/${orgSlug}/surveys`).then(handleResponse),
    getById: (orgSlug: string, surveyId: string): Promise<Survey> =>
      api.get(`/portal/${orgSlug}/surveys/${surveyId}`).then(handleResponse),
    submit: (orgSlug: string, surveyId: string, data: SubmitSurveyResponsePayload): Promise<{ thankYouMessage: string | null; redirectUrl: string | null; feedbackId: string | null }> =>
      api.post(`/portal/${orgSlug}/surveys/${surveyId}/responses`, data).then(handleResponse),
  },

  ciqEngine: {
    /**
     * GET /workspaces/:id/ciq/feature-ranking
     * Returns feedback items ranked by CIQ score (6-dimension composite).
     */
    getFeatureRanking: (workspaceId: string, limit = 50): Promise<FeatureRankingItem[]> =>
      api.get(`/workspaces/${workspaceId}/ciq/feature-ranking`, { params: { limit } }).then(handleResponse),
    /**
     * GET /workspaces/:id/ciq/theme-ranking
     * Returns ACTIVE themes ranked by CIQ score (voice + survey + support enriched).
     */
    getThemeRanking: (workspaceId: string, limit = 50): Promise<ThemeRankingItem[]> =>
      api.get(`/workspaces/${workspaceId}/ciq/theme-ranking`, { params: { limit } }).then(handleResponse),
    /**
     * GET /workspaces/:id/ciq/customer-ranking
     * Returns customers ranked by CIQ influence score.
     */
    getCustomerRanking: (workspaceId: string, limit = 50): Promise<CustomerRankingItem[]> =>
      api.get(`/workspaces/${workspaceId}/ciq/customer-ranking`, { params: { limit } }).then(handleResponse),
    /**
     * GET /workspaces/:id/ciq/strategic-signals
     * Returns workspace-level strategic intelligence and roadmap recommendations.
     */
    getStrategicSignals: (workspaceId: string): Promise<StrategicSignalsOutput> =>
      api.get(`/workspaces/${workspaceId}/ciq/strategic-signals`).then(handleResponse),
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

  // ─── Executive Dashboard Intelligence ─────────────────────────────────────
  dashboard: {
    getExecutive: (workspaceId: string): Promise<ExecutiveDashboard> =>
      api.get(`/workspaces/${workspaceId}/dashboard/executive`).then(handleResponse),
    getThemes: (workspaceId: string): Promise<{ data: EmergingThemeRadar; cached: boolean }> =>
      api.get(`/workspaces/${workspaceId}/dashboard/themes`).then(handleResponse),
    getRevenueRisk: (workspaceId: string): Promise<{ data: RevenueRiskIndicator; cached: boolean }> =>
      api.get(`/workspaces/${workspaceId}/dashboard/revenue-risk`).then(handleResponse),
    getVoiceSignals: (workspaceId: string): Promise<{ data: VoiceSentimentSignal; cached: boolean }> =>
      api.get(`/workspaces/${workspaceId}/dashboard/voice-signals`).then(handleResponse),
    getRoadmapHealth: (workspaceId: string): Promise<{ data: RoadmapHealthPanel; cached: boolean }> =>
      api.get(`/workspaces/${workspaceId}/dashboard/roadmap-health`).then(handleResponse),
    refresh: (workspaceId: string): Promise<{ message: string; workspaceId: string }> =>
      api.post(`/workspaces/${workspaceId}/dashboard/refresh`).then(handleResponse),
  },

  // ─── Enterprise Reporting ──────────────────────────────────────────────────
  reports: {
    getThemeTrends: (
      workspaceId: string,
      filter?: { from?: string; to?: string },
      limit = 20,
    ): Promise<ThemeTrendsReport> =>
      api
        .get(`/workspaces/${workspaceId}/reports/theme-trends`, {
          params: { from: filter?.from, to: filter?.to, limit },
        })
        .then(handleResponse),

    getPriorityDistribution: (
      workspaceId: string,
      filter?: { from?: string; to?: string },
    ): Promise<PriorityDistributionReport> =>
      api
        .get(`/workspaces/${workspaceId}/reports/priority-distribution`, {
          params: { from: filter?.from, to: filter?.to },
        })
        .then(handleResponse),

    getRevenueImpact: (
      workspaceId: string,
      filter?: { from?: string; to?: string },
      limit = 10,
    ): Promise<RevenueImpactReport> =>
      api
        .get(`/workspaces/${workspaceId}/reports/revenue-impact`, {
          params: { from: filter?.from, to: filter?.to, limit },
        })
        .then(handleResponse),

    getRoadmapProgress: (
      workspaceId: string,
      filter?: { from?: string; to?: string },
    ): Promise<RoadmapProgressReport> =>
      api
        .get(`/workspaces/${workspaceId}/reports/roadmap-progress`, {
          params: { from: filter?.from, to: filter?.to },
        })
        .then(handleResponse),

    getFeedbackVolume: (
      workspaceId: string,
      filter?: { from?: string; to?: string },
    ): Promise<FeedbackVolumeReport> =>
      api
        .get(`/workspaces/${workspaceId}/reports/feedback-volume`, {
          params: { from: filter?.from, to: filter?.to },
        })
        .then(handleResponse),

    exportUrl: (
      workspaceId: string,
      report: string,
      format: 'csv' | 'json',
      filter?: { from?: string; to?: string },
    ): string => {
      const base = (api.defaults.baseURL ?? '').replace(/\/$/, '');
      const params = new URLSearchParams({ format });
      if (filter?.from) params.set('from', filter.from);
      if (filter?.to)   params.set('to', filter.to);
      return `${base}/workspaces/${workspaceId}/reports/export/${report}?${params.toString()}`;
    },
  },
  // ── Platform admin ─────────────────────────────────────────────────────────
  platform: {
    listPlans: () => api.get('/platform/plans').then(handleResponse),
    getPlan: (planType: string) => api.get(`/platform/plans/${planType}`).then(handleResponse),
    createPlan: (data: any) => api.post('/platform/plans', data).then(handleResponse),
    updatePlan: (planType: string, data: any) => api.patch(`/platform/plans/${planType}`, data).then(handleResponse),
    deletePlan: (planType: string) => api.delete(`/platform/plans/${planType}`).then(handleResponse),
    updateTrialDuration: (planType: string, trialDays: number) => api.patch(`/platform/plans/${planType}/trial`, { trialDays }).then(handleResponse),
    listWorkspaces: (params?: { page?: number; limit?: number; status?: string; billingPlan?: string; search?: string }) =>
      api.get('/platform/workspaces', { params }).then(handleResponse),
    getWorkspace: (workspaceId: string) => api.get(`/platform/workspaces/${workspaceId}`).then(handleResponse),
    updateWorkspaceStatus: (workspaceId: string, data: { status: string; reason?: string }) =>
      api.patch(`/platform/workspaces/${workspaceId}/status`, data).then(handleResponse),
    deleteWorkspace: (workspaceId: string) => api.delete(`/platform/workspaces/${workspaceId}`).then(handleResponse),
    getBillingHealth: () => api.get('/platform/billing/health').then(handleResponse),
    listAllSubscriptions: (params?: { page?: number; limit?: number }) =>
      api.get('/platform/billing/subscriptions', { params }).then(handleResponse),
    overrideBillingPlan: (workspaceId: string, data: { plan: string; billingStatus?: string; reason?: string }) =>
      api.post(`/platform/billing/workspaces/${workspaceId}/override-plan`, data).then(handleResponse),
    extendTrial: (workspaceId: string, data: { days: number; reason?: string }) =>
      api.post(`/platform/billing/workspaces/${workspaceId}/extend-trial`, data).then(handleResponse),
    cancelSubscription: (workspaceId: string) =>
      api.post(`/platform/billing/workspaces/${workspaceId}/cancel`).then(handleResponse),
    reactivateSubscription: (workspaceId: string) =>
      api.post(`/platform/billing/workspaces/${workspaceId}/reactivate`).then(handleResponse),
    listFeatureOverrides: (workspaceId: string) =>
      api.get(`/platform/workspaces/${workspaceId}/feature-overrides`).then(handleResponse),
    setFeatureOverride: (workspaceId: string, data: { feature: string; enabled: boolean; reason?: string }) =>
      api.post(`/platform/workspaces/${workspaceId}/feature-overrides`, data).then(handleResponse),
    deleteFeatureOverride: (workspaceId: string, feature: string) =>
      api.delete(`/platform/workspaces/${workspaceId}/feature-overrides/${feature}`).then(handleResponse),
    getSystemHealth: () => api.get('/platform/health').then(handleResponse),
    listAuditLogs: (params?: { page?: number; limit?: number; workspaceId?: string }) =>
      api.get('/platform/audit-log', { params }).then(handleResponse),
    listPlatformUsers: (params?: { page?: number; limit?: number; search?: string }) =>
      api.get('/platform/users', { params }).then(handleResponse),
    updatePlatformUser: (userId: string, data: { platformRole?: string | null; status?: string }) =>
      api.patch(`/platform/users/${userId}`, data).then(handleResponse),
    getMe: (): Promise<User> => api.get('/auth/me').then(handleResponse),
    // ── Purge (platform admin) ──
    listPurgeRequests: () => api.get('/platform/purge/requests').then(handleResponse),
    getPurgeRequest: (requestId: string) => api.get(`/platform/purge/requests/${requestId}`).then(handleResponse),
    approvePurgeRequest: (requestId: string, data?: { scheduledFor?: string }) =>
      api.patch(`/platform/purge/requests/${requestId}/approve`, data ?? {}).then(handleResponse),
    executePurge: (requestId: string) =>
      api.post(`/platform/purge/requests/${requestId}/execute`).then(handleResponse),
    cancelPurgeRequest: (requestId: string) =>
      api.delete(`/platform/purge/requests/${requestId}`).then(handleResponse),
  },
  purge: {
    requestDeletion: (workspaceId: string, data: { reason?: string; includeExportBeforeDelete?: boolean }) =>
      api.post(`/workspaces/${workspaceId}/purge/request`, data).then(handleResponse),
    cancelRequest: (workspaceId: string, requestId: string) =>
      api.delete(`/workspaces/${workspaceId}/purge/request/${requestId}`).then(handleResponse),
    listRequests: (workspaceId: string) =>
      api.get(`/workspaces/${workspaceId}/purge/request`).then(handleResponse),
    getRequest: (workspaceId: string, requestId: string) =>
      api.get(`/workspaces/${workspaceId}/purge/request/${requestId}`).then(handleResponse),
  },
  digest: {
    generate: (workspaceId: string): Promise<void> =>
      api.post(`/workspaces/${workspaceId}/digest/generate`).then(handleResponse),
  },
};

/**
 * Silent token refresh with queue-based concurrency control.
 *
 * Problem solved: When multiple API calls fail with 401 simultaneously (e.g. on
 * page load), the naive approach triggers multiple concurrent refresh requests.
 * Because the backend uses refresh token rotation, the second concurrent request
 * uses an already-revoked token and fails, causing an unnecessary logout.
 *
 * Solution: A single "isRefreshing" flag and a "failedQueue" ensure that only
 * ONE refresh request is in-flight at a time. All other 401 failures are queued
 * and resolved/rejected once the single refresh completes.
 */
let isRefreshing = false;
type QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void };
let failedQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((item) => {
    if (error) {
      item.reject(error);
    } else {
      item.resolve(token as string);
    }
  });
  failedQueue = [];
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  // Match /:orgSlug/app/* and /:orgSlug/admin/* (workspace-scoped protected routes)
  const isProtected =
    /^\/[^/]+\/app(\/|$)/.test(path) ||
    /^\/[^/]+\/admin(\/|$)/.test(path);
  if (isProtected) {
    const slugMatch = path.match(/^\/([^/]+)\//); 
    const slug = slugMatch ? slugMatch[1] : null;
    window.location.href = slug ? `/${slug}/login` : "/login";
  } else if (
    /^\/[^/]+\/portal(\/|$)/.test(path)
  ) {
    const slugMatch = path.match(/^\/([^/]+)\//); 
    const slug = slugMatch ? slugMatch[1] : null;
    window.location.href = slug ? `/${slug}/portal/login` : "/login";
  } else if (path.startsWith("/admin")) {
    window.location.href = "/login";
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean });

    // Only attempt refresh on 401 errors that haven't already been retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request IS the refresh endpoint
    // (avoids infinite loops when the refresh token itself is expired)
    if (originalRequest.url?.includes('/auth/refresh')) {
      clearTokens();
      redirectToLogin();
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      // No refresh token stored — user needs to log in
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Another refresh is already in-flight — queue this request and wait
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers!["Authorization"] = `Bearer ${newToken}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // This is the first 401 — take the refresh lock
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { accessToken, refreshToken: newRefreshToken } = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(
        `${getApiBaseUrl()}/auth/refresh`,
        { refreshToken },
        { headers: { "Content-Type": "application/json" } },
      ).then((r) => r.data);

      // Persist the new token pair (rotation: old refresh token is now revoked)
      setTokens(accessToken, newRefreshToken);

      // Update the Authorization header for the retried request
      originalRequest.headers!["Authorization"] = `Bearer ${accessToken}`;

      // Resolve all queued requests with the new token
      processQueue(null, accessToken);

      return api(originalRequest);
    } catch (refreshError) {
      // Refresh failed (token expired or revoked) — clear session and redirect
      processQueue(refreshError, null);
      clearTokens();
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;

export function isApiError(
  error: unknown
): error is AxiosError<ApiError> {
  return axios.isAxiosError(error) && !!error.response?.data?.statusCode;
}
