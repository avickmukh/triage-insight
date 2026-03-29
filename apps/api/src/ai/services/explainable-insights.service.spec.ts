/**
 * ExplainableInsightsService — unit tests
 *
 * Tests cover:
 *  1. Heuristic sentence: UP trend with customers
 *  2. Heuristic sentence: DOWN trend with revenue
 *  3. Heuristic sentence: STABLE trend, no customers
 *  4. Heuristic sentence: uses shortLabel over title when available
 *  5. Batch workspace generation: processes themes without impactSentence
 *  6. generateImpactSentence: persists sentence to DB
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExplainableInsightsService } from './explainable-insights.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  theme: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  customerSignal: {
    count: jest.fn(),
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExplainableInsightsService', () => {
  let service: ExplainableInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExplainableInsightsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExplainableInsightsService>(ExplainableInsightsService);
  });

  // Helper to access private method via type cast
  function heuristic(
    theme: Parameters<ExplainableInsightsService['heuristicSentence' as keyof ExplainableInsightsService]>[0],
    customerCount: number,
  ): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (service as any).heuristicSentence(theme, customerCount);
  }

  // ── 1. UP trend with customers ──────────────────────────────────────────────

  it('should include "increased" and customer count for UP trend', () => {
    const sentence = heuristic(
      {
        title: 'Payment Failures',
        shortLabel: null,
        trendDirection: 'UP',
        trendDelta: 25,
        currentWeekSignals: 15,
        revenueInfluence: null,
      },
      34,
    );

    expect(sentence).toContain('increased');
    expect(sentence).toContain('25%');
    expect(sentence).toContain('34 customers');
  });

  // ── 2. DOWN trend with revenue ──────────────────────────────────────────────

  it('should include "decreased" and revenue for DOWN trend', () => {
    const sentence = heuristic(
      {
        title: 'Checkout Errors',
        shortLabel: null,
        trendDirection: 'DOWN',
        trendDelta: -40,
        currentWeekSignals: 3,
        revenueInfluence: 120000,
      },
      0,
    );

    expect(sentence).toContain('decreased');
    expect(sentence).toContain('40%');
    expect(sentence).toContain('$120K');
  });

  // ── 3. STABLE trend, no customers ──────────────────────────────────────────

  it('should include "remained stable" for STABLE trend', () => {
    const sentence = heuristic(
      {
        title: 'Onboarding Issues',
        shortLabel: null,
        trendDirection: 'STABLE',
        trendDelta: 2,
        currentWeekSignals: 8,
        revenueInfluence: null,
      },
      0,
    );

    expect(sentence).toContain('remained stable');
    // No customer mention when count = 0
    expect(sentence).not.toContain('customer');
  });

  // ── 4. Uses shortLabel over title ──────────────────────────────────────────

  it('should prefer shortLabel over title in the sentence', () => {
    const sentence = heuristic(
      {
        title: 'Payment Processing Failures During Checkout Flow',
        shortLabel: 'Payment Failures',
        trendDirection: 'UP',
        trendDelta: 15,
        currentWeekSignals: 10,
        revenueInfluence: null,
      },
      5,
    );

    expect(sentence).toContain('Payment Failures');
    expect(sentence).not.toContain('Payment Processing Failures During Checkout Flow');
  });

  // ── 5. Batch workspace generation ──────────────────────────────────────────

  it('should process up to 20 themes without impactSentence', async () => {
    const themes = Array.from({ length: 5 }, (_, i) => ({ id: `theme-${i}` }));
    mockPrisma.theme.findMany.mockResolvedValue(themes);
    mockPrisma.theme.findUnique.mockResolvedValue({
      id: 'theme-0',
      title: 'Test Theme',
      shortLabel: null,
      trendDirection: 'STABLE',
      trendDelta: 0,
      currentWeekSignals: 5,
      prevWeekSignals: 5,
      ciqScore: 60,
      revenueInfluence: null,
      topKeywords: null,
      crossSourceInsight: null,
      _count: { feedbacks: 10 },
    });
    mockPrisma.customerSignal.count.mockResolvedValue(3);
    mockPrisma.theme.update.mockResolvedValue({});

    const result = await service.generateInsightsForWorkspace('ws-1');

    expect(result.processed).toBe(5);
    expect(mockPrisma.theme.update).toHaveBeenCalledTimes(5);
  });

  // ── 6. Persists sentence to DB ──────────────────────────────────────────────

  it('should persist the generated impact sentence to the theme row', async () => {
    mockPrisma.theme.findUnique.mockResolvedValue({
      id: 'theme-1',
      title: 'Login Issues',
      shortLabel: 'Login Failures',
      trendDirection: 'UP',
      trendDelta: 30,
      currentWeekSignals: 13,
      prevWeekSignals: 10,
      ciqScore: 75,
      revenueInfluence: 50000,
      topKeywords: ['login', 'auth', 'session'],
      crossSourceInsight: null,
      _count: { feedbacks: 25 },
    });
    mockPrisma.customerSignal.count.mockResolvedValue(12);
    mockPrisma.theme.update.mockResolvedValue({});

    await service.generateImpactSentence('theme-1');

    expect(mockPrisma.theme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'theme-1' },
        data: expect.objectContaining({
          impactSentence: expect.any(String),
        }),
      }),
    );
  });
});
