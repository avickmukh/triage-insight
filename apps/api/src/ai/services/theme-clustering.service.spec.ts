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

    it('should create a new DRAFT theme when no existing theme meets the similarity threshold', async () => {
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
      mockPrismaService.theme.create.mockResolvedValue({ id: 'draft-theme-id' });
      mockPrismaService.themeFeedback.create.mockResolvedValue({});
      mockPrismaService.feedback.update.mockResolvedValue({});

      const result = await service.assignFeedbackToTheme('ws-id', 'feedback-id');

      expect(mockPrismaService.theme.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', workspaceId: 'ws-id' }),
        }),
      );
      expect(result).toBe('draft-theme-id');
    });
  });
});
