import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ThemeClusteringService } from './theme-clustering.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  themeFeedback: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  feedback: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  theme: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockEmbeddingService = {
  generateEmbedding: jest.fn(),
};

const mockCiqQueue = {
  add: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ThemeClusteringService', () => {
  let service: ThemeClusteringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThemeClusteringService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockCiqQueue },
      ],
    }).compile();

    service = module.get<ThemeClusteringService>(ThemeClusteringService);
    jest.clearAllMocks();
  });

  // ── assignFeedbackToTheme ───────────────────────────────────────────────────

  describe('assignFeedbackToTheme', () => {
    it('should return existing themeId and skip if feedback is already linked', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue({
        themeId: 'existing-theme-id',
        feedbackId: 'feedback-id',
      });

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(result).toBe('existing-theme-id');
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('should generate an embedding when none is provided', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Test feedback',
        description: 'Some description',
        workspaceId: 'ws-id',
      });

      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);

      // No matching themes above threshold → creates new theme
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'new-theme-id', title: 'Test feedback' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(result).toBe('new-theme-id');
    });

    it('should use a provided embedding without calling EmbeddingService', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Test feedback',
        description: null,
        workspaceId: 'ws-id',
      });

      const providedEmbedding = Array.from({ length: 1536 }, () => 0.1);

      // Simulate a matching theme above the 0.8 threshold
      mockPrismaService.$queryRaw.mockResolvedValue([
        { id: 'existing-theme-id', similarity: 0.92 },
      ]);
      mockPrismaService.themeFeedback.upsert.mockResolvedValue({});
      // recomputeClusterConfidence calls
      mockPrismaService.themeFeedback.findMany
        .mockResolvedValueOnce([{ confidence: 0.92 }])   // AI-assigned links
        .mockResolvedValueOnce([{ feedback: { title: 'Test feedback' } }]); // all links for keywords
      mockPrismaService.theme.update.mockResolvedValue({});
      mockCiqQueue.add.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id', providedEmbedding);

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(result).toBe('existing-theme-id');
    });

    it('should create a new AI_GENERATED theme when no existing theme meets the similarity threshold', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Completely new topic',
        description: null,
        workspaceId: 'ws-id',
      });

      const mockEmbedding = Array.from({ length: 1536 }, () => 0.5);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);

      // No themes above threshold
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'ai-generated-theme-id', title: 'Completely new topic' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(mockPrismaService.theme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'AI_GENERATED', workspaceId: 'ws-id' }),
        }),
      );
      expect(result).toBe('ai-generated-theme-id');
    });
  });

  // ── Confidence Scoring ────────────────────────────────────────────────────

  describe('Confidence Scoring (PRD Part 1)', () => {
    it('should seed a new candidate theme with clusterConfidence=10 (single-item cluster)', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-1',
        title: 'Dark mode support',
        description: null,
        workspaceId: 'ws-1',
      });
      mockEmbeddingService.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-1', title: 'Dark mode support' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-1', 'fb-1');

      const createCall = mockPrismaService.theme.create.mock.calls[0][0];
      expect(createCall.data.clusterConfidence).toBe(10);
      expect(createCall.data.confidenceFactors).toEqual({ avgSimilarity: 1.0, size: 1, variance: 0 });
      expect(createCall.data.outlierCount).toBe(0);
    });

    it('should recompute clusterConfidence after assigning feedback to an existing theme', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-2',
        title: 'Slow dashboard loading',
        description: null,
        workspaceId: 'ws-1',
      });
      const embedding = Array.from({ length: 1536 }, () => 0.2);
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 'theme-perf', similarity: 0.88 }]);
      mockPrismaService.themeFeedback.upsert.mockResolvedValue({});

      // Simulate 3 AI-assigned feedback items with high similarity
      mockPrismaService.themeFeedback.findMany
        .mockResolvedValueOnce([
          { confidence: 0.88 },
          { confidence: 0.91 },
          { confidence: 0.85 },
        ])
        .mockResolvedValueOnce([
          { feedback: { title: 'Slow dashboard loading' } },
          { feedback: { title: 'Dashboard takes too long' } },
          { feedback: { title: 'Performance issue in dashboard' } },
        ]);
      mockPrismaService.theme.update.mockResolvedValue({});
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-1', 'fb-2', embedding);

      expect(mockPrismaService.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'theme-perf' },
          data: expect.objectContaining({
            clusterConfidence: expect.any(Number),
            confidenceFactors: expect.objectContaining({
              avgSimilarity: expect.any(Number),
              size: 3,
              variance: expect.any(Number),
            }),
            outlierCount: 0, // all above 0.75 threshold
          }),
        }),
      );

      const updateCall = mockPrismaService.theme.update.mock.calls[0][0];
      // avgSimilarity ≈ 0.88 → confidence should be reasonably high
      expect(updateCall.data.clusterConfidence).toBeGreaterThan(50);
    });

    it('should count outliers when similarity is below 0.75', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-3',
        title: 'Unrelated topic',
        description: null,
        workspaceId: 'ws-1',
      });
      const embedding = Array.from({ length: 1536 }, () => 0.3);
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 'theme-mixed', similarity: 0.82 }]);
      mockPrismaService.themeFeedback.upsert.mockResolvedValue({});

      // 2 of 4 items have similarity below 0.75 → outlierCount = 2
      mockPrismaService.themeFeedback.findMany
        .mockResolvedValueOnce([
          { confidence: 0.82 },
          { confidence: 0.70 }, // outlier
          { confidence: 0.68 }, // outlier
          { confidence: 0.85 },
        ])
        .mockResolvedValueOnce([
          { feedback: { title: 'Topic A' } },
          { feedback: { title: 'Unrelated topic' } },
          { feedback: { title: 'Topic B' } },
          { feedback: { title: 'Topic C' } },
        ]);
      mockPrismaService.theme.update.mockResolvedValue({});
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-1', 'fb-3', embedding);

      const updateCall = mockPrismaService.theme.update.mock.calls[0][0];
      expect(updateCall.data.outlierCount).toBe(2);
    });

    it('should extract top keywords from feedback titles', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-4',
        title: 'Mobile navigation broken',
        description: null,
        workspaceId: 'ws-1',
      });
      const embedding = Array.from({ length: 1536 }, () => 0.4);
      mockPrismaService.$queryRaw.mockResolvedValue([{ id: 'theme-nav', similarity: 0.90 }]);
      mockPrismaService.themeFeedback.upsert.mockResolvedValue({});

      mockPrismaService.themeFeedback.findMany
        .mockResolvedValueOnce([{ confidence: 0.90 }, { confidence: 0.88 }])
        .mockResolvedValueOnce([
          { feedback: { title: 'Mobile navigation broken' } },
          { feedback: { title: 'Navigation menu mobile broken' } },
        ]);
      mockPrismaService.theme.update.mockResolvedValue({});
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-1', 'fb-4', embedding);

      const updateCall = mockPrismaService.theme.update.mock.calls[0][0];
      expect(Array.isArray(updateCall.data.topKeywords)).toBe(true);
      expect(updateCall.data.topKeywords.length).toBeGreaterThan(0);
      // "mobile", "navigation", "broken" should appear
      const keywords = updateCall.data.topKeywords as string[];
      expect(keywords.some((k) => ['mobile', 'navigation', 'broken', 'menu'].includes(k))).toBe(true);
    });
  });

  // ── Stage-1 Tenant Isolation ──────────────────────────────────────────────

  describe('Stage-1 Tenant Isolation', () => {
    it('should scope the vector similarity query to the correct workspaceId', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-tenant-a',
        title: 'WiFi issue',
        description: 'WiFi drops',
        workspaceId: 'ws-tenant-a',
      });
      mockEmbeddingService.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-new', title: 'WiFi issue' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-tenant-a', 'fb-tenant-a');

      const rawCall = mockPrismaService.$queryRaw.mock.calls[0];
      expect(JSON.stringify(rawCall)).toContain('ws-tenant-a');
    });

    it('should create the new theme with the correct workspaceId', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-tenant-a',
        title: 'Billing issue',
        description: 'Charged twice',
        workspaceId: 'ws-tenant-a',
      });
      mockEmbeddingService.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0.2));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-billing', title: 'Billing issue' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-tenant-a', 'fb-tenant-a');

      const createCall = mockPrismaService.theme.create.mock.calls[0][0];
      expect(createCall.data.workspaceId).toBe('ws-tenant-a');
      expect(createCall.data.workspaceId).not.toBe('ws-tenant-b');
    });

    it('should not assign tenant-b feedback to tenant-a themes', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-tenant-b',
        title: 'WiFi issue',
        description: 'WiFi drops',
        workspaceId: 'ws-tenant-b',
      });
      mockEmbeddingService.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-tenant-b', title: 'WiFi issue' });
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockCiqQueue.add.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-tenant-b', 'fb-tenant-b');

      const createCall = mockPrismaService.theme.create.mock.calls[0][0];
      expect(createCall.data.workspaceId).toBe('ws-tenant-b');
    });
  });

  // ── Stage-1 Repeated Processing ──────────────────────────────────────────

  describe('Stage-1 Repeated Processing', () => {
    it('should return existing themeId without creating a new ThemeFeedback if one already exists', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue({
        feedbackId: 'fb-wifi-1',
        themeId: 'theme-wifi',
      });

      const result = await service.assignFeedbackToTheme(
        'ws-tenant-a',
        'fb-wifi-1',
        Array.from({ length: 1536 }, () => 0.1),
      );

      expect(result).toBe('theme-wifi');
      expect(mockPrismaService.theme.create).not.toHaveBeenCalled();
      expect(mockPrismaService.themeFeedback.upsert).not.toHaveBeenCalled();
    });
  });
});
