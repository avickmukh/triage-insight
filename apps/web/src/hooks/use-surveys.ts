'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import type {
  Survey,
  SurveyListResponse,
  SurveyResponseListResponse,
  SurveyIntelligence,
  CreateSurveyPayload,
  AddQuestionPayload,
  SubmitSurveyResponsePayload,
} from '@/lib/api-types';

// ─── Workspace survey hooks ────────────────────────────────────────────────────

/**
 * List surveys for the current workspace.
 * First arg (_orgSlug) is accepted for call-site compatibility but ignored —
 * workspaceId is resolved from the workspace context.
 */
export function useSurveyList(
  _orgSlugOrIgnored?: string,
  params?: { status?: string; surveyType?: string; search?: string; page?: number; limit?: number },
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  return useQuery<SurveyListResponse>({
    queryKey: ['surveys', workspaceId, params],
    queryFn: () => apiClient.surveys.list(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

/**
 * Get a single survey by ID.
 * First arg (_workspaceId) is accepted for call-site compatibility but ignored.
 */
export function useSurveyDetail(
  _workspaceIdOrSurveyId: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  // Support both useSurveyDetail(surveyId) and useSurveyDetail(workspaceId, surveyId)
  const surveyId = surveyIdArg ?? _workspaceIdOrSurveyId;
  return useQuery<Survey>({
    queryKey: ['survey', workspaceId, surveyId],
    queryFn: () => apiClient.surveys.getById(workspaceId, surveyId!),
    enabled: !!workspaceId && !!surveyId,
    staleTime: 30_000,
  });
}

/**
 * Get responses for a survey.
 * First arg (_workspaceId) is accepted for call-site compatibility but ignored.
 */
export function useSurveyResponses(
  _workspaceIdOrSurveyId: string,
  surveyIdArg?: string,
  params?: { page?: number; limit?: number },
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const surveyId = surveyIdArg ?? _workspaceIdOrSurveyId;
  return useQuery<SurveyResponseListResponse>({
    queryKey: ['survey-responses', workspaceId, surveyId, params],
    queryFn: () => apiClient.surveys.getResponses(workspaceId, surveyId!, params),
    enabled: !!workspaceId && !!surveyId,
    staleTime: 30_000,
  });
}

export function useCreateSurvey() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<Survey, Error, CreateSurveyPayload>({
    mutationFn: (data) => apiClient.surveys.create(workspaceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
    },
  });
}

export function useUpdateSurvey(surveyId: string) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<Survey, Error, Partial<CreateSurveyPayload>>({
    mutationFn: (data) => apiClient.surveys.update(workspaceId, surveyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, surveyId] });
    },
  });
}

/**
 * Publish a survey.
 * Accepts optional (_workspaceId, surveyId) for call-site compatibility.
 * When called as usePublishSurvey(workspaceId, surveyId), the surveyId is
 * used directly (no mutation variable needed — call mutate() with no args).
 */
export function usePublishSurvey(
  _workspaceIdOrIgnored?: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<Survey, Error, string | void>({
    mutationFn: (surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      return apiClient.surveys.publish(workspaceId, id);
    },
    onSuccess: (_, surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, id] });
    },
  });
}

export function useUnpublishSurvey(
  _workspaceIdOrIgnored?: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<Survey, Error, string | void>({
    mutationFn: (surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      return apiClient.surveys.unpublish(workspaceId, id);
    },
    onSuccess: (_, surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, id] });
    },
  });
}

export function useCloseSurvey(
  _workspaceIdOrIgnored?: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<Survey, Error, string | void>({
    mutationFn: (surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      return apiClient.surveys.close(workspaceId, id);
    },
    onSuccess: (_, surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, id] });
    },
  });
}

export function useDeleteSurvey(
  _workspaceIdOrIgnored?: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const qc = useQueryClient();
  return useMutation<void, Error, string | void>({
    mutationFn: (surveyIdVar) => {
      const id = (surveyIdVar as string | undefined) ?? surveyIdArg ?? '';
      return apiClient.surveys.delete(workspaceId, id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surveys', workspaceId] });
    },
  });
}

/**
 * Add a question to a survey.
 * Accepts optional (_workspaceId, surveyId) for call-site compatibility.
 */
export function useAddQuestion(
  _workspaceIdOrSurveyId: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const surveyId = surveyIdArg ?? _workspaceIdOrSurveyId;
  const qc = useQueryClient();
  return useMutation<Survey, Error, AddQuestionPayload>({
    mutationFn: (data) => apiClient.surveys.addQuestion(workspaceId, surveyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, surveyId] });
    },
  });
}

/**
 * Delete a question from a survey.
 * Accepts optional (_workspaceId, surveyId) for call-site compatibility.
 */
export function useDeleteQuestion(
  _workspaceIdOrSurveyId: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const surveyId = surveyIdArg ?? _workspaceIdOrSurveyId;
  const qc = useQueryClient();
  return useMutation<Survey, Error, string>({
    mutationFn: (questionId) => apiClient.surveys.deleteQuestion(workspaceId, surveyId, questionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey', workspaceId, surveyId] });
    },
  });
}

// ─── Portal survey hooks (no auth) ────────────────────────────────────────────

export function usePortalSurveyList(orgSlug: string) {
  return useQuery<Survey[]>({
    queryKey: ['portal-surveys', orgSlug],
    queryFn: () => apiClient.portalSurveys.list(orgSlug),
    enabled: !!orgSlug,
    staleTime: 60_000,
  });
}

/** Alias for portal pages */
export const usePublicSurveyList = usePortalSurveyList;

export function usePortalSurveyDetail(orgSlug: string, surveyId: string | null) {
  return useQuery<Survey>({
    queryKey: ['portal-survey', orgSlug, surveyId],
    queryFn: () => apiClient.portalSurveys.getById(orgSlug, surveyId!),
    enabled: !!orgSlug && !!surveyId,
    staleTime: 60_000,
  });
}

/** Alias for portal pages */
export const usePublicSurveyDetail = usePortalSurveyDetail;

/**
 * Get aggregated intelligence for a survey.
 * First arg (_workspaceId) is accepted for call-site compatibility but ignored.
 */
export function useSurveyIntelligence(
  _workspaceIdOrSurveyId: string,
  surveyIdArg?: string,
) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  const surveyId = surveyIdArg ?? _workspaceIdOrSurveyId;
  return useQuery<SurveyIntelligence>({
    queryKey: ['survey-intelligence', workspaceId, surveyId],
    queryFn: () => apiClient.surveys.getIntelligence(workspaceId, surveyId!),
    enabled: !!workspaceId && !!surveyId,
    staleTime: 60_000,
  });
}

export function useSubmitSurveyResponse(orgSlug: string, surveyId: string) {
  const qc = useQueryClient();
  return useMutation<
    { thankYouMessage: string | null; redirectUrl: string | null; feedbackId: string | null },
    Error,
    SubmitSurveyResponsePayload
  >({
    mutationFn: (data) => apiClient.portalSurveys.submit(orgSlug, surveyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-surveys', orgSlug] });
    },
  });
}
