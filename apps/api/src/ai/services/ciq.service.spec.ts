/**
 * CIQ Service Unit Tests — Unified Formula (Phase 2)
 *
 * Tests the CiqService scoring formula, including:
 *  - Weight normalisation (guards against settings that don't sum to 1.0)
 *  - Score range (always 0–100)
 *  - Relative ranking (high-signal themes score higher)
 *  - Support ticket signals: themes with more support tickets rank higher
 *  - Voice feedback signals: voice feedback weighted ≥ regular feedback
 *  - Support-heavy issues rank higher than feedback-only issues (supportWeight > feedbackWeight)
 *  - Confidence score derivation (voice + support boost confidence)
 *  - Score explanation completeness
 *  - Source count outputs (feedbackCount, voiceCount, supportCount)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CiqService, CiqScoreOutput } from './ciq.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPriority, DealStage, DealStatus, FeedbackSourceType } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock PrioritizationSettings row with given weights. */
function makeSettings(overrides: Partial<Record<string, number>> = {}) {
  return {
    workspaceId:              'ws-test',
    requestFrequencyWeight:   0.1538,
    customerCountWeight:      0.1538,
    arrValueWeight:           0.1538,
    accountPriorityWeight:    0.0769,
    dealValueWeight:          0.1538,
    strategicWeight:          0.0769,
    voteWeight:               0.1154,
    sentimentWeight:          0.0769,
    recencyWeight:            0.0385,
    // Unified source multipliers (Phase 2)
    supportWeight:            1.5,    // support tickets count 1.5× more than regular feedback
    voiceWeight:              1.2,    // voice feedback counts 1.2× more than regular feedback
    dealStageProspecting:     0.1,
    dealStageQualifying:      0.3,
    dealStageProposal:        0.6,
    dealStageNegotiation:     0.8,
    dealStageClosedWon:       1.0,
    demandStrengthWeight:     0.30,
    revenueImpactWeight:      0.35,
    strategicImportanceWeight: 0.20,
    urgencySignalWeight:      0.15,
    updatedAt:                new Date(),
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
  sourceType?: FeedbackSourceType;
}) {
  const createdAt = new Date(Date.now() - (opts.daysAgo ?? 5) * 24 * 60 * 60 * 1000);
  return {
    feedback: {
      customerId:  opts.customerId ?? 'cust-1',
      sentiment:   opts.sentiment ?? null,
      impactScore: null,
      status:      opts.status ?? 'OPEN',
      sourceType:  opts.sourceType ?? FeedbackSourceType.MANUAL,
      createdAt,
      customer: {
        arrValue:        opts.arrValue ?? 0,
        accountPriority: opts.accountPriority ?? AccountPriority.MEDIUM,
      },
    },
  };
}

/** Build a mock SupportIssueCluster row. */
function makeCluster(opts: {
  ticketCount?: number;
  avgSentiment?: number | null;
  hasActiveSpike?: boolean;
}) {
  return {
    ticketCount:    opts.ticketCount ?? 0,
    avgSentiment:   opts.avgSentiment ?? null,
    hasActiveSpike: opts.hasActiveSpike ?? false,
  };
}

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockPrisma(
  themeFeedbacks: ReturnType<typeof makeFeedback>[] = [],
  signals: { strength: number }[] = [],
  deals: { deal: { annualValue: number; stage: DealStage; status: DealStatus } }[] = [],
  votes: { id: string }[] = [],
  settings = makeSettings(),
  supportClusters: ReturnType<typeof makeCluster>[] = [],
) {
  return {
    prioritizationSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
      create:     jest.fn().mockResolvedValue(settings),
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
    supportIssueCluster: {
      findMany: jest.fn().mockResolvedValue(supportClusters),
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
      const prisma = buildMockPrisma([], [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });

    it('should return a priorityScore in the 0–100 range for high-signal input', async () => {
      const feedbacks = Array.from({ length: 50 }, (_, i) =>
        makeFeedback({ customerId: `cust-${i}`, arrValue: 500000, accountPriority: AccountPriority.CRITICAL, sentiment: -0.8, daysAgo: 2 }),
      );
      const clusters = [makeCluster({ ticketCount: 30, hasActiveSpike: true })];
      const prisma = buildMockPrisma(feedbacks, [{ strength: 10 }], [], [], makeSettings(), clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-high');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ── Source count outputs ─────────────────────────────────────────────────

  describe('scoreTheme — source count outputs', () => {
    it('should correctly count voice feedback separately from regular feedback', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', sourceType: FeedbackSourceType.MANUAL }),
        makeFeedback({ customerId: 'c2', sourceType: FeedbackSourceType.MANUAL }),
        makeFeedback({ customerId: 'c3', sourceType: FeedbackSourceType.VOICE }),
        makeFeedback({ customerId: 'c4', sourceType: FeedbackSourceType.PUBLIC_PORTAL }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-voice');

      expect(result.feedbackCount).toBe(4);   // total active feedback
      expect(result.voiceCount).toBe(2);       // VOICE + PUBLIC_PORTAL
    });

    it('should correctly sum support ticket counts from linked clusters', async () => {
      const clusters = [
        makeCluster({ ticketCount: 15 }),
        makeCluster({ ticketCount: 8 }),
      ];
      const prisma = buildMockPrisma([], [], [], [], makeSettings(), clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-support');

      expect(result.supportCount).toBe(23);   // 15 + 8
    });

    it('should compute totalSignalCount as feedbackCount + supportCount', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1' }),
        makeFeedback({ customerId: 'c2' }),
        makeFeedback({ customerId: 'c3' }),
      ];
      const clusters = [makeCluster({ ticketCount: 10 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-total');

      expect(result.feedbackCount).toBe(3);
      expect(result.supportCount).toBe(10);
      expect(result.totalSignalCount).toBe(13);
    });

    it('should not count MERGED feedback in any count', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', status: 'OPEN', sourceType: FeedbackSourceType.VOICE }),
        makeFeedback({ customerId: 'c2', status: 'MERGED', sourceType: FeedbackSourceType.VOICE }),
        makeFeedback({ customerId: 'c3', status: 'MERGED' }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-merged');

      expect(result.feedbackCount).toBe(1);
      expect(result.voiceCount).toBe(1);
    });
  });

  // ── Support signals rank higher ──────────────────────────────────────────

  describe('scoreTheme — support signals', () => {
    it('should score a theme with support tickets higher than one with feedback only (same count)', async () => {
      const feedbacks = Array.from({ length: 10 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, arrValue: 50000, accountPriority: AccountPriority.MEDIUM }),
      );
      const clusters = [makeCluster({ ticketCount: 10 })];

      const prismaWithSupport    = buildMockPrisma(feedbacks, [], [], [], makeSettings(), clusters);
      const prismaWithoutSupport = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);

      const serviceWith    = await createService(prismaWithSupport);
      const serviceWithout = await createService(prismaWithoutSupport);

      const resultWith    = await serviceWith.scoreTheme('ws-test', 'theme-support');
      const resultWithout = await serviceWithout.scoreTheme('ws-test', 'theme-no-support');

      // Support tickets add weight → higher score
      expect(resultWith.priorityScore).toBeGreaterThan(resultWithout.priorityScore);
    });

    it('should apply spike bonus when a cluster has hasActiveSpike=true', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const clustersWithSpike    = [makeCluster({ ticketCount: 5, hasActiveSpike: true })];
      const clustersWithoutSpike = [makeCluster({ ticketCount: 5, hasActiveSpike: false })];

      const prismaSpike    = buildMockPrisma(feedbacks, [], [], [], makeSettings(), clustersWithSpike);
      const prismaNoSpike  = buildMockPrisma(feedbacks, [], [], [], makeSettings(), clustersWithoutSpike);

      const serviceSpike   = await createService(prismaSpike);
      const serviceNoSpike = await createService(prismaNoSpike);

      const resultSpike   = await serviceSpike.scoreTheme('ws-test', 'theme-spike');
      const resultNoSpike = await serviceNoSpike.scoreTheme('ws-test', 'theme-no-spike');

      expect(resultSpike.priorityScore).toBeGreaterThan(resultNoSpike.priorityScore);
    });

    it('should include supportSignal in the score explanation', async () => {
      const clusters = [makeCluster({ ticketCount: 20 })];
      const prisma = buildMockPrisma([], [], [], [], makeSettings(), clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-support-explain');

      expect(result.scoreExplanation).toHaveProperty('supportSignal');
      expect(result.scoreExplanation['supportSignal'].label).toBe('Support ticket signal');
    });
  });

  // ── Voice signals ────────────────────────────────────────────────────────

  describe('scoreTheme — voice signals', () => {
    it('should score a theme with voice feedback higher than one with only text feedback (same count)', async () => {
      const textFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, arrValue: 50000, sourceType: FeedbackSourceType.MANUAL }),
      );
      const voiceFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `cv-${i}`, arrValue: 50000, sourceType: FeedbackSourceType.VOICE }),
      );

      const prismaText  = buildMockPrisma(textFeedbacks, [], [], [], makeSettings(), []);
      const prismaVoice = buildMockPrisma(voiceFeedbacks, [], [], [], makeSettings(), []);

      const serviceText  = await createService(prismaText);
      const serviceVoice = await createService(prismaVoice);

      const resultText  = await serviceText.scoreTheme('ws-test', 'theme-text');
      const resultVoice = await serviceVoice.scoreTheme('ws-test', 'theme-voice');

      // Voice feedback has a higher weight multiplier → higher score
      expect(resultVoice.priorityScore).toBeGreaterThan(resultText.priorityScore);
    });

    it('should include voiceSignal in the score explanation', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', sourceType: FeedbackSourceType.VOICE })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-voice-explain');

      expect(result.scoreExplanation).toHaveProperty('voiceSignal');
      expect(result.scoreExplanation['voiceSignal'].label).toBe('Voice feedback signal');
    });

    it('should count PUBLIC_PORTAL sourceType as voice', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', sourceType: FeedbackSourceType.PUBLIC_PORTAL }),
        makeFeedback({ customerId: 'c2', sourceType: FeedbackSourceType.MANUAL }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-portal');

      expect(result.voiceCount).toBe(1);
    });
  });

  // ── Weight normalisation ─────────────────────────────────────────────────

  describe('scoreTheme — weight normalisation', () => {
    it('should produce the same relative score regardless of whether weights sum to 1.0 or 1.3', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', arrValue: 100000, accountPriority: AccountPriority.HIGH, sentiment: -0.5, daysAgo: 10 }),
        makeFeedback({ customerId: 'c2', arrValue: 80000, accountPriority: AccountPriority.MEDIUM, sentiment: null, daysAgo: 20 }),
      ];

      const settingsNorm = makeSettings({
        requestFrequencyWeight: 0.20, customerCountWeight: 0.15, arrValueWeight: 0.20,
        accountPriorityWeight: 0.10, dealValueWeight: 0.15, strategicWeight: 0.05,
        voteWeight: 0.10, recencyWeight: 0.05, sentimentWeight: 0.10,
        supportWeight: 1.5, voiceWeight: 1.2,
      });

      const settingsOverweight = makeSettings({
        requestFrequencyWeight: 0.26, customerCountWeight: 0.195, arrValueWeight: 0.26,
        accountPriorityWeight: 0.13, dealValueWeight: 0.195, strategicWeight: 0.065,
        voteWeight: 0.13, recencyWeight: 0.065, sentimentWeight: 0.13,
        supportWeight: 1.5, voiceWeight: 1.2,
      });

      const prisma1 = buildMockPrisma(feedbacks, [], [], [], settingsNorm, []);
      const prisma2 = buildMockPrisma(feedbacks, [], [], [], settingsOverweight, []);

      const service1 = await createService(prisma1);
      const service2 = await createService(prisma2);

      const result1 = await service1.scoreTheme('ws-test', 'theme-1');
      const result2 = await service2.scoreTheme('ws-test', 'theme-2');

      // After normalisation, both should produce the same score
      expect(result1.priorityScore).toBeCloseTo(result2.priorityScore, 1);
      expect(result1.priorityScore).toBeLessThanOrEqual(100);
      expect(result2.priorityScore).toBeLessThanOrEqual(100);
    });

    it('should not inflate scores above 100 even when weights sum > 1.0', async () => {
      const feedbacks = Array.from({ length: 30 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, arrValue: 1000000, accountPriority: AccountPriority.CRITICAL, sentiment: -0.9, daysAgo: 1 }),
      );
      const clusters = [makeCluster({ ticketCount: 50, hasActiveSpike: true })];
      const inflatedSettings = makeSettings({
        requestFrequencyWeight: 0.40, customerCountWeight: 0.30, arrValueWeight: 0.40,
        accountPriorityWeight: 0.20, dealValueWeight: 0.30, strategicWeight: 0.10,
        voteWeight: 0.20, recencyWeight: 0.10, sentimentWeight: 0.20,
        supportWeight: 2.0, voiceWeight: 2.0,
      });
      const prisma = buildMockPrisma(feedbacks, [], [], [], inflatedSettings, clusters);
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

      const prismaHigh = buildMockPrisma(highFeedbacks, [], [], [], makeSettings(), []);
      const prismaLow  = buildMockPrisma(lowFeedbacks, [], [], [], makeSettings(), []);

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

      const prismaEnt = buildMockPrisma(enterpriseFeedbacks, [], [], [], makeSettings(), []);
      const prismaSmb = buildMockPrisma(smbFeedbacks, [], [], [], makeSettings(), []);

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
      const prisma = buildMockPrisma([], [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.confidenceScore).toBe(0);
    });

    it('should return a higher confidence score with more feedback', async () => {
      const fewFeedbacks  = [makeFeedback({})];
      const manyFeedbacks = Array.from({ length: 20 }, () => makeFeedback({}));

      const prismaFew  = buildMockPrisma(fewFeedbacks, [], [], [], makeSettings(), []);
      const prismaMany = buildMockPrisma(manyFeedbacks, [], [], [], makeSettings(), []);

      const serviceFew  = await createService(prismaFew);
      const serviceMany = await createService(prismaMany);

      const resultFew  = await serviceFew.scoreTheme('ws-test', 'theme-few');
      const resultMany = await serviceMany.scoreTheme('ws-test', 'theme-many');

      expect(resultMany.confidenceScore).toBeGreaterThan(resultFew.confidenceScore);
    });

    it('should give higher confidence when voice and support signals are present', async () => {
      const feedbacks = Array.from({ length: 5 }, (_, i) => makeFeedback({ customerId: `c-${i}` }));
      const voiceFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `cv-${i}`, sourceType: FeedbackSourceType.VOICE }),
      );
      const clusters = [makeCluster({ ticketCount: 10 })];

      const prismaBasic = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const prismaRich  = buildMockPrisma([...feedbacks, ...voiceFeedbacks], [], [], [], makeSettings(), clusters);

      const serviceBasic = await createService(prismaBasic);
      const serviceRich  = await createService(prismaRich);

      const resultBasic = await serviceBasic.scoreTheme('ws-test', 'theme-basic');
      const resultRich  = await serviceRich.scoreTheme('ws-test', 'theme-rich');

      expect(resultRich.confidenceScore).toBeGreaterThan(resultBasic.confidenceScore);
    });

    it('should cap confidence at 1.0', async () => {
      const feedbacks = Array.from({ length: 100 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, sourceType: FeedbackSourceType.VOICE }),
      );
      const signals  = Array.from({ length: 50 }, () => ({ strength: 10 }));
      const clusters = [makeCluster({ ticketCount: 200 })];

      const prisma = buildMockPrisma(feedbacks, signals, [], [], makeSettings(), clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-max');

      expect(result.confidenceScore).toBeLessThanOrEqual(1.0);
    });
  });

  // ── Score explanation ────────────────────────────────────────────────────

  describe('scoreTheme — score explanation', () => {
    it('should include all required explanation keys', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1', arrValue: 50000, accountPriority: AccountPriority.HIGH }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-explain');

      const expectedKeys = [
        'feedbackFrequency', 'voiceSignal', 'supportSignal',
        'customerCount', 'arrValue', 'accountPriority',
        'dealInfluence', 'signalStrength', 'sentimentSignal',
        'recencySignal', 'voteSignal',
      ];
      for (const key of expectedKeys) {
        expect(result.scoreExplanation).toHaveProperty(key);
        expect(result.scoreExplanation[key].weight).toBeGreaterThanOrEqual(0);
        expect(result.scoreExplanation[key].contribution).toBeGreaterThanOrEqual(0);
        expect(result.scoreExplanation[key].label).toBeTruthy();
      }
    });

    it('should have normalised weights that sum to approximately 1.0 in the explanation', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 100000 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);
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

      const prismaWithDeals    = buildMockPrisma(feedbacks, [], deals, [], makeSettings(), []);
      const prismaWithoutDeals = buildMockPrisma(feedbacks, [], [], [], makeSettings(), []);

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

      const prisma = buildMockPrisma(feedbacks, [], lostDeals, [], makeSettings(), []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-lost-deals');

      expect(result.dealInfluenceValue).toBe(0);
    });
  });
});
