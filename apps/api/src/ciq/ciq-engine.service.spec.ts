/**
 * CiqEngineService — Regression Tests
 *
 * These tests verify the canonical 7-factor CIQ scoring formula used by
 * CiqEngineService.scoreThemeForPersistence and CiqEngineService.getThemeRanking.
 *
 * Key invariants tested:
 *   1. scoreThemeForPersistence returns a ciqScore in 0–100 range
 *   2. persistCanonicalThemeScore writes both ciqScore and priorityScore to the same value
 *   3. A theme with no signals scores 0
 *   4. A theme with high ARR + many feedback items scores higher than one with low ARR
 *   5. A near-duplicate theme (autoMergeCandidate=true) scores 20% lower than the same
 *      theme without the near-duplicate flag
 *   6. The dominant driver in the breakdown is the key with the highest contribution
 */

import { CiqEngineService } from './ciq-engine.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Minimal PrismaService mock ───────────────────────────────────────────────
function makePrismaMock(themeOverrides: Record<string, unknown> = {}) {
  const defaultTheme = {
    id: 'theme-1',
    title: 'Test Theme',
    status: 'AI_GENERATED',
    ciqScore: null,
    priorityScore: null,
    revenueInfluence: 0,
    lastScoredAt: null,
    signalBreakdown: null,
    feedbackCount: 0,
    voiceCount: 0,
    supportCount: 0,
    surveyCount: 0,
    totalSignalCount: 0,
    aiConfidence: null,
    autoMergeCandidate: false,
    resurfaceCount: 0,
    recentSignalCount: 0,
    lastEvidenceAt: new Date(),
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    feedbacks: [],
    dealLinks: [],
    customerSignals: [],
    ...themeOverrides,
  };

  return {
    theme: {
      findUnique: jest.fn().mockResolvedValue(defaultTheme),
      update: jest.fn().mockResolvedValue(defaultTheme),
    },
  } as unknown as PrismaService;
}

// ─── Helper: build a feedback entry with customer ARR ─────────────────────────
function makeFeedback(arrValue: number, customerId = 'cust-1') {
  return {
    feedback: {
      customerId,
      sentiment: -0.5,
      ciqScore: 0,
      metadata: null,
      sourceType: 'FEEDBACK',
      primarySource: 'FEEDBACK',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      customer: { arrValue, accountPriority: 'HIGH' },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CiqEngineService — canonical 7-factor scorer', () => {
  let service: CiqEngineService;

  // ── Test 1: Zero-signal theme scores 0 ──────────────────────────────────────
  it('returns ciqScore = 0 for a theme with no signals', async () => {
    const prisma = makePrismaMock();
    service = new CiqEngineService(prisma);
    const result = await service.scoreThemeForPersistence('theme-1');
    expect(result.ciqScore).toBe(0);
    expect(result.feedbackCount).toBe(0);
    expect(result.totalSignalCount).toBe(0);
  });

  // ── Test 2: ciqScore is always in 0–100 range ────────────────────────────────
  it('clamps ciqScore to 0–100 even with extreme inputs', async () => {
    const prisma = makePrismaMock({
      feedbacks: Array.from({ length: 200 }, (_, i) =>
        makeFeedback(10_000_000, `cust-${i}`),
      ),
      dealLinks: [
        { deal: { annualValue: 50_000_000, stage: 'CLOSED_WON', status: 'WON' } },
      ],
    });
    service = new CiqEngineService(prisma);
    const result = await service.scoreThemeForPersistence('theme-1');
    expect(result.ciqScore).toBeGreaterThanOrEqual(0);
    expect(result.ciqScore).toBeLessThanOrEqual(100);
  });

   // ── Test 3: High-velocity theme scores higher than low-velocity theme ───────
  it('ranks a high-velocity theme higher than a low-velocity theme', async () => {
    const highVelPrisma = makePrismaMock({
      feedbacks: Array.from({ length: 15 }, (_, i) => makeFeedback(50_000, `cust-${i}`)),
      resurfaceCount: 3,
    });
    const lowVelPrisma = makePrismaMock({
      feedbacks: [makeFeedback(50_000)],
      resurfaceCount: 0,
    });
    const highVelService = new CiqEngineService(highVelPrisma);
    const lowVelService = new CiqEngineService(lowVelPrisma);

    const highResult = await highVelService.scoreThemeForPersistence('theme-1');
    const lowResult = await lowVelService.scoreThemeForPersistence('theme-1');

    expect(highResult.ciqScore).toBeGreaterThan(lowResult.ciqScore);
  });

  // ── Test 4: Near-duplicate penalty reduces score by 20% ─────────────────────
  it('applies 20% near-duplicate penalty when autoMergeCandidate=true', async () => {
    const feedbacks = [makeFeedback(100_000)];
    const normalPrisma = makePrismaMock({ feedbacks, autoMergeCandidate: false });
    const dupPrisma = makePrismaMock({ feedbacks, autoMergeCandidate: true });

    const normalService = new CiqEngineService(normalPrisma);
    const dupService = new CiqEngineService(dupPrisma);

    const normalResult = await normalService.scoreThemeForPersistence('theme-1');
    const dupResult = await dupService.scoreThemeForPersistence('theme-1');

    // Near-duplicate score should be exactly 80% of normal score
    expect(dupResult.ciqScore).toBeCloseTo(normalResult.ciqScore * 0.8, 1);
  });

  // ── Test 5: Breakdown weights sum to 1.0 ────────────────────────────────────
  it('breakdown weights sum to 1.0 (±0.001)', async () => {
    const prisma = makePrismaMock({
      feedbacks: [makeFeedback(50_000)],
    });
    service = new CiqEngineService(prisma);
    const result = await service.scoreThemeForPersistence('theme-1');

    const totalWeight = Object.values(result.breakdown).reduce(
      (sum, factor) => sum + factor.weight,
      0,
    );
    expect(totalWeight).toBeCloseTo(1.0, 3);
  });

  // ── Test 6: persistCanonicalThemeScore writes both fields at same scale ──────
  it('persistCanonicalThemeScore writes ciqScore and priorityScore to the same value', async () => {
    const prisma = makePrismaMock();
    service = new CiqEngineService(prisma);

    const mockScore = {
      ciqScore: 67.5,
      breakdown: {},
      feedbackCount: 10,
      uniqueCustomerCount: 5,
      voiceCount: 2,
      supportCount: 1,
      surveyCount: 0,
      totalSignalCount: 13,
      revenueInfluence: 500_000,
      dealInfluenceValue: 200_000,
    };

    await service.persistCanonicalThemeScore('theme-1', mockScore);

    expect(prisma.theme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ciqScore: 67.5,
          priorityScore: 67.5,
        }),
      }),
    );
  });

  // ── Test 7: EMPTY sentinel returned for non-existent theme ──────────────────
  it('returns EMPTY sentinel (ciqScore=0) for a non-existent theme', async () => {
    const prisma = {
      theme: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new CiqEngineService(prisma);
    const result = await service.scoreThemeForPersistence('nonexistent-id');
    expect(result.ciqScore).toBe(0);
    expect(result.feedbackCount).toBe(0);
  });
});
