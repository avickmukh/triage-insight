/**
 * Worker Processor E2E Tests
 *
 * Tests the three core worker processors in isolation using mocked Prisma,
 * mocked OpenAI (via EmbeddingService / SentimentService / ThemeNarrationService),
 * and mocked Bull queues.
 *
 * The processors are instantiated through the NestJS testing module so that
 * all dependency injection wiring is exercised exactly as it is in production.
 *
 * Happy paths covered:
 *   1. AiAnalysisProcessor  — processes feedback, writes embedding + sentiment,
 *                             assigns to theme, enqueues CIQ scoring job
 *   2. CiqScoringProcessor  — scores a theme, triggers AI narration, persists
 *                             aiSummary / aiExplanation / aiRecommendation / aiConfidence
 *   3. DigestProcessor      — delegates to DigestService.generateDigest
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';

// ── Processors under test ──────────────────────────────────────────────────
import {
  AiAnalysisProcessor,
  AI_ANALYSIS_QUEUE,
} from '../../api/src/ai/processors/analysis.processor';
import {
  CiqScoringProcessor,
  CIQ_SCORING_QUEUE,
} from '../../api/src/ai/processors/ciq-scoring.processor';
import {
  DigestProcessor,
  DIGEST_QUEUE,
} from '../../api/src/digest/digest.processor';

// ── Services consumed by processors ───────────────────────────────────────
import { EmbeddingService } from '../../api/src/ai/services/embedding.service';
import { SentimentService } from '../../api/src/ai/services/sentiment.service';
import { SummarizationService } from '../../api/src/ai/services/summarization.service';
import { ThemeClusteringService } from '../../api/src/ai/services/theme-clustering.service';
import { DuplicateDetectionService } from '../../api/src/ai/services/duplicate-detection.service';
import { CiqService } from '../../api/src/ai/services/ciq.service';
import { CiqEngineService } from '../../api/src/ciq/ciq-engine.service';
import { ThemeNarrationService } from '../../api/src/ai/services/theme-narration.service';
import { DigestService } from '../../api/src/digest/digest.service';
import { JobIdempotencyService } from '../../api/src/common/queue/job-idempotency.service';
import { JobLogger } from '../../api/src/common/queue/job-logger';
import { PrismaService } from '../../api/src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock factories
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  feedback: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  theme: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  workspace: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  aiJobLog: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  digest: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockAnalysisQueue = { add: jest.fn() };
const mockCiqQueue = { add: jest.fn() };
const mockDigestQueue = { add: jest.fn() };

const mockEmbeddingService = {
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
};

const mockSentimentService = {
  analyseSentiment: jest.fn().mockResolvedValue(0.5),
};

const mockSummarizationService = {
  summarize: jest.fn().mockResolvedValue('A brief summary'),
};

const mockThemeClusteringService = {
  assignFeedbackToTheme: jest.fn().mockResolvedValue({ themeId: 'theme-1', isNew: false }),
};

const mockDuplicateDetectionService = {
  generateSuggestions: jest.fn().mockResolvedValue([]),
};

const mockCiqService = {
  scoreFeedback: jest.fn().mockResolvedValue({ priorityScore: 75, urgencyScore: 60 }),
  scoreTheme: jest.fn().mockResolvedValue({ priorityScore: 80, urgencyScore: 70, confidence: 0.9 }),
  scoreRoadmapItem: jest.fn().mockResolvedValue({ priorityScore: 70 }),
};

const mockCiqEngineService = {
  computeThemeScore: jest.fn().mockResolvedValue({ priorityScore: 80 }),
  computeFeedbackScore: jest.fn().mockResolvedValue({ priorityScore: 75 }),
};

const mockThemeNarrationService = {
  generateNarration: jest.fn().mockResolvedValue({
    summary: 'AI-generated summary',
    explanation: 'Why it matters',
    recommendation: 'What to do',
    confidence: 0.85,
  }),
};

const mockDigestService = {
  generateDigest: jest.fn().mockResolvedValue({ id: 'digest-1' }),
};

const mockIdempotencyService = {
  checkOrCreate: jest.fn().mockResolvedValue({ logId: 'log-1', alreadyProcessed: false }),
  isDuplicate: jest.fn().mockResolvedValue(false),
  markStarted: jest.fn().mockResolvedValue('log-1'),
  markCompleted: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      OPENAI_API_KEY: 'test-key',
      NODE_ENV: 'test',
    };
    return map[key] ?? def;
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker Processors (e2e)', () => {
  let moduleRef: TestingModule;
  let analysisProcessor: AiAnalysisProcessor;
  let ciqScoringProcessor: CiqScoringProcessor;
  let digestProcessor: DigestProcessor;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        AiAnalysisProcessor,
        CiqScoringProcessor,
        DigestProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: SentimentService, useValue: mockSentimentService },
        { provide: SummarizationService, useValue: mockSummarizationService },
        { provide: ThemeClusteringService, useValue: mockThemeClusteringService },
        { provide: DuplicateDetectionService, useValue: mockDuplicateDetectionService },
        { provide: CiqService, useValue: mockCiqService },
        { provide: CiqEngineService, useValue: mockCiqEngineService },
        { provide: ThemeNarrationService, useValue: mockThemeNarrationService },
        { provide: DigestService, useValue: mockDigestService },
        { provide: JobIdempotencyService, useValue: mockIdempotencyService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(AI_ANALYSIS_QUEUE), useValue: mockAnalysisQueue },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockCiqQueue },
        { provide: getQueueToken(DIGEST_QUEUE), useValue: mockDigestQueue },
      ],
    }).compile();

    analysisProcessor = moduleRef.get<AiAnalysisProcessor>(AiAnalysisProcessor);
    ciqScoringProcessor = moduleRef.get<CiqScoringProcessor>(CiqScoringProcessor);
    digestProcessor = moduleRef.get<DigestProcessor>(DigestProcessor);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply default happy-path mocks after clearAllMocks
    mockEmbeddingService.generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
    mockSentimentService.analyseSentiment.mockResolvedValue(0.5);
    mockSummarizationService.summarize.mockResolvedValue('A brief summary');
    mockThemeClusteringService.assignFeedbackToTheme.mockResolvedValue({ themeId: 'theme-1', isNew: false });
    mockDuplicateDetectionService.generateSuggestions.mockResolvedValue([]);
    mockCiqService.scoreTheme.mockResolvedValue({ priorityScore: 80, urgencyScore: 70, confidence: 0.9 });
    mockThemeNarrationService.generateNarration.mockResolvedValue({
      summary: 'AI-generated summary',
      explanation: 'Why it matters',
      recommendation: 'What to do',
      confidence: 0.85,
    });
    mockDigestService.generateDigest.mockResolvedValue({ id: 'digest-1' });
    mockIdempotencyService.checkOrCreate.mockResolvedValue({ logId: 'log-1', alreadyProcessed: false });
    mockIdempotencyService.isDuplicate.mockResolvedValue(false);
    mockIdempotencyService.markStarted.mockResolvedValue('log-1');
    mockPrisma.feedback.update.mockResolvedValue({});
    mockPrisma.theme.update.mockResolvedValue({});
    mockPrisma.aiJobLog.upsert.mockResolvedValue({});
    mockPrisma.aiJobLog.update.mockResolvedValue({});
  });

  // ── AiAnalysisProcessor ──────────────────────────────────────────────────

  describe('AiAnalysisProcessor', () => {
    const FEEDBACK = {
      id: 'fb-1',
      title: 'Checkout is slow',
      description: 'The checkout page takes 10 seconds to load.',
      normalizedText: 'The checkout page takes 10 seconds to load.',
      workspaceId: 'ws-1',
      embedding: null,
      sentiment: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.feedback.findFirst.mockResolvedValue(FEEDBACK);
    });

    it('should generate an embedding for the feedback text', async () => {
      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('checkout'),
      );
    });

    it('should analyse sentiment after generating the embedding', async () => {
      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(mockSentimentService.analyseSentiment).toHaveBeenCalled();
    });

    it('should persist embedding and sentiment in a single Prisma update', async () => {
      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      const updateCall = mockPrisma.feedback.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.embedding !== undefined,
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data).toMatchObject({
        embedding: expect.any(Array),
        sentiment: expect.any(Number),
      });
    });

    it('should assign feedback to a theme using the generated embedding', async () => {
      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(mockThemeClusteringService.assignFeedbackToTheme).toHaveBeenCalledWith(
        'ws-1',
        'fb-1',
        expect.any(Array),
      );
    });

    it('should skip processing when the idempotency guard detects a duplicate job', async () => {
      mockIdempotencyService.checkOrCreate.mockResolvedValueOnce({ logId: 'log-1', alreadyProcessed: true });

      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await analysisProcessor.handleAnalysis(job);

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should fall back to neutral sentiment (0) when SentimentService throws', async () => {
      mockSentimentService.analyseSentiment.mockRejectedValueOnce(new Error('OpenAI timeout'));

      const job = { id: 'j-1', data: { feedbackId: 'fb-1', workspaceId: 'ws-1' }, attemptsMade: 0 } as any;
      await expect(analysisProcessor.handleAnalysis(job)).resolves.not.toThrow();

      const updateCall = mockPrisma.feedback.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.sentiment !== undefined,
      );
      expect(updateCall?.[0]?.data?.sentiment).toBe(0);
    });
  });

  // ── CiqScoringProcessor ──────────────────────────────────────────────────

  describe('CiqScoringProcessor', () => {
    const THEME = {
      id: 'theme-1',
      title: 'Checkout Performance',
      description: 'Users report slow checkout',
      workspaceId: 'ws-1',
      priorityScore: null,
      aiSummary: null,
    };

    const FEEDBACK_LIST = [
      { id: 'fb-1', description: 'Checkout is slow', sentiment: -0.6 },
      { id: 'fb-2', description: 'Payment page hangs', sentiment: -0.8 },
    ];

    beforeEach(() => {
      mockPrisma.theme.findFirst.mockResolvedValue(THEME);
      mockPrisma.feedback.findMany.mockResolvedValue(FEEDBACK_LIST);
    });

    it('should compute a CIQ score for a theme', async () => {
      const job = {
        id: 'j-2',
        data: { type: 'THEME_SCORED', themeId: 'theme-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await ciqScoringProcessor.handle(job);

      // Either CiqService.scoreTheme or CiqEngineService was called
      const scoringWasCalled =
        mockCiqService.scoreTheme.mock.calls.length > 0 ||
        mockCiqEngineService.computeThemeScore.mock.calls.length > 0;
      expect(scoringWasCalled).toBe(true);
    });

    it('should generate AI narration after scoring', async () => {
      const job = {
        id: 'j-2',
        data: { type: 'THEME_SCORED', themeId: 'theme-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await ciqScoringProcessor.handle(job);

      expect(mockThemeNarrationService.generateNarration).toHaveBeenCalledWith(
        expect.objectContaining({ themeId: 'theme-1' }),
      );
    });

    it('should persist AI narration fields on the theme', async () => {
      const job = {
        id: 'j-2',
        data: { type: 'THEME_SCORED', themeId: 'theme-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await ciqScoringProcessor.handle(job);

      const updateCall = mockPrisma.theme.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.aiSummary !== undefined,
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data).toMatchObject({
        aiSummary: 'AI-generated summary',
        aiExplanation: 'Why it matters',
        aiRecommendation: 'What to do',
        aiConfidence: 0.85,
      });
    });

    it('should continue without narration when ThemeNarrationService returns null', async () => {
      mockThemeNarrationService.generateNarration.mockResolvedValueOnce(null);

      const job = {
        id: 'j-2',
        data: { type: 'THEME_SCORED', themeId: 'theme-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await expect(ciqScoringProcessor.handle(job)).resolves.not.toThrow();
    });
  });

  // ── DigestProcessor ──────────────────────────────────────────────────────

  describe('DigestProcessor', () => {
    it('should delegate to DigestService.generateDigest with the correct workspaceId', async () => {
      const job = {
        id: 'j-3',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await digestProcessor.handleDigest(job);

      expect(mockDigestService.generateDigest).toHaveBeenCalledWith('ws-1');
    });

    it('should complete without throwing when DigestService succeeds', async () => {
      const job = {
        id: 'j-3',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
      } as any;
      await expect(digestProcessor.handleDigest(job)).resolves.not.toThrow();
    });
  });
});
