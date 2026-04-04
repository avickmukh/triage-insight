import { Test, TestingModule } from '@nestjs/testing';
import { SentimentService } from './sentiment.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SentimentService', () => {
  let service: SentimentService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentimentService,
        {
          provide: PrismaService,
          useValue: {
            supportTicket: {
              findMany: jest.fn(),
            },
            supportIssueCluster: {
              count: jest.fn(),
            },
            theme: {
              findMany: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SentimentService>(SentimentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── scoreText (private via any cast) ────────────────────────────────────

  describe('scoreText (lexicon scoring)', () => {
    it('returns a positive score for clearly positive text', () => {
      const score = (service as any).scoreText(
        'excellent great love working perfectly',
      );
      expect(score).toBeGreaterThan(0);
    });

    it('returns a negative score for clearly negative text', () => {
      const score = (service as any).scoreText(
        'broken terrible crash bug error failure',
      );
      expect(score).toBeLessThan(0);
    });

    it('returns a score near zero for neutral text', () => {
      const score = (service as any).scoreText('the ticket was updated');
      expect(Math.abs(score)).toBeLessThanOrEqual(0.3);
    });

    it('clamps score to [-1, +1]', () => {
      // Extremely negative text
      const score = (service as any).scoreText(
        'broken crash error failure bug terrible horrible worst disaster',
      );
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('handles empty string without throwing', () => {
      expect(() => (service as any).scoreText('')).not.toThrow();
      const score = (service as any).scoreText('');
      expect(score).toBe(0);
    });
  });

  // ─── scoreWorkspaceTickets ────────────────────────────────────────────────

  describe('scoreWorkspaceTickets', () => {
    it('returns { scored: 0 } when no tickets exist', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      const result = await service.scoreWorkspaceTickets('ws-1');
      expect(result).toEqual({ scored: 0 });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('calls $executeRaw once per ticket', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        {
          id: 't-1',
          subject: 'Login broken',
          description: 'Cannot log in at all',
        },
        {
          id: 't-2',
          subject: 'Great feature',
          description: 'Love the new dashboard',
        },
      ]);
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.scoreWorkspaceTickets('ws-1');
      expect(result).toEqual({ scored: 2 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('handles tickets with null description gracefully', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        { id: 't-3', subject: 'Issue', description: null },
      ]);
      prisma.$executeRaw.mockResolvedValue(1);

      await expect(service.scoreWorkspaceTickets('ws-1')).resolves.toEqual({
        scored: 1,
      });
    });
  });

  // ─── aggregateClusterSentiment ────────────────────────────────────────────

  describe('aggregateClusterSentiment', () => {
    it('executes raw SQL and returns updated cluster count', async () => {
      prisma.$executeRaw.mockResolvedValue(undefined);
      prisma.supportIssueCluster.count.mockResolvedValue(5);

      const result = await service.aggregateClusterSentiment('ws-1');
      expect(result).toEqual({ updated: 5 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.supportIssueCluster.count).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
      });
    });
  });

  // ─── runFullSentimentPass ─────────────────────────────────────────────────

  describe('runFullSentimentPass', () => {
    it('returns combined scored and clustersUpdated counts', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        { id: 't-1', subject: 'Crash', description: 'App crashes on startup' },
      ]);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.supportIssueCluster.count.mockResolvedValue(3);

      const result = await service.runFullSentimentPass('ws-1');
      expect(result).toEqual({ scored: 1, clustersUpdated: 3 });
    });
  });

  // ─── getNegativeTrends ────────────────────────────────────────────────────

  describe('getNegativeTrends', () => {
    it('returns empty array when no negative clusters exist', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getNegativeTrends('ws-1');
      expect(result).toEqual([]);
    });

    it('enriches rows with themeTitle when themeId is present', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'c-1',
          title: 'Login failures',
          avgSentiment: -0.72,
          negativeTicketPct: 0.85,
          ticketCount: 20,
          arrExposure: 45000,
          hasActiveSpike: true,
          themeId: 'theme-1',
        },
      ]);
      prisma.theme.findMany.mockResolvedValue([
        { id: 'theme-1', title: 'Authentication Issues' },
      ]);

      const result = await service.getNegativeTrends('ws-1', 5);
      expect(result).toHaveLength(1);
      expect(result[0].themeTitle).toBe('Authentication Issues');
      expect(result[0].avgSentiment).toBeCloseTo(-0.72);
      expect(result[0].hasActiveSpike).toBe(true);
    });

    it('sets themeTitle to null when themeId is null', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'c-2',
          title: 'Billing errors',
          avgSentiment: -0.55,
          negativeTicketPct: 0.6,
          ticketCount: 10,
          arrExposure: 0,
          hasActiveSpike: false,
          themeId: null,
        },
      ]);
      prisma.theme.findMany.mockResolvedValue([]);

      const result = await service.getNegativeTrends('ws-1');
      expect(result[0].themeTitle).toBeNull();
    });

    it('coerces numeric fields from raw SQL strings to numbers', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'c-3',
          title: 'Slow load',
          avgSentiment: '-0.4', // raw SQL may return strings
          negativeTicketPct: '0.5',
          ticketCount: '8',
          arrExposure: '12000',
          hasActiveSpike: false,
          themeId: null,
        },
      ]);
      prisma.theme.findMany.mockResolvedValue([]);

      const result = await service.getNegativeTrends('ws-1');
      expect(typeof result[0].avgSentiment).toBe('number');
      expect(typeof result[0].ticketCount).toBe('number');
      expect(typeof result[0].arrExposure).toBe('number');
    });
  });
});
