/**
 * WorkerProcessorsModule
 *
 * This is the ONLY place in the entire codebase where BullMQ @Processor()
 * classes are registered as NestJS providers.
 *
 * Design rationale:
 * ─────────────────
 * Processors are worker-only runtime artefacts. They must never be
 * instantiated in the API process.
 *
 * Feature modules (AiModule, ThemeModule, etc.) are shared between the API
 * and the worker. Processors have been removed from those shared modules'
 * providers[] arrays to prevent double-registration.
 *
 * This module imports each feature module so that the services processors
 * depend on are available in the DI container. Because processors are ONLY
 * here (not in the feature modules), there is no risk of Bull throwing
 * "Cannot define the same handler twice".
 *
 * NestJS module deduplication:
 * NestJS deduplicates module instances within a single module graph.
 * WorkerModule (the root) already imports most feature modules; importing
 * them again here is safe — NestJS reuses the same instance.
 *
 * AiModule and PrismaModule are marked @Global() so their services are
 * available here without needing to be imported explicitly.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

// ── Feature modules (provide services that processors depend on) ──────────────
import { AiModule } from '../../api/src/ai/ai.module';
import { ThemeModule } from '../../api/src/theme/theme.module';
import { CustomerModule } from '../../api/src/customer/customer.module';
import { DigestModule } from '../../api/src/digest/digest.module';
import { IntegrationsModule } from '../../api/src/integrations/integrations.module';
import { PrioritizationModule } from '../../api/src/prioritization/prioritization.module';
import { PublicPortalModule } from '../../api/src/public/public-portal.module';
import { PurgeModule } from '../../api/src/purge/purge.module';
import { SupportModule } from '../../api/src/support/support.module';
import { SurveyModule } from '../../api/src/survey/survey.module';
import { VoiceModule } from '../../api/src/voice/voice.module';
import { DashboardModule } from '../../api/src/dashboard/dashboard.module';

// ── AI ───────────────────────────────────────────────────────────────────────
import {
  AiAnalysisProcessor,
  AI_ANALYSIS_QUEUE,
} from '../../api/src/ai/processors/analysis.processor';
import {
  CiqScoringProcessor,
  CIQ_SCORING_QUEUE,
} from '../../api/src/ai/processors/ciq-scoring.processor';

// ── Theme ────────────────────────────────────────────────────────────────────
import { ThemeClusteringProcessor } from '../../api/src/theme/processors/theme-clustering.processor';
import { AI_CLUSTERING_QUEUE } from '../../api/src/theme/services/theme.service';

// ── Customer ─────────────────────────────────────────────────────────────────
import {
  CustomerRevenueSignalProcessor,
  CUSTOMER_REVENUE_SIGNAL_QUEUE,
} from '../../api/src/customer/processors/customer-revenue-signal.processor';
import {
  CustomerSignalAggregationProcessor,
  CUSTOMER_SIGNAL_AGGREGATION_QUEUE,
} from '../../api/src/customer/processors/customer-signal-aggregation.processor';

// ── Digest ───────────────────────────────────────────────────────────────────
import {
  DigestProcessor,
  DIGEST_QUEUE,
} from '../../api/src/digest/digest.processor';

// ── Integrations ─────────────────────────────────────────────────────────────
import {
  SlackIngestionProcessor,
  SLACK_INGESTION_QUEUE,
} from '../../api/src/integrations/processors/slack-ingestion.processor';

// ── Prioritization ───────────────────────────────────────────────────────────
import {
  PrioritizationWorker,
  PRIORITIZATION_QUEUE,
} from '../../api/src/prioritization/workers/prioritization.worker';

// ── Public Portal ────────────────────────────────────────────────────────────
import { PortalSignalProcessor } from '../../api/src/public/processors/portal-signal.processor';
import { PORTAL_SIGNAL_QUEUE } from '../../api/src/public/portal-signal.constants';

// ── Purge ────────────────────────────────────────────────────────────────────
import { PurgeWorker } from '../../api/src/purge/purge.worker';
import { PURGE_QUEUE } from '../../api/src/purge/purge.service';

// ── Support ──────────────────────────────────────────────────────────────────
import { SyncProcessor } from '../../api/src/support/processors/sync.processor';
import { ClusteringProcessor } from '../../api/src/support/processors/clustering.processor';
import { SpikeDetectionProcessor } from '../../api/src/support/processors/spike-detection.processor';

// ── Survey ───────────────────────────────────────────────────────────────────
import {
  SurveyIntelligenceProcessor,
  SURVEY_INTELLIGENCE_QUEUE,
} from '../../api/src/survey/processors/survey-intelligence.processor';

// ── Voice ────────────────────────────────────────────────────────────────────
import { VoiceTranscriptionProcessor } from '../../api/src/voice/processors/voice-transcription.processor';
import {
  VoiceExtractionProcessor,
  VOICE_EXTRACTION_QUEUE,
} from '../../api/src/voice/processors/voice-extraction.processor';
import { VOICE_TRANSCRIPTION_QUEUE } from '../../api/src/voice/services/voice.service';

// ── Dashboard ────────────────────────────────────────────────────────────────
import {
  DashboardRefreshWorker,
  DASHBOARD_QUEUE,
} from '../../api/src/dashboard/workers/dashboard-refresh.worker';

@Module({
  imports: [
    // Feature modules — processors are NOT in their providers[], so importing
    // them here does not cause double-registration. NestJS reuses the same
    // module instance if it was already loaded by WorkerModule.
    AiModule,
    ThemeModule,
    CustomerModule,
    DigestModule,
    IntegrationsModule,
    PrioritizationModule,
    PublicPortalModule,
    PurgeModule,
    SupportModule,
    SurveyModule,
    VoiceModule,
    DashboardModule,

    // Queue registrations — required for @InjectQueue() in processor constructors.
    // BullModule deduplicates registrations so registering the same queue name
    // twice (once in the feature module, once here) is safe.
    BullModule.registerQueue({ name: AI_ANALYSIS_QUEUE }),
    BullModule.registerQueue({ name: CIQ_SCORING_QUEUE }),
    BullModule.registerQueue({ name: AI_CLUSTERING_QUEUE }),
    BullModule.registerQueue({ name: CUSTOMER_REVENUE_SIGNAL_QUEUE }),
    BullModule.registerQueue({ name: CUSTOMER_SIGNAL_AGGREGATION_QUEUE }),
    BullModule.registerQueue({ name: DIGEST_QUEUE }),
    BullModule.registerQueue({ name: SLACK_INGESTION_QUEUE }),
    BullModule.registerQueue({ name: PRIORITIZATION_QUEUE }),
    BullModule.registerQueue({ name: PORTAL_SIGNAL_QUEUE }),
    BullModule.registerQueue({ name: PURGE_QUEUE }),
    BullModule.registerQueue({ name: 'support-sync' }),
    BullModule.registerQueue({ name: 'support-clustering' }),
    BullModule.registerQueue({ name: 'support-spike-detection' }),
    BullModule.registerQueue({ name: SURVEY_INTELLIGENCE_QUEUE }),
    BullModule.registerQueue({ name: VOICE_TRANSCRIPTION_QUEUE }),
    BullModule.registerQueue({ name: VOICE_EXTRACTION_QUEUE }),
    BullModule.registerQueue({ name: DASHBOARD_QUEUE }),
  ],
  providers: [
    // ── Stage-1: Semantic Intelligence ───────────────────────────────────────
    AiAnalysisProcessor,       // ai-analysis → embeddings, dedup, theme clustering
    CiqScoringProcessor,       // ciq-scoring → priority score computation
    ThemeClusteringProcessor,  // theme-clustering → theme assignment
    // ── Customer signals ─────────────────────────────────────────────────────
    CustomerRevenueSignalProcessor,
    CustomerSignalAggregationProcessor,
    // ── Digest ───────────────────────────────────────────────────────────────
    DigestProcessor,
    // ── Integrations ─────────────────────────────────────────────────────────
    SlackIngestionProcessor,
    // ── Prioritization ───────────────────────────────────────────────────────
    PrioritizationWorker,
    // ── Public portal ────────────────────────────────────────────────────────
    PortalSignalProcessor,
    // ── Purge ────────────────────────────────────────────────────────────────
    PurgeWorker,
    // ── Support ──────────────────────────────────────────────────────────────
    SyncProcessor,
    ClusteringProcessor,
    SpikeDetectionProcessor,
    // ── Survey ───────────────────────────────────────────────────────────────
    SurveyIntelligenceProcessor,
    // ── Voice ────────────────────────────────────────────────────────────────
    VoiceTranscriptionProcessor,
    VoiceExtractionProcessor,
    // ── Dashboard ────────────────────────────────────────────────────────────
    DashboardRefreshWorker,
  ],
})
export class WorkerProcessorsModule {}
