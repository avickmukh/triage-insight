# Voice Capability Audit Summary

This audit covers the current state of voice feedback processing in the TriageInsight repository as of Mar 28, 2026.

---

### Already Implemented

A surprisingly robust and near-complete voice pipeline already exists for **internal workspace users**. This is far more advanced than a typical MVP.

*   **Database Schema:**
    *   `UploadAsset` model perfectly handles audio file metadata (S3 key, bucket, MIME type, size, duration).
    *   `Feedback` model has `sourceType: VOICE` and links to the `UploadAsset` via a `metadata` field (`uploadAssetId`).
    *   `AiJobLog` provides detailed, auditable tracking for transcription and intelligence extraction jobs, including status, errors, and timing.

*   **Backend API (`/apps/api/src/voice`):**
    *   A complete `VoiceModule` with a `VoiceController` and `VoiceService`.
    *   Full support for a two-step secure upload process: `POST /presigned-url` and `POST /finalize`.
    *   Endpoints to list, get details of, and reprocess voice uploads.
    *   `TranscriptionService` wrapping OpenAI Whisper.
    *   `VoiceIntelligenceService` for post-transcription analysis.

*   **Worker & Queues:**
    *   Dedicated `voice-transcription` and `voice-extraction` BullMQ queues are registered.
    *   `VoiceTranscriptionProcessor` handles downloading from S3, transcribing, creating the `Feedback` record, and enqueuing the next job.
    *   `VoiceExtractionProcessor` handles extracting structured data (summary, sentiment, topics) from the transcript.
    *   The worker pipeline is robust, with logging, error handling, and status updates.

*   **Frontend (Internal Workspace):**
    *   A full UI section at `/app/voice` for managing voice uploads.
    *   `useVoice` hooks providing data fetching and mutation capabilities.
    *   A detailed view at `/app/voice/:id` that includes an audio player, transcript display, and extracted intelligence.

*   **Infrastructure & Config:**
    *   Environment variables for AWS S3 and OpenAI are defined and validated.
    *   Plan-based limits (`voiceUploadLimit`, `voiceFeedback` feature flag) are integrated into the billing service.

---

### Partially Implemented

*   **Feedback Representation:** The core `Feedback` model is used for the transcript, but the UI in the main `/app/inbox` view does not yet render the audio player or distinguish it clearly from text-based feedback beyond a "Voice" source tag.

---

### Missing

The **only significant missing piece** is the ability for **end-users** to submit voice feedback through the **public-facing portal**.

*   **Public API Endpoint:** The `/api/v1/portal/:orgSlug/feedback` endpoint currently only accepts `title` and `description` (text). It does not support file uploads or a two-step upload/finalize flow.
*   **Public Portal UI:** The feedback submission form at `/portal/feedback/new` is text-only. It has no file input, no audio recorder, and no UI to handle upload states (uploading, processing, etc.).

---

### Recommended Implementation Path

Leverage the extensive existing infrastructure. The goal is to simply expose the already-built voice pipeline to the public portal.

1.  **Backend (Extend Public API):**
    *   Create a new endpoint `POST /api/v1/portal/:orgSlug/voice/presigned-url` for public use. This can reuse the internal `VoiceService.createPresignedUploadUrl` logic but will be under the `/portal` controller and have no JWT guard.
    *   Create a new endpoint `POST /api/v1/portal/:orgSlug/voice/finalize`. This will reuse the internal `VoiceService.finalizeUpload` logic.
    *   The key difference is that the `finalize` method will create a `Feedback` record with `sourceType: PUBLIC_PORTAL` and `metadata` that includes both the `uploadAssetId` and a `sourceChannel: 'voice'` field for clarity.

2.  **Frontend (Update Public Portal UI):**
    *   Add a file input component to the `/portal/feedback/new` page for audio file uploads.
    *   Implement the client-side logic to perform the two-step upload:
        1.  Call the new public `presigned-url` endpoint.
        2.  `PUT` the audio file directly to the returned S3 URL, showing a progress bar.
        3.  Call the new public `finalize` endpoint.
    *   Update the UI to show feedback submission states (e.g., "Uploading audio...", "Processing...").

3.  **Frontend (Enhance Inbox View):**
    *   In the `/app/inbox/:id` page, if `feedback.sourceType` is `PUBLIC_PORTAL` and `feedback.metadata.sourceChannel` is `'voice'`, render an audio player component using the `downloadUrl` from the linked `UploadAsset`.

This approach avoids reinventing any wheels and connects the missing public-facing UI to the powerful, already-built backend pipeline.
