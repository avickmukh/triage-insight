/**
 * UnifiedAggregationService — Unit Tests
 *
 * Tests cover:
 *   - generateInsight (rule-based, synchronous)
 *   - aggregateTheme (source counts, sentiment distribution, persistence)
 *   - getTopIssues (raw SQL result mapping, numeric coercion)
 *   - getWorkspaceSourceSummary (field name alignment, pct calculation)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnifiedAggregationService } from './unified-aggregation.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  theme: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  themeFeedback: {
    findMany: jest.fn(),
  },
  supportIssueCluster: {
    aggregate: jest.fn(),
  },
  feedback: {
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, def: string) => {
    if (key === 'OPENAI_API_KEY') return ''; // no key → rule-based fallback
    return def;
  }),
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('UnifiedAggregationService', () => {
  let service: UnifiedAggregationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAggregationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UnifiedAggregationService>(UnifiedAggregationService);
  });

  // ─── generateInsight (rule-based) ─────────────────────────────────────────

  describe('generateInsight', () => {
    it('should return null when all counts are zero', () => {
      const result = service.generateInsight({
        feedbackCount: 0,
        voiceCount: 0,
        supportCount: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
      });
      expect(result).toBeNull();
    });

    it('should generate high-negative sentence when negativePct >= 60', () => {
      const result = service.generateInsight({
        feedbackCount: 5,
        voiceCount: 2,
        supportCount: 3,
        sentimentDistribution: { positive: 1, neutral: 1, negative: 8 },
      });
      expect(result).toMatch(/High negative sentiment \(80%\)/);
    });

    it('should generate cross-source sentence when 2+ sources active', () => {
      const result = service.generateInsight({
        feedbackCount: 10,
        voiceCount: 0,
        supportCount: 5,
        sentimentDistribution: { positive: 5, neutral: 5, negative: 5 },
      });
      expect(result).toMatch(/Reported across 2 sources/);
      expect(result).toContain('10 feedback');
      expect(result).toContain('5 support tickets');
    });

    it('should generate single-source sentence when only one source active', () => {
      const result = service.generateInsight({
        feedbackCount: 7,
        voiceCount: 0,
        supportCount: 0,
        sentimentDistribution: { positive: 4, neutral: 2, negative: 1 },
      });
      expect(result).toContain('7 feedback');
    });

    it('should use singular "ticket" for supportCount = 1', () => {
      const result = service.generateInsight({
        feedbackCount: 0,
        voiceCount: 0,
        supportCount: 1,
        sentimentDistribution: { positive: 0, neutral: 1, negative: 0 },
      });
      expect(result).toContain('1 support ticket');
      expect(result).not.toContain('tickets');
    });

    it('should handle voice-only source', () => {
      const result = service.generateInsight({
        feedbackCount: 0,
        voiceCount: 3,
        supportCount: 0,
        sentimentDistribution: { positive: 2, neutral: 1, negative: 0 },
      });
      expect(result).toContain('3 voice reports');
    });

    it('should handle all three sources active', () => {
      const result = service.generateInsight({
        feedbackCount: 8,
        voiceCount: 3,
        supportCount: 5,
        sentimentDistribution: { positive: 5, neutral: 5, negative: 6 },
      });
      // 6/16 = 37.5% negative — not >= 60, so cross-source sentence
      expect(result).toMatch(/Reported across 3 sources/);
    });
  });

  // ─── aggregateTheme ────────────────────────────────────────────────────────

  describe('aggregateTheme', () => {
    const THEME_ID = 'theme-abc';

    beforeEach(() => {
      mockPrisma.theme.findUnique.mockResolvedValue({
        title: 'Checkout Delay',
      });
      // New impl: supportCount = rows with primarySource=SUPPORT (not supportIssueCluster.aggregate)
      mockPrisma.themeFeedback.findMany.mockResolvedValue([
        { feedback: { sourceType: 'FEEDBACK', primarySource: 'FEEDBACK', sentiment: 0.5 } },
        { feedback: { sourceType: 'VOICE', primarySource: 'VOICE', sentiment: -0.8 } },
        { feedback: { sourceType: 'FEEDBACK', primarySource: 'SUPPORT', sentiment: -0.3 } },
        { feedback: { sourceType: 'FEEDBACK', primarySource: 'FEEDBACK', sentiment: 0.0 } },
      ]);
      mockPrisma.theme.update.mockResolvedValue({});
    });

    it('should compute correct source counts', async () => {
      const result = await service.aggregateTheme(THEME_ID);
      expect(result.feedbackCount).toBe(4);    // all ThemeFeedback rows
      expect(result.voiceCount).toBe(1);       // rows with sourceType=VOICE
      expect(result.supportCount).toBe(1);     // rows with primarySource=SUPPORT
      expect(result.totalSignalCount).toBe(4); // totalSignalCount = feedbackCount (single source of truth)
    });

    it('should compute correct sentiment distribution', async () => {
      const result = await service.aggregateTheme(THEME_ID);
      // sentiment: 0.5 → positive, -0.8 → negative, -0.3 → negative, 0.0 → neutral
      expect(result.sentimentDistribution.positive).toBe(1);
      expect(result.sentimentDistribution.negative).toBe(2);
      expect(result.sentimentDistribution.neutral).toBe(1);
    });

    it('should persist aggregated data to Prisma', async () => {
      await service.aggregateTheme(THEME_ID);
      expect(mockPrisma.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: THEME_ID },
          data: expect.objectContaining({
            feedbackCount: 4,
            voiceCount: 1,
            supportCount: 1,     // 1 row with primarySource=SUPPORT
            totalSignalCount: 4, // totalSignalCount = feedbackCount
          }),
        }),
      );
    });

    it('should handle zero support tickets gracefully', async () => {
      // With the new impl, supportCount = rows with primarySource=SUPPORT.
      // Override the mock to have no SUPPORT rows.
      mockPrisma.themeFeedback.findMany.mockResolvedValue([
        { feedback: { sourceType: 'FEEDBACK', primarySource: 'FEEDBACK', sentiment: 0.5 } },
        { feedback: { sourceType: 'VOICE', primarySource: 'VOICE', sentiment: -0.8 } },
      ]);
      const result = await service.aggregateTheme(THEME_ID);
      expect(result.supportCount).toBe(0);
    });

    it('should handle null sentiment values as neutral', async () => {
      mockPrisma.themeFeedback.findMany.mockResolvedValue([
        { feedback: { sourceType: 'FEEDBACK', sentiment: null } },
        { feedback: { sourceType: 'FEEDBACK', sentiment: undefined } },
      ]);
      const result = await service.aggregateTheme(THEME_ID);
      expect(result.sentimentDistribution.neutral).toBe(2);
      expect(result.sentimentDistribution.positive).toBe(0);
      expect(result.sentimentDistribution.negative).toBe(0);
    });

    it('should generate a non-null crossSourceInsight when signals exist', async () => {
      const result = await service.aggregateTheme(THEME_ID);
      expect(result.crossSourceInsight).not.toBeNull();
      expect(typeof result.crossSourceInsight).toBe('string');
    });
  });

  // ─── getTopIssues ──────────────────────────────────────────────────────────

  describe('getTopIssues', () => {
    it('should coerce numeric fields from raw SQL strings', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'theme-1',
          title: 'Slow checkout',
          status: 'OPEN',
          ciqScore: '72.5',
          priorityScore: '68.0',
          totalSignalCount: '25',
          feedbackCount: '10',
          voiceCount: '3',
          supportCount: '12',
          sentimentDistribution: '{"positive":5,"neutral":3,"negative":2}',
          crossSourceInsight: 'Reported across 3 sources.',
          aiRecommendation: 'Prioritise checkout performance.',
          lastAggregatedAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.getTopIssues('ws-1', 5);

      expect(result).toHaveLength(1);
      expect(result[0].ciqScore).toBe(72.5);
      expect(result[0].priorityScore).toBe(68.0);
      expect(result[0].totalSignalCount).toBe(25);
      expect(result[0].feedbackCount).toBe(10);
      expect(result[0].voiceCount).toBe(3);
      expect(result[0].supportCount).toBe(12);
      expect(result[0].sentimentDistribution).toEqual({
        positive: 5,
        neutral: 3,
        negative: 2,
      });
    });

    it('should handle null sentimentDistribution gracefully', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'theme-2',
          title: 'Login issues',
          status: 'OPEN',
          ciqScore: null,
          priorityScore: null,
          totalSignalCount: '5',
          feedbackCount: '5',
          voiceCount: '0',
          supportCount: '0',
          sentimentDistribution: null,
          crossSourceInsight: null,
          aiRecommendation: null,
          lastAggregatedAt: null,
        },
      ]);

      const result = await service.getTopIssues('ws-1', 5);
      expect(result[0].sentimentDistribution).toBeNull();
      expect(result[0].ciqScore).toBeNull();
    });

    it('should return empty array when no themes exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getTopIssues('ws-empty', 10);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getTopPriorityThemes ──────────────────────────────────────────────────

  describe('getTopPriorityThemes', () => {
    it('should return themes mapped with correct field types', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'theme-1',
          title: 'Payment Failures',
          shortLabel: 'Payment Failures',
          ciqScore: 85,
          trendDirection: 'UP',
          trendDelta: 25,
          impactSentence: 'Payment failures increased 25% this week.',
          revenueInfluence: 120000,
          totalSignalCount: 45,
          customerCount: BigInt(34),
        },
      ]);

      const result = await service.getTopPriorityThemes('ws-1', 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'theme-1',
        ciqScore: 85,
        trendDirection: 'UP',
        trendDelta: 25,
        priorityRank: 1,
      });
      // BigInt should be converted to number
      expect(typeof result[0].customerCount).toBe('number');
      expect(result[0].customerCount).toBe(34);
    });

    it('should assign priorityRank sequentially starting from 1', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'a',
          title: 'A',
          shortLabel: null,
          ciqScore: 90,
          trendDirection: 'UP',
          trendDelta: 30,
          impactSentence: null,
          revenueInfluence: null,
          totalSignalCount: 50,
          customerCount: BigInt(10),
        },
        {
          id: 'b',
          title: 'B',
          shortLabel: null,
          ciqScore: 70,
          trendDirection: 'STABLE',
          trendDelta: 0,
          impactSentence: null,
          revenueInfluence: null,
          totalSignalCount: 30,
          customerCount: BigInt(5),
        },
        {
          id: 'c',
          title: 'C',
          shortLabel: null,
          ciqScore: 50,
          trendDirection: 'DOWN',
          trendDelta: -20,
          impactSentence: null,
          revenueInfluence: null,
          totalSignalCount: 10,
          customerCount: BigInt(2),
        },
      ]);

      const result = await service.getTopPriorityThemes('ws-1', 3);

      expect(result[0].priorityRank).toBe(1);
      expect(result[1].priorityRank).toBe(2);
      expect(result[2].priorityRank).toBe(3);
    });

    it('should default trendDirection to STABLE when null', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'x',
          title: 'X',
          shortLabel: null,
          ciqScore: 60,
          trendDirection: null,
          trendDelta: null,
          impactSentence: null,
          revenueInfluence: null,
          totalSignalCount: 20,
          customerCount: BigInt(0),
        },
      ]);

      const result = await service.getTopPriorityThemes('ws-1', 3);
      expect(result[0].trendDirection).toBe('STABLE');
      expect(result[0].trendDelta).toBe(0);
    });

    it('should return empty array when no themes qualify', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getTopPriorityThemes('ws-empty', 3);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getWorkspaceSourceSummary ─────────────────────────────────────────────

  describe('getWorkspaceSourceSummary', () => {
    beforeEach(() => {
      mockPrisma.feedback.groupBy.mockResolvedValue([
        { sourceType: 'FEEDBACK', _count: { id: 50 } },
        { sourceType: 'SURVEY', _count: { id: 20 } },
        { sourceType: 'VOICE', _count: { id: 10 } },
      ]);
      mockPrisma.supportIssueCluster.aggregate.mockResolvedValue({
        _sum: { ticketCount: 30 },
      });
      mockPrisma.theme.aggregate.mockResolvedValue({ _count: { id: 15 } });
      mockPrisma.theme.count.mockResolvedValue(8);
       mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ title: 'Checkout Delay' }]) // topByFeedback
        .mockResolvedValueOnce([{ title: 'Login Issues' }]) // topBySupport
        .mockResolvedValueOnce([{ title: 'Onboarding Confusion' }]) // topByVoice
        .mockResolvedValueOnce([]); // topBySurvey (4th call added in current impl)
    });
    it('should return correct total signal count', async () => {
      const result = await service.getWorkspaceSourceSummary('ws-1');
      // Implementation separates SURVEY from feedbackCount:
      //   feedbackCount = FEEDBACK only (50), surveyCount = 20, voice = 10, support = 30
      //   total = 50 + 20 + 10 + 30 = 110
      expect(result.totalSignals).toBe(110);
      expect(result.feedbackCount).toBe(50); // FEEDBACK only (SURVEY is a separate source)
      expect(result.surveyCount).toBe(20);   // SURVEY tracked separately
      expect(result.voiceCount).toBe(10);
      expect(result.supportCount).toBe(30);
    });
    it('should compute correct percentages', async () => {
      const result = await service.getWorkspaceSourceSummary('ws-1');
      // total=110: feedback=50 (45%), survey=20 (18%), voice=10 (9%), support=30 (27%)
      expect(result.feedbackPct).toBe(45); // 50/110 ≈ 45.5 → 45
      expect(result.voicePct).toBe(9);     // 10/110 ≈ 9.1 → 9
      expect(result.supportPct).toBe(27);  // 30/110 ≈ 27.3 → 27
    });

    it('should return top theme titles per source', async () => {
      const result = await service.getWorkspaceSourceSummary('ws-1');
      expect(result.topThemeByFeedback).toBe('Checkout Delay');
      expect(result.topThemeBySupport).toBe('Login Issues');
      expect(result.topThemeByVoice).toBe('Onboarding Confusion');
    });

    it('should return themeCount and scoredThemeCount', async () => {
      const result = await service.getWorkspaceSourceSummary('ws-1');
      expect(result.themeCount).toBe(15);
      expect(result.scoredThemeCount).toBe(8);
    });

    it('should handle zero total signals without division by zero', async () => {
      mockPrisma.feedback.groupBy.mockResolvedValue([]);
      mockPrisma.supportIssueCluster.aggregate.mockResolvedValue({
        _sum: { ticketCount: null },
      });
      const result = await service.getWorkspaceSourceSummary('ws-empty');
      expect(result.totalSignals).toBe(0);
      expect(result.feedbackPct).toBe(0);
      expect(result.voicePct).toBe(0);
      expect(result.supportPct).toBe(0);
    });
  });
});
