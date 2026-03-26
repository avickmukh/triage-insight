import { Test, TestingModule } from '@nestjs/testing';
import { DigestService } from './digest.service';
import { PrismaService } from '../prisma/prisma.service';
import { SummarizationService } from '../ai/services/summarization.service';
import { DigestFrequency } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  theme: {
    findMany: jest.fn(),
  },
  feedback: {
    aggregate: jest.fn(),
  },
  digestRun: {
    create: jest.fn(),
  },
};

const mockSummarizationService = {
  summarize: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('DigestService', () => {
  let service: DigestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SummarizationService, useValue: mockSummarizationService },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
    jest.clearAllMocks();
  });

  // ── generateDigest ──────────────────────────────────────────────────────────

  describe('generateDigest', () => {
    const workspaceId = 'ws-id';

    const mockTopThemes = [
      { id: 'theme-1', title: 'Performance Issues', workspaceId },
      { id: 'theme-2', title: 'Feature Requests', workspaceId },
    ];

    beforeEach(() => {
      mockPrismaService.theme.findMany.mockResolvedValue(mockTopThemes);
      mockPrismaService.feedback.aggregate.mockResolvedValue({
        _avg: { sentiment: 0.65 },
      });
      mockSummarizationService.summarize.mockResolvedValue(
        'This week, the top themes were Performance Issues and Feature Requests.',
      );
      mockPrismaService.digestRun.create.mockResolvedValue({
        id: 'digest-run-id',
        workspaceId,
        summary: {},
        createdAt: new Date(),
      });
    });

    it('should generate a weekly digest and return a DigestRun', async () => {
      const result = await service.generateDigest(workspaceId, DigestFrequency.WEEKLY);

      expect(result).toHaveProperty('id', 'digest-run-id');
      expect(mockPrismaService.theme.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.feedback.aggregate).toHaveBeenCalledTimes(1);
      expect(mockSummarizationService.summarize).toHaveBeenCalledTimes(1);
    });

    it('should query themes with a date filter based on frequency', async () => {
      await service.generateDigest(workspaceId, DigestFrequency.WEEKLY);

      const themeQueryArgs = mockPrismaService.theme.findMany.mock.calls[0][0];
      expect(themeQueryArgs.where.workspaceId).toBe(workspaceId);
      expect(themeQueryArgs.where.feedbacks.some.assignedAt.gte).toBeInstanceOf(Date);
    });

    it('should persist the digest run with summary data', async () => {
      await service.generateDigest(workspaceId);

      expect(mockPrismaService.digestRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            summary: expect.objectContaining({
              topThemes: mockTopThemes,
              summaryText: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('should include average sentiment in the summary', async () => {
      await service.generateDigest(workspaceId);

      const createArgs = mockPrismaService.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.sentimentSummary._avg.sentiment).toBe(0.65);
    });

    it('should handle workspaces with no recent feedback gracefully', async () => {
      mockPrismaService.theme.findMany.mockResolvedValue([]);
      mockPrismaService.feedback.aggregate.mockResolvedValue({
        _avg: { sentiment: null },
      });
      mockSummarizationService.summarize.mockResolvedValue('No significant activity this week.');

      const result = await service.generateDigest(workspaceId);

      expect(result).toHaveProperty('id', 'digest-run-id');
      expect(mockSummarizationService.summarize).toHaveBeenCalledWith(
        expect.stringContaining(workspaceId),
      );
    });
  });
});
