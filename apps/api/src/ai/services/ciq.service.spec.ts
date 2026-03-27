/**
 * CIQ Service Unit Tests
 *
 * Tests the CiqService scoring formula, including:
 *  - Weight normalisation (guards against settings that don't sum to 1.0)
 *  - Score range (always 0–100)
 *  - Relative ranking (high-signal themes score higher)
 *  - Confidence score derivation
 *  - Score explanation completeness
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CiqService, CiqScoreOutput } from './ciq.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock PrioritizationSettings row with given weights. */
function makeSettings(overrides: Partial<Record<string, number>> = {}) {
  return {
    workspaceId: 'ws-test',
    requestFrequencyWeight: 0.20,
    customerCountWeight:    0.15,
    arrValueWeight:         0.20,
    accountPriorityWeight:  0.10,
    dealValueWeight:        0.15,
    strategicWeight:        0.05,
    voteWeight:             0.10,
    sentimentWeight:        0.00,
    recencyWeight:          0.05,
    dealStageProspecting:   0.1,
    dealStageQualifying:    0.3,
    dealStageProposal:      0.6,
    dealStageNegotiation:   0.8,
    dealStageClosedWon:     1.0,
    demandStrengthWeight:   0.30,
    revenueImpactWeight:    0.35,
    strategicImportanceWeight: 0.20,
    urgencySignalWeight:    0.15,
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Build a mock ThemeFeedback row. */
function makeFeedback(opts: {
  customerId?: string;
  arrValue?: number;
  accountPriority?: AccountPriority;
  sentiment?: number | null;
  daysAgo?: number;
  status?: string;
}) {
  const createdAt = new Date(Date.now() - (opts.daysAgo ?? 5) * 24 * 60 * 60 * 1000);
  return {
    feedback: {
      customerId: opts.customerId ?? 'cust-1',
      sentiment: opts.sentiment ?? null,
      impactScore: null,
      status: opts.status ?? 'OPEN',
      createdAt,
      customer: {
        arrValue: opts.arrValue ?? 0,
        accountPriority: opts.accountPriority ?? AccountPriority.MEDIUM,
      },
    },
  };
}

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockPrisma(
  themeFeedbacks: ReturnType<typeof makeFeedback>[] = [],
  signals: { strength: number }[] = [],
  deals: { deal: { annualValue: number; stage: DealStage; status: DealStatus } }[] = [],
  votes: { id: string }[] = [],
  settings = makeSettings(),
) {
  return {
    prioritizationSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
      create: jest.fn().mockResolvedValue(settings),
    },
    themeFeedback: {
      findMany: jest.fn().mockResolvedValue(themeFeedbacks),
    },
    customerSignal: {
      findMany: jest.fn().mockResolvedValue(signals),
    },
    dealThemeLink: {
      findMany: jest.fn().mockResolvedValue(deals),
    },
    feedbackVote: {
      findMany: jest.fn().mockResolvedValue(votes),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CiqService', () => {
  async function createService(prisma: any): Promise<CiqService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiqService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return module.get<CiqService>(CiqService);
  }

  // ── Score range ──────────────────────────────────────────────────────────

  describe('scoreTheme — score range', () => {
    it('should return a priorityScore in the 0–100 range for zero-signal input', async () => {
      const prisma = buildMockPrisma([], [], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });

    it('should return a priorityScore in the 0–100 range for high-signal input', async () => {
      const feedbacks = Array.from({ length: 50 }, (_, i) =>
        makeFeedback({ customerId: `cust-${i}`, arrValue: 500000, accountPriority: AccountPriority.CRITICAL, sentiment: -0.8, daysAgo: 2 }),
      );
      const prisma = buildMockPrisma(feedbacks, [{ strength: 10 }], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-high');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ── Weight normalisation ─────────────────────────────────────────────────

  describe('scoreTheme — weight normalisation', () => {
    it('should produce the same relative score regardless of whether weights sum to 1.0 or 1.3', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', arrValue: 100000, accountPriority: AccountPriority.HIGH, sentiment: -0.5, daysAgo: 10 }),
        makeFeedback({ customerId: 'c2', arrValue: 80000, accountPriority: AccountPriority.MEDIUM, sentiment: null, daysAgo: 20 }),
      ];

      // Settings that sum to 1.0 (correct)
      const settingsNorm = makeSettings({
        requestFrequencyWeight: 0.20, customerCountWeight: 0.15, arrValueWeight: 0.20,
        accountPriorityWeight: 0.10, dealValueWeight: 0.15, strategicWeight: 0.05,
        voteWeight: 0.10, recencyWeight: 0.05,
      });

      // Settings that sum to 1.3 (the original bug)
      const settingsOverweight = makeSettings({
        requestFrequencyWeight: 0.26, customerCountWeight: 0.195, arrValueWeight: 0.26,
        accountPriorityWeight: 0.13, dealValueWeight: 0.195, strategicWeight: 0.065,
        voteWeight: 0.13, recencyWeight: 0.065,
      });

      const prisma1 = buildMockPrisma(feedbacks, [], [], [], settingsNorm);
      const prisma2 = buildMockPrisma(feedbacks, [], [], [], settingsOverweight);

      const service1 = await createService(prisma1);
      const service2 = await createService(prisma2);

      const result1 = await service1.scoreTheme('ws-test', 'theme-1');
      const result2 = await service2.scoreTheme('ws-test', 'theme-2');

      // After normalisation, both should produce the same score
      expect(result1.priorityScore).toBeCloseTo(result2.priorityScore, 1);

      // Both scores must be ≤ 100 (the overweight settings would have exceeded 100 without normalisation)
      expect(result1.priorityScore).toBeLessThanOrEqual(100);
      expect(result2.priorityScore).toBeLessThanOrEqual(100);
    });

    it('should not inflate scores above 100 even when weights sum > 1.0', async () => {
      const feedbacks = Array.from({ length: 30 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, arrValue: 1000000, accountPriority: AccountPriority.CRITICAL, sentiment: -0.9, daysAgo: 1 }),
      );
      // Deliberately inflated weights (sum = 2.0)
      const inflatedSettings = makeSettings({
        requestFrequencyWeight: 0.40, customerCountWeight: 0.30, arrValueWeight: 0.40,
        accountPriorityWeight: 0.20, dealValueWeight: 0.30, strategicWeight: 0.10,
        voteWeight: 0.20, recencyWeight: 0.10,
      });
      const prisma = buildMockPrisma(feedbacks, [], [], [], inflatedSettings);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-inflated');
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ── Relative ranking ─────────────────────────────────────────────────────

  describe('scoreTheme — relative ranking', () => {
    it('should score a high-signal theme higher than a low-signal theme', async () => {
      const highFeedbacks = Array.from({ length: 20 }, (_, i) =>
        makeFeedback({ customerId: `c-high-${i}`, arrValue: 500000, accountPriority: AccountPriority.CRITICAL, sentiment: -0.7, daysAgo: 3 }),
      );
      const lowFeedbacks = [
        makeFeedback({ customerId: 'c-low-1', arrValue: 5000, accountPriority: AccountPriority.LOW, sentiment: 0.1, daysAgo: 60 }),
      ];

      const prismaHigh = buildMockPrisma(highFeedbacks, [], [], []);
      const prismaLow  = buildMockPrisma(lowFeedbacks, [], [], []);

      const serviceHigh = await createService(prismaHigh);
      const serviceLow  = await createService(prismaLow);

      const resultHigh = await serviceHigh.scoreTheme('ws-test', 'theme-high');
      const resultLow  = await serviceLow.scoreTheme('ws-test', 'theme-low');

      expect(resultHigh.priorityScore).toBeGreaterThan(resultLow.priorityScore);
    });

    it('should score a theme with enterprise customers higher than one with SMB customers', async () => {
      const enterpriseFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `ent-${i}`, arrValue: 300000, accountPriority: AccountPriority.CRITICAL }),
      );
      const smbFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `smb-${i}`, arrValue: 5000, accountPriority: AccountPriority.LOW }),
      );

      const prismaEnt = buildMockPrisma(enterpriseFeedbacks, [], [], []);
      const prismaSmb = buildMockPrisma(smbFeedbacks, [], [], []);

      const serviceEnt = await createService(prismaEnt);
      const serviceSmb = await createService(prismaSmb);

      const resultEnt = await serviceEnt.scoreTheme('ws-test', 'theme-ent');
      const resultSmb = await serviceSmb.scoreTheme('ws-test', 'theme-smb');

      expect(resultEnt.priorityScore).toBeGreaterThan(resultSmb.priorityScore);
    });
  });

  // ── Confidence score ─────────────────────────────────────────────────────

  describe('scoreTheme — confidence score', () => {
    it('should return a confidence score of 0 for empty input', async () => {
      const prisma = buildMockPrisma([], [], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.confidenceScore).toBe(0);
    });

    it('should return a higher confidence score with more feedback', async () => {
      const fewFeedbacks = [makeFeedback({})];
      const manyFeedbacks = Array.from({ length: 20 }, () => makeFeedback({}));

      const prismaFew  = buildMockPrisma(fewFeedbacks, [], [], []);
      const prismaMany = buildMockPrisma(manyFeedbacks, [], [], []);

      const serviceFew  = await createService(prismaFew);
      const serviceMany = await createService(prismaMany);

      const resultFew  = await serviceFew.scoreTheme('ws-test', 'theme-few');
      const resultMany = await serviceMany.scoreTheme('ws-test', 'theme-many');

      expect(resultMany.confidenceScore).toBeGreaterThan(resultFew.confidenceScore);
    });

    it('should cap confidence at 1.0', async () => {
      const feedbacks = Array.from({ length: 100 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}` }),
      );
      const signals = Array.from({ length: 50 }, () => ({ strength: 10 }));

      const prisma = buildMockPrisma(feedbacks, signals, [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-max');

      expect(result.confidenceScore).toBeLessThanOrEqual(1.0);
    });
  });

  // ── Score explanation ────────────────────────────────────────────────────

  describe('scoreTheme — score explanation', () => {
    it('should return a scoreExplanation with all expected factor keys', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', arrValue: 50000, accountPriority: AccountPriority.HIGH }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-explain');

      const expectedKeys = ['requestFrequency', 'customerCount', 'arrValue', 'accountPriority', 'dealInfluence', 'signalStrength', 'voteSignal', 'recencySignal'];
      for (const key of expectedKeys) {
        expect(result.scoreExplanation).toHaveProperty(key);
        expect(result.scoreExplanation[key].weight).toBeGreaterThanOrEqual(0);
        expect(result.scoreExplanation[key].contribution).toBeGreaterThanOrEqual(0);
        expect(result.scoreExplanation[key].label).toBeTruthy();
      }
    });

    it('should have normalised weights that sum to approximately 1.0 in the explanation', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 100000 })];
      const prisma = buildMockPrisma(feedbacks, [], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-norm');

      const weightSum = Object.values(result.scoreExplanation).reduce((sum, c) => sum + c.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 2);
    });
  });

  // ── Deal influence ───────────────────────────────────────────────────────

  describe('scoreTheme — deal influence', () => {
    it('should boost score when high-value deals are linked', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const deals = [
        { deal: { annualValue: 500000, stage: DealStage.NEGOTIATION, status: DealStatus.OPEN } },
      ];

      const prismaWithDeals    = buildMockPrisma(feedbacks, [], deals, []);
      const prismaWithoutDeals = buildMockPrisma(feedbacks, [], [], []);

      const serviceWith    = await createService(prismaWithDeals);
      const serviceWithout = await createService(prismaWithoutDeals);

      const resultWith    = await serviceWith.scoreTheme('ws-test', 'theme-deals');
      const resultWithout = await serviceWithout.scoreTheme('ws-test', 'theme-no-deals');

      expect(resultWith.priorityScore).toBeGreaterThan(resultWithout.priorityScore);
      expect(resultWith.dealInfluenceValue).toBeGreaterThan(0);
    });

    it('should not count LOST deals in deal influence', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const lostDeals = [
        { deal: { annualValue: 1000000, stage: DealStage.CLOSED_LOST, status: DealStatus.LOST } },
      ];

      const prisma = buildMockPrisma(feedbacks, [], lostDeals, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-lost-deals');

      expect(result.dealInfluenceValue).toBe(0);
    });
  });

  // ── Feedback count ───────────────────────────────────────────────────────

  describe('scoreTheme — feedback count', () => {
    it('should not count MERGED feedback in the score', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', status: 'OPEN' }),
        makeFeedback({ customerId: 'c2', status: 'MERGED' }),
        makeFeedback({ customerId: 'c3', status: 'MERGED' }),
      ];

      const prisma = buildMockPrisma(feedbacks, [], [], []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-merged');

      // Only 1 active feedback should count
      expect(result.feedbackCount).toBe(1);
    });
  });
});
