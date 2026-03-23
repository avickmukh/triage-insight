'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { VoiceUploadListResponse, VoiceUploadDetail } from '@/lib/api-types';
import { useWorkspace } from '@/hooks/use-workspace';

// ─── Query key factory ─────────────────────────────────────────────────────────
const voiceKeys = {
  all:    (orgSlug: string) => ['voice', orgSlug] as const,
  list:   (orgSlug: string, page?: number) => ['voice', orgSlug, 'list', page] as const,
  detail: (orgSlug: string, id: string) => ['voice', orgSlug, 'detail', id] as const,
};

// ─── Resolve workspaceId from orgSlug ─────────────────────────────────────────
function useWorkspaceId(orgSlug: string): string | null {
  const { workspace } = useWorkspace();
  return workspace?.id ?? null;
}

// ─── List uploads ──────────────────────────────────────────────────────────────
export function useVoiceUploads(orgSlug: string, page = 1, limit = 20) {
  const workspaceId = useWorkspaceId(orgSlug);
  return useQuery<VoiceUploadListResponse>({
    queryKey: voiceKeys.list(orgSlug, page),
    queryFn: () => apiClient.voice.list(workspaceId!, { page, limit }),
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 15_000, // poll every 15s to catch QUEUED → COMPLETED transitions
  });
}

// ─── Upload detail (lazy — only fetches when enabled=true) ────────────────────
export function useVoiceUploadDetail(orgSlug: string, uploadId: string, enabled: boolean) {
  const workspaceId = useWorkspaceId(orgSlug);
  return useQuery<VoiceUploadDetail>({
    queryKey: voiceKeys.detail(orgSlug, uploadId),
    queryFn: () => apiClient.voice.getById(workspaceId!, uploadId),
    enabled: !!workspaceId && enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 10_000 : false,
  });
}

// ─── Upload helper (presigned URL → S3 PUT → finalize) ────────────────────────
export function useVoiceUpload(orgSlug: string) {
  const workspaceId = useWorkspaceId(orgSlug);
  const queryClient = useQueryClient();

  const upload = async (
    file: File,
    label?: string,
    onProgress?: (pct: number) => void,
  ): Promise<void> => {
    if (!workspaceId) throw new Error('Workspace not loaded');

    // 1. Get a pre-signed S3 PUT URL
    const { signedUrl, key, bucket } = await apiClient.voice.getPresignedUrl(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    // 2. Upload directly to S3 via XHR (so we get progress events)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`S3 upload failed with status ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('S3 upload network error'));
      xhr.send(file);
    });

    // 3. Finalize: create UploadAsset + AiJobLog + enqueue transcription
    await apiClient.voice.finalize(workspaceId, {
      key,
      bucket,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      label,
    });

    // 4. Invalidate the list so the new upload appears immediately
    await queryClient.invalidateQueries({ queryKey: voiceKeys.all(orgSlug) });
  };

  return { upload };
}
