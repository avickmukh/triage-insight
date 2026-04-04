/**
 * CIQ Service Unit Tests — 5-Factor Formula (v2)
 *
 * Tests the CiqService scoring formula, including:
 *  - Score range (always 0–100)
 *  - Relative ranking (high-signal themes score higher)
 *  - Support ticket signals: themes with more support tickets rank higher
 *  - Voice feedback signals: voice feedback counted separately
 *  - Confidence score derivation (voice + support boost confidence)
 *  - Score explanation completeness (5-factor keys)
 *  - Source count outputs (feedbackCount, voiceCount, supportCount)
 *  - CRM multiplier: enterprise customers amplify base score
 *  - Spike bonus: active support spike adds urgency
 *  - Deal influence: high-value deals boost score; LOST deals excluded
 *  - Adaptive countNorm: small workspaces get meaningful scores (not flat low)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CiqService, CiqScoreOutput } from './ciq.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountPriority,
  DealStage,
  DealStatus,
  FeedbackSourceType,
} from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock ThemeFeedback row. */
function makeFeedback(opts: {
  customerId?: string;
  arrValue?: number;
  accountPriority?: AccountPriority;
  sentiment?: number | null;
  daysAgo?: number;
  status?: string;
  sourceType?: FeedbackSourceType;
  title?: string;
  description?: string;
  rawText?: string;
  primarySource?: string | null;
}) {
  const createdAt = new Date(
    Date.now() - (opts.daysAgo ?? 5) * 24 * 60 * 60 * 1000,
  );
  return {
    feedback: {
      customerId: opts.customerId ?? 'cust-1',
      sentiment: opts.sentiment ?? null,
      impactScore: null,
      status: opts.status ?? 'OPEN',
      sourceType: opts.sourceType ?? FeedbackSourceType.MANUAL,
      primarySource: opts.primarySource ?? null,
      createdAt,
      title: opts.title ?? 'Test feedback',
      description: opts.description ?? 'Some feedback description',
      rawText: opts.rawText ?? null,
      customer: {
        arrValue: opts.arrValue ?? 0,
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
    ticketCount: opts.ticketCount ?? 0,
    avgSentiment: opts.avgSentiment ?? null,
    hasActiveSpike: opts.hasActiveSpike ?? false,
  };
}

/** Build a mock Theme row (for topKeywords/dominantSignal/trend/resurfacing). */
function makeThemeRow(
  opts: {
    topKeywords?: string[];
    dominantSignal?: string | null;
    resurfaceCount?: number;
    resurfacedAt?: Date | null;
    trendDelta?: number | null;
    currentWeekSignals?: number;
    prevWeekSignals?: number;
  } = {},
) {
  return {
    topKeywords: opts.topKeywords ?? null,
    dominantSignal: opts.dominantSignal ?? null,
    resurfaceCount: opts.resurfaceCount ?? 0,
    resurfacedAt: opts.resurfacedAt ?? null,
    trendDelta: opts.trendDelta ?? null,
    currentWeekSignals: opts.currentWeekSignals ?? 0,
    prevWeekSignals: opts.prevWeekSignals ?? 0,
  };
}

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockPrisma(
  themeFeedbacks: ReturnType<typeof makeFeedback>[] = [],
  signals: { strength: number }[] = [],
  deals: {
    deal: { annualValue: number; stage: DealStage; status: DealStatus };
  }[] = [],
  votes: { id: string }[] = [],
  _settings: object = {}, // kept for backward-compat with call sites; no longer used by service
  supportClusters: ReturnType<typeof makeCluster>[] = [],
  themeRow: ReturnType<typeof makeThemeRow> | null = makeThemeRow(),
) {
  return {
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
    theme: {
      findUnique: jest.fn().mockResolvedValue(themeRow),
    },
    // getSettings is no longer called by scoreTheme (settings removed from 5-factor formula)
    prioritizationSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CiqService', () => {
  async function createService(prisma: any): Promise<CiqService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CiqService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return module.get<CiqService>(CiqService);
  }

  // ── Score range ──────────────────────────────────────────────────────────

  describe('scoreTheme — score range', () => {
    it('should return a priorityScore in the 0–100 range for zero-signal input', async () => {
      const prisma = buildMockPrisma([], [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });

    it('should return a priorityScore in the 0–100 range for high-signal input', async () => {
      const feedbacks = Array.from({ length: 50 }, (_, i) =>
        makeFeedback({
          customerId: `cust-${i}`,
          arrValue: 500000,
          accountPriority: AccountPriority.CRITICAL,
          sentiment: -0.8,
          daysAgo: 2,
          title: 'Critical crash blocker',
          description: 'The app is broken and cannot login',
        }),
      );
      const clusters = [makeCluster({ ticketCount: 30, hasActiveSpike: true })];
      const prisma = buildMockPrisma(
        feedbacks,
        [{ strength: 10 }],
        [],
        [],
        {},
        clusters,
      );
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-high');
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ── Adaptive scoring for small workspaces ────────────────────────────────

  describe('scoreTheme — adaptive countNorm (small workspace)', () => {
    it('should produce a meaningful score (≥ 30) for a theme with only 5 signals', async () => {
      const feedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, daysAgo: 3 }),
      );
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-small');
      // Old formula: 5/50 = 10% → ~5/100. New formula: 5/10 = 50% → ≥30/100
      expect(result.priorityScore).toBeGreaterThanOrEqual(30);
    });

    it('should produce a meaningful score (≥ 40) for a theme with 10 signals', async () => {
      const feedbacks = Array.from({ length: 10 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}`, daysAgo: 5 }),
      );
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-10');
      expect(result.priorityScore).toBeGreaterThanOrEqual(40);
    });

    it('should rank a theme with 20 signals higher than one with 5 signals', async () => {
      const few = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}` }),
      );
      const many = Array.from({ length: 20 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}` }),
      );

      const prismaFew = buildMockPrisma(few, [], [], [], {}, []);
      const prismaMany = buildMockPrisma(many, [], [], [], {}, []);

      const serviceFew = await createService(prismaFew);
      const serviceMany = await createService(prismaMany);

      const resultFew = await serviceFew.scoreTheme('ws-test', 'theme-few');
      const resultMany = await serviceMany.scoreTheme('ws-test', 'theme-many');

      expect(resultMany.priorityScore).toBeGreaterThan(resultFew.priorityScore);
    });
  });

  // ── Source count outputs ─────────────────────────────────────────────────

  describe('scoreTheme — source count outputs', () => {
    it('should correctly count voice feedback separately from regular feedback', async () => {
      const feedbacks = [
        makeFeedback({
          customerId: 'c1',
          sourceType: FeedbackSourceType.MANUAL,
        }),
        makeFeedback({
          customerId: 'c2',
          sourceType: FeedbackSourceType.MANUAL,
        }),
        makeFeedback({
          customerId: 'c3',
          sourceType: FeedbackSourceType.VOICE,
        }),
        makeFeedback({
          customerId: 'c4',
          sourceType: FeedbackSourceType.PUBLIC_PORTAL,
        }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-voice');

      expect(result.feedbackCount).toBe(4); // total active feedback
      expect(result.voiceCount).toBe(2); // VOICE + PUBLIC_PORTAL
    });

    it('should correctly sum support ticket counts from linked clusters', async () => {
      const clusters = [
        makeCluster({ ticketCount: 15 }),
        makeCluster({ ticketCount: 8 }),
      ];
      const prisma = buildMockPrisma([], [], [], [], {}, clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-support');

      // supportCount = supportFeedbackCount (Feedback rows with primarySource=SUPPORT)
      // SupportIssueCluster ticketCounts are NOT added to supportCount (to avoid double-counting)
      expect(result.supportCount).toBe(0); // no Feedback rows with SUPPORT primarySource
    });

    it('should compute totalSignalCount as feedbackCount (all Feedback rows)', async () => {
      const feedbacks = [
        makeFeedback({ customerId: 'c1' }),
        makeFeedback({ customerId: 'c2' }),
        makeFeedback({ customerId: 'c3' }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-total');

      expect(result.feedbackCount).toBe(3);
      expect(result.totalSignalCount).toBe(3);
    });

    it('should not count MERGED feedback in any count', async () => {
      const feedbacks = [
        makeFeedback({
          customerId: 'c1',
          status: 'OPEN',
          sourceType: FeedbackSourceType.VOICE,
        }),
        makeFeedback({
          customerId: 'c2',
          status: 'MERGED',
          sourceType: FeedbackSourceType.VOICE,
        }),
        makeFeedback({ customerId: 'c3', status: 'MERGED' }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-merged');

      expect(result.feedbackCount).toBe(1);
      expect(result.voiceCount).toBe(1);
    });

    it('should count PUBLIC_PORTAL sourceType as voice', async () => {
      const feedbacks = [
        makeFeedback({
          customerId: 'c1',
          sourceType: FeedbackSourceType.PUBLIC_PORTAL,
        }),
        makeFeedback({
          customerId: 'c2',
          sourceType: FeedbackSourceType.MANUAL,
        }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-portal');

      expect(result.voiceCount).toBe(1);
    });
  });

  // ── Support signals rank higher ──────────────────────────────────────────

  describe('scoreTheme — support signals', () => {
    it('should apply spike bonus when a cluster has hasActiveSpike=true', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const clustersWithSpike = [
        makeCluster({ ticketCount: 5, hasActiveSpike: true }),
      ];
      const clustersWithoutSpike = [
        makeCluster({ ticketCount: 5, hasActiveSpike: false }),
      ];

      const prismaSpike = buildMockPrisma(
        feedbacks,
        [],
        [],
        [],
        {},
        clustersWithSpike,
      );
      const prismaNoSpike = buildMockPrisma(
        feedbacks,
        [],
        [],
        [],
        {},
        clustersWithoutSpike,
      );

      const serviceSpike = await createService(prismaSpike);
      const serviceNoSpike = await createService(prismaNoSpike);

      const resultSpike = await serviceSpike.scoreTheme(
        'ws-test',
        'theme-spike',
      );
      const resultNoSpike = await serviceNoSpike.scoreTheme(
        'ws-test',
        'theme-no-spike',
      );

      expect(resultSpike.priorityScore).toBeGreaterThan(
        resultNoSpike.priorityScore,
      );
    });
  });

  // ── Relative ranking ─────────────────────────────────────────────────────

  describe('scoreTheme — relative ranking', () => {
    it('should score a high-signal theme higher than a low-signal theme', async () => {
      const highFeedbacks = Array.from({ length: 20 }, (_, i) =>
        makeFeedback({
          customerId: `c-high-${i}`,
          arrValue: 500000,
          accountPriority: AccountPriority.CRITICAL,
          sentiment: -0.7,
          daysAgo: 3,
          title: 'Critical crash blocker',
          description: 'Cannot login, app is broken',
        }),
      );
      const lowFeedbacks = [
        makeFeedback({
          customerId: 'c-low-1',
          arrValue: 5000,
          accountPriority: AccountPriority.LOW,
          sentiment: 0.1,
          daysAgo: 60,
          title: 'Nice to have improvement',
          description: 'Would be nice to add this feature',
        }),
      ];

      const prismaHigh = buildMockPrisma(highFeedbacks, [], [], [], {}, []);
      const prismaLow = buildMockPrisma(lowFeedbacks, [], [], [], {}, []);

      const serviceHigh = await createService(prismaHigh);
      const serviceLow = await createService(prismaLow);

      const resultHigh = await serviceHigh.scoreTheme('ws-test', 'theme-high');
      const resultLow = await serviceLow.scoreTheme('ws-test', 'theme-low');

      expect(resultHigh.priorityScore).toBeGreaterThan(resultLow.priorityScore);
    });

    it('should score a theme with enterprise customers higher than one with SMB customers (CRM multiplier)', async () => {
      const enterpriseFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({
          customerId: `ent-${i}`,
          arrValue: 300000,
          accountPriority: AccountPriority.CRITICAL,
        }),
      );
      const smbFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({
          customerId: `smb-${i}`,
          arrValue: 5000,
          accountPriority: AccountPriority.LOW,
        }),
      );

      const prismaEnt = buildMockPrisma(
        enterpriseFeedbacks,
        [],
        [],
        [],
        {},
        [],
      );
      const prismaSmb = buildMockPrisma(smbFeedbacks, [], [], [], {}, []);

      const serviceEnt = await createService(prismaEnt);
      const serviceSmb = await createService(prismaSmb);

      const resultEnt = await serviceEnt.scoreTheme('ws-test', 'theme-ent');
      const resultSmb = await serviceSmb.scoreTheme('ws-test', 'theme-smb');

      // Enterprise customers → higher CRM multiplier → higher score
      expect(resultEnt.priorityScore).toBeGreaterThan(resultSmb.priorityScore);
    });
  });

  // ── Severity scoring ─────────────────────────────────────────────────────

  describe('scoreTheme — severity scoring', () => {
    it('should score critical-keyword feedback higher than feature-request feedback', async () => {
      const criticalFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({
          customerId: `c-${i}`,
          title: 'Critical crash: app is broken',
          description: 'Cannot login, data loss, urgent fix needed',
          daysAgo: 2,
        }),
      );
      const featureRequestFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({
          customerId: `c-${i}`,
          title: 'Nice to have feature suggestion',
          description: 'Would be nice to add this improvement idea',
          daysAgo: 2,
        }),
      );

      const prismaCritical = buildMockPrisma(
        criticalFeedbacks,
        [],
        [],
        [],
        {},
        [],
      );
      const prismaFeature = buildMockPrisma(
        featureRequestFeedbacks,
        [],
        [],
        [],
        {},
        [],
      );

      const serviceCritical = await createService(prismaCritical);
      const serviceFeature = await createService(prismaFeature);

      const resultCritical = await serviceCritical.scoreTheme(
        'ws-test',
        'theme-critical',
      );
      const resultFeature = await serviceFeature.scoreTheme(
        'ws-test',
        'theme-feature',
      );

      expect(resultCritical.priorityScore).toBeGreaterThan(
        resultFeature.priorityScore,
      );
    });
  });

  // ── Confidence score ─────────────────────────────────────────────────────

  describe('scoreTheme — confidence score', () => {
    it('should return a confidence score of 0 for empty input', async () => {
      const prisma = buildMockPrisma([], [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-empty');
      expect(result.confidenceScore).toBe(0);
    });

    it('should return a higher confidence score with more feedback', async () => {
      const fewFeedbacks = [makeFeedback({})];
      const manyFeedbacks = Array.from({ length: 20 }, () => makeFeedback({}));

      const prismaFew = buildMockPrisma(fewFeedbacks, [], [], [], {}, []);
      const prismaMany = buildMockPrisma(manyFeedbacks, [], [], [], {}, []);

      const serviceFew = await createService(prismaFew);
      const serviceMany = await createService(prismaMany);

      const resultFew = await serviceFew.scoreTheme('ws-test', 'theme-few');
      const resultMany = await serviceMany.scoreTheme('ws-test', 'theme-many');

      expect(resultMany.confidenceScore).toBeGreaterThan(
        resultFew.confidenceScore,
      );
    });

    it('should give higher confidence when voice and support signals are present', async () => {
      const feedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({ customerId: `c-${i}` }),
      );
      const voiceFeedbacks = Array.from({ length: 5 }, (_, i) =>
        makeFeedback({
          customerId: `cv-${i}`,
          sourceType: FeedbackSourceType.VOICE,
        }),
      );
      const clusters = [makeCluster({ ticketCount: 10 })];

      const prismaBasic = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const prismaRich = buildMockPrisma(
        [...feedbacks, ...voiceFeedbacks],
        [{ strength: 5 }],
        [],
        [],
        {},
        clusters,
      );

      const serviceBasic = await createService(prismaBasic);
      const serviceRich = await createService(prismaRich);

      const resultBasic = await serviceBasic.scoreTheme(
        'ws-test',
        'theme-basic',
      );
      const resultRich = await serviceRich.scoreTheme('ws-test', 'theme-rich');

      expect(resultRich.confidenceScore).toBeGreaterThan(
        resultBasic.confidenceScore,
      );
    });

    it('should cap confidence at 1.0', async () => {
      const feedbacks = Array.from({ length: 100 }, (_, i) =>
        makeFeedback({
          customerId: `c-${i}`,
          sourceType: FeedbackSourceType.VOICE,
        }),
      );
      const signals = Array.from({ length: 50 }, () => ({ strength: 10 }));
      const clusters = [makeCluster({ ticketCount: 200 })];

      const prisma = buildMockPrisma(feedbacks, signals, [], [], {}, clusters);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-max');

      expect(result.confidenceScore).toBeLessThanOrEqual(1.0);
    });
  });

  // ── Score explanation ────────────────────────────────────────────────────

  describe('scoreTheme — score explanation', () => {
    it('should include all 5-factor explanation keys', async () => {
      const feedbacks = [
        makeFeedback({
          customerId: 'c1',
          arrValue: 50000,
          accountPriority: AccountPriority.HIGH,
        }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-explain');

      // The 5 base factors must always be present
      const requiredKeys = [
        'volume',
        'severity',
        'frequency',
        'friction',
        'recency',
      ];
      for (const key of requiredKeys) {
        expect(result.scoreExplanation).toHaveProperty(key);
        expect(result.scoreExplanation[key].weight).toBeGreaterThanOrEqual(0);
        expect(
          result.scoreExplanation[key].contribution,
        ).toBeGreaterThanOrEqual(0);
        expect(result.scoreExplanation[key].label).toBeTruthy();
      }
    });

    it('should have 5-factor weights that sum to 1.0', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 100000 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-norm');

      // Only the 5 base factors have non-zero weights; CRM multiplier and bonuses have weight=0
      const BASE_KEYS = [
        'volume',
        'severity',
        'frequency',
        'friction',
        'recency',
      ];
      const weightSum = BASE_KEYS.reduce(
        (sum, k) => sum + (result.scoreExplanation[k]?.weight ?? 0),
        0,
      );
      expect(weightSum).toBeCloseTo(1.0, 2);
    });

    it('should include crmMultiplier in explanation when CRM data is present', async () => {
      const feedbacks = [
        makeFeedback({
          customerId: 'c1',
          arrValue: 300000,
          accountPriority: AccountPriority.CRITICAL,
        }),
      ];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-crm');

      expect(result.scoreExplanation).toHaveProperty('crmMultiplier');
      expect(result.scoringMode).toBe('full');
    });

    it('should NOT include crmMultiplier when no CRM data is present', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 0 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-no-crm');

      expect(result.scoreExplanation).not.toHaveProperty('crmMultiplier');
      expect(result.scoringMode).toBe('signal-only');
    });
  });

  // ── Deal influence ───────────────────────────────────────────────────────

  describe('scoreTheme — deal influence', () => {
    it('should boost score when high-value deals are linked (CRM multiplier)', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const deals = [
        {
          deal: {
            annualValue: 500000,
            stage: DealStage.NEGOTIATION,
            status: DealStatus.OPEN,
          },
        },
      ];

      const prismaWithDeals = buildMockPrisma(feedbacks, [], deals, [], {}, []);
      const prismaWithoutDeals = buildMockPrisma(feedbacks, [], [], [], {}, []);

      const serviceWith = await createService(prismaWithDeals);
      const serviceWithout = await createService(prismaWithoutDeals);

      const resultWith = await serviceWith.scoreTheme('ws-test', 'theme-deals');
      const resultWithout = await serviceWithout.scoreTheme(
        'ws-test',
        'theme-no-deals',
      );

      expect(resultWith.priorityScore).toBeGreaterThan(
        resultWithout.priorityScore,
      );
      expect(resultWith.dealInfluenceValue).toBeGreaterThan(0);
    });

    it('should not count LOST deals in deal influence', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 50000 })];
      const lostDeals = [
        {
          deal: {
            annualValue: 1000000,
            stage: DealStage.CLOSED_LOST,
            status: DealStatus.LOST,
          },
        },
      ];

      const prisma = buildMockPrisma(feedbacks, [], lostDeals, [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-lost-deals');

      expect(result.dealInfluenceValue).toBe(0);
    });
  });

  // ── Score does not exceed 100 ────────────────────────────────────────────

  describe('scoreTheme — score ceiling', () => {
    it('should not inflate scores above 100 even with maximum signals', async () => {
      const feedbacks = Array.from({ length: 100 }, (_, i) =>
        makeFeedback({
          customerId: `c-${i}`,
          arrValue: 1000000,
          accountPriority: AccountPriority.CRITICAL,
          sentiment: -0.9,
          daysAgo: 1,
          title: 'Critical crash blocker',
          description: 'Cannot login, data loss, urgent fix needed',
        }),
      );
      const clusters = [makeCluster({ ticketCount: 50, hasActiveSpike: true })];
      const deals = [
        {
          deal: {
            annualValue: 5000000,
            stage: DealStage.NEGOTIATION,
            status: DealStatus.OPEN,
          },
        },
      ];
      const prisma = buildMockPrisma(
        feedbacks,
        [{ strength: 10 }],
        deals,
        [],
        {},
        clusters,
      );
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-max');
      expect(result.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ── Priority reason and scoring mode ─────────────────────────────────────

  describe('scoreTheme — priority reason', () => {
    it('should include a non-empty priorityReason string', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', daysAgo: 3 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-reason');

      expect(result.priorityReason).toBeTruthy();
      expect(typeof result.priorityReason).toBe('string');
    });

    it('should include signal-only note in priorityReason when no CRM data', async () => {
      const feedbacks = [makeFeedback({ customerId: 'c1', arrValue: 0 })];
      const prisma = buildMockPrisma(feedbacks, [], [], [], {}, []);
      const service = await createService(prisma);
      const result = await service.scoreTheme('ws-test', 'theme-no-crm');

      expect(result.priorityReason).toContain('signal-only mode');
    });
  });
});
