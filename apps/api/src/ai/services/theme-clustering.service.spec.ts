import { Test, TestingModule } from '@nestjs/testing';
import { ThemeClusteringService } from './theme-clustering.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  themeFeedback: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  feedback: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  theme: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockEmbeddingService = {
  embed: jest.fn(),
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
      ],
    }).compile();

    service = module.get<ThemeClusteringService>(ThemeClusteringService);
    jest.clearAllMocks();
  });

  // ── assignFeedbackToTheme ───────────────────────────────────────────────────

  describe('assignFeedbackToTheme', () => {
    it('should return null and skip if feedback is already linked to a theme', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue({
        themeId: 'existing-theme-id',
        feedbackId: 'feedback-id',
      });

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(result).toBeNull();
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('should generate an embedding when none is provided', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Test feedback',
        description: 'Some description',
        embedding: null,
      });

      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);

      // No matching themes above threshold
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      // Create a new theme
      mockPrismaService.theme.create.mockResolvedValue({ id: 'new-theme-id' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(mockEmbeddingService.embed).toHaveBeenCalledTimes(1);
      expect(result).toBe('new-theme-id');
    });

    it('should use a provided embedding without calling EmbeddingService', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Test feedback',
        description: null,
        embedding: null,
      });

      const providedEmbedding = Array.from({ length: 1536 }, () => 0.1);

      // Simulate a matching theme above the 0.8 threshold
      mockPrismaService.$queryRaw.mockResolvedValue([
        { id: 'existing-theme-id', similarity: 0.92 },
      ]);
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id', providedEmbedding);

      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
      expect(result).toBe('existing-theme-id');
    });

    it('should create a new AI_GENERATED theme when no existing theme meets the similarity threshold', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'feedback-id',
        title: 'Completely new topic',
        description: null,
        embedding: null,
      });

      const mockEmbedding = Array.from({ length: 1536 }, () => 0.5);
      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);

      // No themes above threshold
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'ai-generated-theme-id' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(mockPrismaService.theme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'AI_GENERATED', workspaceId: 'ws-id' }),
        }),
      );
      expect(result).toBe('ai-generated-theme-id');
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
        embedding: null,
      });
      mockEmbeddingService.embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-new' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-tenant-a', 'fb-tenant-a');

      // The $queryRaw call must include ws-tenant-a for tenant scoping
      const rawCall = mockPrismaService.$queryRaw.mock.calls[0];
      expect(JSON.stringify(rawCall)).toContain('ws-tenant-a');
    });

    it('should create the new theme with the correct workspaceId', async () => {
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.findUnique.mockResolvedValue({
        id: 'fb-tenant-a',
        title: 'Billing issue',
        description: 'Charged twice',
        embedding: null,
      });
      mockEmbeddingService.embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0.2));
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-billing' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

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
        embedding: null,
      });
      mockEmbeddingService.embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
      // Simulate a tenant-a theme returned (should not happen with correct scoping)
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.theme.create.mockResolvedValue({ id: 'theme-tenant-b' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      await service.assignFeedbackToTheme('ws-tenant-b', 'fb-tenant-b');

      const createCall = mockPrismaService.theme.create.mock.calls[0][0];
      expect(createCall.data.workspaceId).toBe('ws-tenant-b');
    });
  });

  // ── Stage-1 Repeated Processing ──────────────────────────────────────────

  describe('Stage-1 Repeated Processing', () => {
    it('should return early without creating a ThemeFeedback if one already exists', async () => {
      // Feedback already assigned to a theme
      mockPrismaService.themeFeedback.findFirst.mockResolvedValue({
        feedbackId: 'fb-wifi-1',
        themeId: 'theme-wifi',
      });

      const result = await service.assignFeedbackToTheme(
        'ws-tenant-a',
        'fb-wifi-1',
        Array.from({ length: 1536 }, () => 0.1),
      );

      expect(result).toBeNull();
      expect(mockPrismaService.theme.create).not.toHaveBeenCalled();
      expect(mockPrismaService.themeFeedback.create).not.toHaveBeenCalled();
    });
  });
});
