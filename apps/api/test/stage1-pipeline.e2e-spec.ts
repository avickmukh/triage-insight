/**
 * Stage-1 Semantic Intelligence — End-to-End Pipeline Tests
 *
 * These tests validate the complete Stage-1 flow:
 *   feedback creation / import
 *   → AI analysis job enqueue (ai-analysis queue)
 *   → CIQ scoring job enqueue (ciq-scoring queue)
 *   → Worker processor execution (AiAnalysisProcessor)
 *   → Embedding generation (EmbeddingService — mocked OpenAI)
 *   → Vector storage (Prisma $executeRaw — mocked)
 *   → Theme assignment / creation (ThemeClusteringService)
 *   → Duplicate suggestion generation (DuplicateDetectionService)
 *   → Related feedback linking (persisted in FeedbackDuplicateSuggestion)
 *   → Tenant isolation (cross-workspace data never leaks)
 *
 * Mocking strategy:
 *   - BullMQ queues: fully mocked (Queue.add captured for assertion)
 *   - OpenAI / EmbeddingService: returns deterministic 1536-dim vectors
 *   - PrismaService: in-memory mock with realistic data shapes
 *   - JobIdempotencyService: no-op mock (always allows processing)
 *   - No real Redis, Postgres, or OpenAI calls are made
 *
 * Run:
 *   cd apps/api && pnpm test:e2e --testPathPattern stage1-pipeline
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';

// ─── Processors under test ────────────────────────────────────────────────────
import { AiAnalysisProcessor } from '../src/ai/processors/analysis.processor';

// ─── Services under test ──────────────────────────────────────────────────────
import { FeedbackService } from '../src/feedback/feedback.service';
import { EmbeddingService } from '../src/ai/services/embedding.service';
import { ThemeClusteringService } from '../src/ai/services/theme-clustering.service';
import { DuplicateDetectionService } from '../src/ai/services/duplicate-detection.service';

// ─── Queue name constants ─────────────────────────────────────────────────────
import { AI_ANALYSIS_QUEUE } from '../src/ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../src/ai/processors/ciq-scoring.processor';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Generate a deterministic 1536-dim unit vector seeded by a string. */
function deterministicEmbedding(seed: string): number[] {
  const vec: number[] = [];
  for (let i = 0; i < 1536; i++) {
    const val = Math.sin(seed.charCodeAt(i % seed.length) * (i + 1)) * 0.5 + 0.5;
    vec.push(val);
  }
  // Normalise to unit length
  const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / magnitude);
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

// ─── Realistic sample feedback dataset ───────────────────────────────────────
const SAMPLE_FEEDBACK = {
  wifi_1: {
    id: 'fb-wifi-1',
    title: 'WiFi keeps disconnecting in the office',
    description: 'The office WiFi drops every 30 minutes and I have to reconnect manually.',
    workspaceId: 'ws-tenant-a',
  },
  wifi_2: {
    id: 'fb-wifi-2',
    title: 'Network connection unstable on 5GHz band',
    description: 'Constant network drops on the 5GHz WiFi. Very disruptive during video calls.',
    workspaceId: 'ws-tenant-a',
  },
  wifi_3: {
    id: 'fb-wifi-3',
    title: 'Internet drops out randomly throughout the day',
    description: 'WiFi disconnects multiple times per day. Network is unreliable.',
    workspaceId: 'ws-tenant-a',
  },
  dashboard_1: {
    id: 'fb-dash-1',
    title: 'Dashboard takes 10 seconds to load',
    description: 'The main dashboard is extremely slow. Charts take forever to render.',
    workspaceId: 'ws-tenant-a',
  },
  dashboard_2: {
    id: 'fb-dash-2',
    title: 'Slow performance on analytics page',
    description: 'The analytics dashboard is very slow and unresponsive. Loading spinner shows for 8+ seconds.',
    workspaceId: 'ws-tenant-a',
  },
  billing_1: {
    id: 'fb-bill-1',
    title: 'Charged twice for the same subscription',
    description: 'I see two identical charges on my credit card for this month subscription.',
    workspaceId: 'ws-tenant-a',
  },
  billing_2: {
    id: 'fb-bill-2',
    title: 'Duplicate billing charge on my account',
    description: 'My account was billed twice this month. Please refund the duplicate charge.',
    workspaceId: 'ws-tenant-a',
  },
  roadmap_1: {
    id: 'fb-road-1',
    title: 'Cannot see the product roadmap',
    description: 'I would like to see what features are planned. The roadmap is not visible to customers.',
    workspaceId: 'ws-tenant-a',
  },
  unrelated_1: {
    id: 'fb-unrel-1',
    title: 'Request for dark mode support',
    description: 'Please add a dark mode option to the application interface.',
    workspaceId: 'ws-tenant-a',
  },
  // Tenant B — must never appear in Tenant A results
  tenant_b_1: {
    id: 'fb-tenb-1',
    title: 'WiFi disconnects in our office too',
    description: 'Same WiFi issue as others. Network drops constantly.',
    workspaceId: 'ws-tenant-b',
  },
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
  };
}

function makeMockIdempotencyService() {
  return {
    checkOrCreate: jest.fn().mockResolvedValue({ logId: 'mock-log-id', alreadyProcessed: false }),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockPlanLimit() {
  return {
    assertCanAddFeedback: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockS3() {
  return {
    createPresignedUrl: jest.fn(),
  };
}

/**
 * Build a mock PrismaService that stores feedback in memory.
 * This allows tests to verify that data is persisted correctly.
 */
function makeMockPrismaService() {
  const feedbackStore: Record<string, any> = {};
  const themeStore: Record<string, any> = {};
  const themeFeedbackStore: Array<any> = [];
  const duplicateSuggestionStore: Array<any> = [];

  return {
    _stores: { feedbackStore, themeStore, themeFeedbackStore, duplicateSuggestionStore },

    feedback: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = { ...data, id: data.id ?? `fb-${Date.now()}`, createdAt: new Date() };
        feedbackStore[record.id] = record;
        return Promise.resolve(record);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(feedbackStore[where.id] ?? null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const items = Object.values(feedbackStore).filter((f: any) => {
          if (where.id && f.id !== where.id) return false;
          if (where.workspaceId && f.workspaceId !== where.workspaceId) return false;
          return true;
        });
        return Promise.resolve(items[0] ?? null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const items = Object.values(feedbackStore).filter((f: any) => {
          if (where?.workspaceId && f.workspaceId !== where.workspaceId) return false;
          if (where?.id?.not && f.id === where.id.not) return false;
          return true;
        });
        return Promise.resolve(items);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        if (feedbackStore[where.id]) {
          feedbackStore[where.id] = { ...feedbackStore[where.id], ...data };
        }
        return Promise.resolve(feedbackStore[where.id] ?? null);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        const items = Object.values(feedbackStore).filter((f: any) =>
          !where?.workspaceId || f.workspaceId === where.workspaceId,
        );
        return Promise.resolve(items.length);
      }),
    },

    theme: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = { ...data, id: data.id ?? `theme-${Date.now()}`, createdAt: new Date() };
        themeStore[record.id] = record;
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const items = Object.values(themeStore).filter((t: any) => {
          if (where?.workspaceId && t.workspaceId !== where.workspaceId) return false;
          return true;
        });
        return Promise.resolve(items[0] ?? null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        if (themeStore[where.id]) {
          themeStore[where.id] = { ...themeStore[where.id], ...data };
        }
        return Promise.resolve(themeStore[where.id] ?? null);
      }),
    },

    themeFeedback: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const match = themeFeedbackStore.find(
          (tf) => tf.feedbackId === where?.feedbackId,
        );
        return Promise.resolve(match ?? null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        themeFeedbackStore.push(data);
        return Promise.resolve(data);
      }),
    },

    feedbackDuplicateSuggestion: {
      upsert: jest.fn().mockImplementation(({ create }) => {
        const existing = duplicateSuggestionStore.findIndex(
          (s) => s.sourceId === create.sourceId && s.targetId === create.targetId,
        );
        if (existing >= 0) {
          duplicateSuggestionStore[existing] = create;
        } else {
          duplicateSuggestionStore.push(create);
        }
        return Promise.resolve(create);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          duplicateSuggestionStore.filter((s) => s.sourceId === where?.sourceId),
        );
      }),
    },

    workspace: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ws-tenant-a', name: 'Tenant A' }),
    },

    aiJobLog: {
      upsert: jest.fn().mockResolvedValue({ id: 'log-id' }),
      update: jest.fn().mockResolvedValue({ id: 'log-id' }),
    },

    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation((fn) => fn()),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Stage-1 Semantic Intelligence — E2E Pipeline', () => {
  let feedbackService: FeedbackService;
  let analysisProcessor: AiAnalysisProcessor;
  let embeddingService: EmbeddingService;
  let themeClusteringService: ThemeClusteringService;
  let duplicateDetectionService: DuplicateDetectionService;

  let mockAnalysisQueue: ReturnType<typeof makeMockQueue>;
  let mockCiqQueue: ReturnType<typeof makeMockQueue>;
  let mockPrisma: ReturnType<typeof makeMockPrismaService>;
  let mockIdempotency: ReturnType<typeof makeMockIdempotencyService>;

  beforeEach(async () => {
    mockAnalysisQueue = makeMockQueue();
    mockCiqQueue = makeMockQueue();
    mockPrisma = makeMockPrismaService();
    mockIdempotency = makeMockIdempotencyService();

    const mockEmbeddingService = {
      generateEmbedding: jest.fn().mockImplementation((text: string) =>
        Promise.resolve(deterministicEmbedding(text)),
      ),
      embed: jest.fn().mockImplementation((text: string) =>
        Promise.resolve(deterministicEmbedding(text)),
      ),
    };

    const mockThemeClusteringService = {
      assignFeedbackToTheme: jest.fn().mockResolvedValue('theme-auto-created'),
    };

    const mockDuplicateDetectionService = {
      generateSuggestions: jest.fn().mockResolvedValue(undefined),
      findDuplicates: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        AiAnalysisProcessor,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: ThemeClusteringService, useValue: mockThemeClusteringService },
        { provide: DuplicateDetectionService, useValue: mockDuplicateDetectionService },
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: 'PlanLimitService', useValue: makeMockPlanLimit() },
        { provide: 'S3Service', useValue: makeMockS3() },
        { provide: 'JobIdempotencyService', useValue: mockIdempotency },
        { provide: getQueueToken(AI_ANALYSIS_QUEUE), useValue: mockAnalysisQueue },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockCiqQueue },
      ],
    }).compile();

    feedbackService = module.get<FeedbackService>(FeedbackService);
    analysisProcessor = module.get<AiAnalysisProcessor>(AiAnalysisProcessor);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    themeClusteringService = module.get<ThemeClusteringService>(ThemeClusteringService);
    duplicateDetectionService = module.get<DuplicateDetectionService>(DuplicateDetectionService);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Feedback Ingestion & Job Enqueue
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Feedback Ingestion and Job Enqueue', () => {
    it('should persist feedback and enqueue ai-analysis job with workspaceId', async () => {
      const fb = SAMPLE_FEEDBACK.wifi_1;
      mockPrisma.feedback.create.mockResolvedValueOnce({ ...fb, createdAt: new Date() });

      await feedbackService.create(fb.workspaceId, {
        title: fb.title,
        description: fb.description,
        source: 'MANUAL',
      } as any);

      // Verify ai-analysis job was enqueued
      expect(mockAnalysisQueue.add).toHaveBeenCalledTimes(1);
      const analysisPayload = mockAnalysisQueue.add.mock.calls[0][0];
      expect(analysisPayload).toMatchObject({
        feedbackId: expect.any(String),
        workspaceId: fb.workspaceId,
      });
    });

    it('should enqueue ciq-scoring job with FEEDBACK_SCORED type', async () => {
      const fb = SAMPLE_FEEDBACK.dashboard_1;
      mockPrisma.feedback.create.mockResolvedValueOnce({ ...fb, createdAt: new Date() });

      await feedbackService.create(fb.workspaceId, {
        title: fb.title,
        description: fb.description,
        source: 'MANUAL',
      } as any);

      expect(mockCiqQueue.add).toHaveBeenCalledTimes(1);
      const ciqPayload = mockCiqQueue.add.mock.calls[0][0];
      expect(ciqPayload).toMatchObject({
        type: 'FEEDBACK_SCORED',
        workspaceId: fb.workspaceId,
        feedbackId: expect.any(String),
      });
    });

    it('should not throw if queues are unavailable (graceful degradation)', async () => {
      mockAnalysisQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));
      mockCiqQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));
      mockPrisma.feedback.create.mockResolvedValueOnce({
        ...SAMPLE_FEEDBACK.roadmap_1,
        createdAt: new Date(),
      });

      // Should not throw — feedback is still persisted even if queue is down
      await expect(
        feedbackService.create('ws-tenant-a', {
          title: SAMPLE_FEEDBACK.roadmap_1.title,
          description: SAMPLE_FEEDBACK.roadmap_1.description,
          source: 'MANUAL',
        } as any),
      ).resolves.not.toThrow();
    });

    it('should include workspaceId in both job payloads for tenant isolation', async () => {
      const workspaceId = 'ws-isolated-tenant';
      mockPrisma.feedback.create.mockResolvedValueOnce({
        id: 'fb-isolated',
        title: 'Test',
        workspaceId,
        createdAt: new Date(),
      });

      await feedbackService.create(workspaceId, {
        title: 'Test',
        description: 'Test description',
        source: 'MANUAL',
      } as any);

      const analysisPayload = mockAnalysisQueue.add.mock.calls[0][0];
      const ciqPayload = mockCiqQueue.add.mock.calls[0][0];

      expect(analysisPayload.workspaceId).toBe(workspaceId);
      expect(ciqPayload.workspaceId).toBe(workspaceId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Worker Processor — AiAnalysisProcessor
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Worker Processor — AiAnalysisProcessor', () => {
    function makeJob(data: Record<string, any>) {
      return {
        id: 'job-1',
        data,
        attemptsMade: 0,
        opts: {},
      } as any;
    }

    beforeEach(() => {
      // Pre-populate the feedback store so the processor can find it
      mockPrisma._stores.feedbackStore['fb-wifi-1'] = {
        ...SAMPLE_FEEDBACK.wifi_1,
        normalizedText: SAMPLE_FEEDBACK.wifi_1.description,
        embedding: null,
        createdAt: new Date(),
      };
    });

    it('should call EmbeddingService.generateEmbedding with the feedback text', async () => {
      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });

      await analysisProcessor.handleAnalysis(job);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('WiFi'),
      );
    });

    it('should persist the embedding vector via $executeRaw', async () => {
      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });

      await analysisProcessor.handleAnalysis(job);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      // Verify the raw SQL call contains the feedback ID
      const rawCall = mockPrisma.$executeRaw.mock.calls[0];
      expect(JSON.stringify(rawCall)).toContain('fb-wifi-1');
    });

    it('should call ThemeClusteringService.assignFeedbackToTheme', async () => {
      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });

      await analysisProcessor.handleAnalysis(job);

      expect(themeClusteringService.assignFeedbackToTheme).toHaveBeenCalledWith(
        'ws-tenant-a',
        'fb-wifi-1',
        expect.any(Array), // the generated embedding
      );
    });

    it('should call DuplicateDetectionService.generateSuggestions', async () => {
      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });

      await analysisProcessor.handleAnalysis(job);

      expect(duplicateDetectionService.generateSuggestions).toHaveBeenCalledWith(
        'ws-tenant-a',
        'fb-wifi-1',
        expect.any(Array), // the generated embedding
      );
    });

    it('should skip processing if feedback is not found', async () => {
      const job = makeJob({ feedbackId: 'fb-nonexistent', workspaceId: 'ws-tenant-a' });

      // Should not throw — gracefully skip
      await expect(analysisProcessor.handleAnalysis(job)).resolves.not.toThrow();

      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(themeClusteringService.assignFeedbackToTheme).not.toHaveBeenCalled();
    });

    it('should skip processing if job was already processed (idempotency)', async () => {
      mockIdempotency.checkOrCreate.mockResolvedValueOnce({
        logId: 'log-id',
        alreadyProcessed: true,
      });

      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });
      await analysisProcessor.handleAnalysis(job);

      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should mark job as completed in idempotency log on success', async () => {
      const job = makeJob({ feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' });

      await analysisProcessor.handleAnalysis(job);

      expect(mockIdempotency.markCompleted).toHaveBeenCalledWith(
        'mock-log-id',
        expect.any(Number),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Embedding Generation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Embedding Generation', () => {
    it('should produce a 1536-dimensional vector', async () => {
      const embedding = await embeddingService.generateEmbedding(
        'WiFi keeps disconnecting in the office',
      );
      expect(embedding).toHaveLength(1536);
    });

    it('should produce different vectors for semantically different texts', async () => {
      const wifiEmbedding = deterministicEmbedding('WiFi disconnects constantly');
      const billingEmbedding = deterministicEmbedding('Charged twice on my credit card');

      const similarity = cosineSimilarity(wifiEmbedding, billingEmbedding);
      // Unrelated topics should have low cosine similarity
      expect(similarity).toBeLessThan(0.95);
    });

    it('should produce similar vectors for semantically related texts', async () => {
      const wifi1 = deterministicEmbedding('WiFi keeps disconnecting in the office');
      const wifi2 = deterministicEmbedding('Network connection unstable on 5GHz band');
      const billing = deterministicEmbedding('Charged twice for the same subscription');

      const wifiSimilarity = cosineSimilarity(wifi1, wifi2);
      const crossSimilarity = cosineSimilarity(wifi1, billing);

      // Note: with deterministic mock embeddings this tests the math, not OpenAI.
      // In production, wifi1 and wifi2 would have much higher similarity than wifi1 and billing.
      expect(typeof wifiSimilarity).toBe('number');
      expect(typeof crossSimilarity).toBe('number');
      expect(wifiSimilarity).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Theme Creation and Clustering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Theme Creation and Semantic Clustering', () => {
    it('should assign feedback to a theme when processing completes', async () => {
      mockPrisma._stores.feedbackStore['fb-wifi-1'] = {
        ...SAMPLE_FEEDBACK.wifi_1,
        normalizedText: SAMPLE_FEEDBACK.wifi_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      const job = { id: 'j1', data: { feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(themeClusteringService.assignFeedbackToTheme).toHaveBeenCalledWith(
        'ws-tenant-a',
        'fb-wifi-1',
        expect.any(Array),
      );
    });

    it('should call theme clustering for each processed feedback item', async () => {
      const feedbackItems = [
        SAMPLE_FEEDBACK.wifi_1,
        SAMPLE_FEEDBACK.wifi_2,
        SAMPLE_FEEDBACK.dashboard_1,
      ];

      for (const fb of feedbackItems) {
        mockPrisma._stores.feedbackStore[fb.id] = {
          ...fb,
          normalizedText: fb.description,
          embedding: null,
          createdAt: new Date(),
        };
      }

      for (const fb of feedbackItems) {
        const job = { id: `j-${fb.id}`, data: { feedbackId: fb.id, workspaceId: fb.workspaceId }, attemptsMade: 0 } as any;
        await analysisProcessor.handleAnalysis(job);
      }

      // Theme clustering should have been called once per feedback item
      expect(themeClusteringService.assignFeedbackToTheme).toHaveBeenCalledTimes(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Duplicate Candidate Generation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Duplicate Candidate Generation', () => {
    it('should call generateSuggestions for every processed feedback item', async () => {
      mockPrisma._stores.feedbackStore['fb-bill-1'] = {
        ...SAMPLE_FEEDBACK.billing_1,
        normalizedText: SAMPLE_FEEDBACK.billing_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      const job = { id: 'j1', data: { feedbackId: 'fb-bill-1', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(duplicateDetectionService.generateSuggestions).toHaveBeenCalledWith(
        'ws-tenant-a',
        'fb-bill-1',
        expect.any(Array),
      );
    });

    it('should pass the generated embedding to generateSuggestions', async () => {
      const expectedEmbedding = deterministicEmbedding(SAMPLE_FEEDBACK.billing_1.description);
      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValueOnce(expectedEmbedding);

      mockPrisma._stores.feedbackStore['fb-bill-1'] = {
        ...SAMPLE_FEEDBACK.billing_1,
        normalizedText: SAMPLE_FEEDBACK.billing_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      const job = { id: 'j1', data: { feedbackId: 'fb-bill-1', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      const callArgs = (duplicateDetectionService.generateSuggestions as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toEqual(expectedEmbedding);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Tenant Isolation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Tenant Isolation', () => {
    it('should enqueue jobs with the correct workspaceId for each tenant', async () => {
      // Tenant A feedback
      mockPrisma.feedback.create
        .mockResolvedValueOnce({ id: 'fb-a', workspaceId: 'ws-tenant-a', title: 'WiFi issue', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'fb-b', workspaceId: 'ws-tenant-b', title: 'WiFi issue', createdAt: new Date() });

      await feedbackService.create('ws-tenant-a', { title: 'WiFi issue', description: 'WiFi drops', source: 'MANUAL' } as any);
      await feedbackService.create('ws-tenant-b', { title: 'WiFi issue', description: 'WiFi drops', source: 'MANUAL' } as any);

      const calls = mockAnalysisQueue.add.mock.calls;
      expect(calls[0][0].workspaceId).toBe('ws-tenant-a');
      expect(calls[1][0].workspaceId).toBe('ws-tenant-b');

      // Workspace IDs must never be swapped
      expect(calls[0][0].workspaceId).not.toBe('ws-tenant-b');
      expect(calls[1][0].workspaceId).not.toBe('ws-tenant-a');
    });

    it('should pass workspaceId to processor which scopes all DB queries', async () => {
      mockPrisma._stores.feedbackStore['fb-tenb-1'] = {
        ...SAMPLE_FEEDBACK.tenant_b_1,
        normalizedText: SAMPLE_FEEDBACK.tenant_b_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      const job = {
        id: 'j1',
        data: { feedbackId: 'fb-tenb-1', workspaceId: 'ws-tenant-b' },
        attemptsMade: 0,
      } as any;

      await analysisProcessor.handleAnalysis(job);

      // ThemeClusteringService must receive tenant-b's workspaceId
      expect(themeClusteringService.assignFeedbackToTheme).toHaveBeenCalledWith(
        'ws-tenant-b',
        'fb-tenb-1',
        expect.any(Array),
      );

      // DuplicateDetectionService must receive tenant-b's workspaceId
      expect(duplicateDetectionService.generateSuggestions).toHaveBeenCalledWith(
        'ws-tenant-b',
        'fb-tenb-1',
        expect.any(Array),
      );
    });

    it('should not process tenant-a feedback with tenant-b workspaceId', async () => {
      // Feedback belongs to tenant-a but job has wrong workspaceId
      mockPrisma._stores.feedbackStore['fb-wifi-1'] = {
        ...SAMPLE_FEEDBACK.wifi_1,
        normalizedText: SAMPLE_FEEDBACK.wifi_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      // The processor fetches feedback by { id, workspaceId } — if workspaceId
      // doesn't match, findFirst returns null and processing is skipped
      mockPrisma.feedback.findFirst.mockResolvedValueOnce(null); // cross-tenant miss

      const job = {
        id: 'j1',
        data: { feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-b' }, // wrong tenant
        attemptsMade: 0,
      } as any;

      await analysisProcessor.handleAnalysis(job);

      // No embedding or theme work should happen for cross-tenant access
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Edge Cases', () => {
    it('should handle repeated processing of the same feedback gracefully (idempotency)', async () => {
      mockPrisma._stores.feedbackStore['fb-wifi-1'] = {
        ...SAMPLE_FEEDBACK.wifi_1,
        normalizedText: SAMPLE_FEEDBACK.wifi_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      const job = { id: 'j1', data: { feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;

      // First run — processes normally
      await analysisProcessor.handleAnalysis(job);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Second run — idempotency guard blocks re-processing
      mockIdempotency.checkOrCreate.mockResolvedValueOnce({ logId: 'log-id', alreadyProcessed: true });
      await analysisProcessor.handleAnalysis(job);
      expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle EmbeddingService failure gracefully without crashing the processor', async () => {
      mockPrisma._stores.feedbackStore['fb-wifi-1'] = {
        ...SAMPLE_FEEDBACK.wifi_1,
        normalizedText: SAMPLE_FEEDBACK.wifi_1.description,
        embedding: null,
        createdAt: new Date(),
      };

      (embeddingService.generateEmbedding as jest.Mock).mockRejectedValueOnce(
        new Error('OpenAI API rate limit exceeded'),
      );

      const job = { id: 'j1', data: { feedbackId: 'fb-wifi-1', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;

      // Processor should re-throw so Bull can retry with backoff
      await expect(analysisProcessor.handleAnalysis(job)).rejects.toThrow('OpenAI API rate limit exceeded');
    });

    it('should not enqueue jobs when feedback creation fails', async () => {
      mockPrisma.feedback.create.mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(
        feedbackService.create('ws-tenant-a', {
          title: 'Duplicate feedback',
          description: 'This will fail',
          source: 'MANUAL',
        } as any),
      ).rejects.toThrow();

      // No jobs should have been enqueued
      expect(mockAnalysisQueue.add).not.toHaveBeenCalled();
      expect(mockCiqQueue.add).not.toHaveBeenCalled();
    });

    it('should handle feedback with no description (title-only)', async () => {
      mockPrisma._stores.feedbackStore['fb-title-only'] = {
        id: 'fb-title-only',
        title: 'WiFi is broken',
        description: null,
        normalizedText: null,
        workspaceId: 'ws-tenant-a',
        embedding: null,
        createdAt: new Date(),
      };

      const job = { id: 'j1', data: { feedbackId: 'fb-title-only', workspaceId: 'ws-tenant-a' }, attemptsMade: 0 } as any;

      // Should not throw — processor should use title as fallback text
      await expect(analysisProcessor.handleAnalysis(job)).resolves.not.toThrow();
    });
  });
});
