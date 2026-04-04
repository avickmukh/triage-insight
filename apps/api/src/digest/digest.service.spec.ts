/**
 * DigestService — test suite
 *
 * Covers:
 *   1. generateDigest — happy path (LLM succeeds)
 *   2. generateDigest — LLM fallback (callLlm throws → rule-based summary)
 *   3. generateDigest — enriched context (CIQ/urgency/support/voice counts)
 *   4. generateDigest — empty workspace (no themes, no feedback)
 *   5. generateDigest — spike events included in context
 *   6. generateDigest — sentiment trend computation (improving / declining / stable)
 *   7. getLatest — returns most recent DigestRun
 *   8. getLatest — returns null when no digest exists
 *   9. getHistory — returns paginated history (default limit 10)
 *  10. getHistory — respects custom limit
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DigestService } from './digest.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { DigestFrequency } from '@prisma/client';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-test-001';

const makeTheme = (overrides: Record<string, unknown> = {}) => ({
  id: 'theme-1',
  title: 'Slow API response times',
  description: 'Users report high latency on dashboard load',
  priorityScore: 0.84,
  ciqScore: 84,
  urgencyScore: 72,
  revenueScore: 45,
  totalSignalCount: 18,
  feedbackCount: 10,
  supportCount: 6,
  voiceCount: 2,
  crossSourceInsight: 'Reported across feedback, support, and voice channels.',
  aiSummary: 'High-latency issue affecting enterprise customers.',
  aiExplanation: 'Linked to 3 enterprise accounts with combined ARR of $240k.',
  aiRecommendation: 'Prioritise DB query optimisation sprint.',
  aiConfidence: 0.91,
  _count: { feedbacks: 10 },
  ...overrides,
});

const MOCK_NARRATION = {
  topIssues: ['Slow API response times affect 40% of enterprise users.'],
  emergingTrends: ['Mobile usage increasing — latency more noticeable on 3G.'],
  recommendations: ['Schedule DB optimisation sprint for next cycle.'],
  narrativeSummary:
    'API latency is the top issue this week. Immediate action required.',
};

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPrisma = {
  theme: { findMany: jest.fn() },
  feedback: { aggregate: jest.fn() },
  issueSpikeEvent: { findMany: jest.fn() },
  digestRun: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockEmailService = { sendDigestEmail: jest.fn() };

const mockConfigService = {
  get: jest.fn((key: string, fallback?: string) => {
    if (key === 'OPENAI_API_KEY') return 'sk-test-key';
    return fallback ?? '';
  }),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Spy on the private `callLlm` method to avoid real OpenAI calls.
 * Returns a jest.SpyInstance that resolves with MOCK_NARRATION by default.
 */
function spyCallLlm(service: DigestService, resolveWith = MOCK_NARRATION) {
  return jest.spyOn(service as any, 'callLlm').mockResolvedValue(resolveWith);
}

function spyCallLlmThrows(
  service: DigestService,
  error = new Error('OpenAI timeout'),
) {
  return jest.spyOn(service as any, 'callLlm').mockRejectedValue(error);
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('DigestService', () => {
  let service: DigestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
    jest.clearAllMocks();

    // Default mock responses
    mockPrisma.theme.findMany.mockResolvedValue([makeTheme()]);
    mockPrisma.feedback.aggregate
      .mockResolvedValueOnce({ _avg: { sentiment: 0.4 }, _count: { id: 12 } }) // current period
      .mockResolvedValueOnce({ _avg: { sentiment: 0.3 }, _count: { id: 8 } }); // prior period
    mockPrisma.issueSpikeEvent.findMany.mockResolvedValue([]);
    mockPrisma.digestRun.create.mockResolvedValue({
      id: 'digest-run-001',
      workspaceId: WORKSPACE_ID,
      sentAt: new Date().toISOString(),
      summary: {},
    });
  });

  // ── 1. Happy path ────────────────────────────────────────────────────────────

  describe('generateDigest — happy path', () => {
    it('returns a DigestRun with the correct workspaceId', async () => {
      spyCallLlm(service);
      const result = await service.generateDigest(WORKSPACE_ID);
      expect(result).toHaveProperty('id', 'digest-run-001');
      expect(mockPrisma.digestRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: WORKSPACE_ID }),
        }),
      );
    });

    it('calls theme.findMany with workspaceId and date filter', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID, DigestFrequency.WEEKLY);
      const args = mockPrisma.theme.findMany.mock.calls[0][0];
      expect(args.where.workspaceId).toBe(WORKSPACE_ID);
      expect(args.where.feedbacks.some.assignedAt.gte).toBeInstanceOf(Date);
    });

    it('persists narration in summary.narration when LLM succeeds', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.narration).toMatchObject(MOCK_NARRATION);
      expect(createArgs.data.summary.generatedBy).toBe('llm');
    });

    it('includes sentiment in the persisted summary', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.sentimentSummary._avg.sentiment).toBe(0.4);
    });

    it('includes feedbackVolume with delta in the persisted summary', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.feedbackVolume).toMatchObject({
        current: 12,
        previous: 8,
        delta: 4,
      });
    });
  });

  // ── 2. LLM fallback ──────────────────────────────────────────────────────────

  describe('generateDigest — LLM fallback', () => {
    it('falls back to rule-based summary when LLM throws', async () => {
      spyCallLlmThrows(service);
      const result = await service.generateDigest(WORKSPACE_ID);
      // Should still return a DigestRun (no throw)
      expect(result).toHaveProperty('id', 'digest-run-001');
    });

    it('marks generatedBy as rule-based when LLM fails', async () => {
      spyCallLlmThrows(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.generatedBy).toBe('rule-based');
    });

    it('still persists a summaryText when LLM fails', async () => {
      spyCallLlmThrows(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(typeof createArgs.data.summary.summaryText).toBe('string');
      expect(createArgs.data.summary.summaryText.length).toBeGreaterThan(0);
    });
  });

  // ── 3. Enriched context ──────────────────────────────────────────────────────

  describe('generateDigest — enriched CIQ/signal context', () => {
    it('includes ciqScore, supportCount, voiceCount in topThemes payload', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      const theme = createArgs.data.summary.topThemes[0];
      expect(theme.ciqScore).toBe(84);
      expect(theme.supportCount).toBe(6);
      expect(theme.voiceCount).toBe(2);
    });

    it('includes urgencyScore and revenueScore when present', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      const theme = createArgs.data.summary.topThemes[0];
      expect(theme.urgencyScore).toBe(72);
      expect(theme.revenueScore).toBe(45);
    });

    it('includes crossSourceInsight in topThemes payload', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      const theme = createArgs.data.summary.topThemes[0];
      expect(theme.crossSourceInsight).toContain(
        'feedback, support, and voice',
      );
    });
  });

  // ── 4. Empty workspace ───────────────────────────────────────────────────────

  describe('generateDigest — empty workspace', () => {
    beforeEach(() => {
      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.feedback.aggregate
        .mockResolvedValueOnce({ _avg: { sentiment: null }, _count: { id: 0 } })
        .mockResolvedValueOnce({
          _avg: { sentiment: null },
          _count: { id: 0 },
        });
    });

    it('does not throw when there are no themes or feedback', async () => {
      spyCallLlm(service, {
        topIssues: [],
        emergingTrends: [],
        recommendations: [],
        narrativeSummary: 'No activity this week.',
      });
      await expect(service.generateDigest(WORKSPACE_ID)).resolves.toBeDefined();
    });

    it('persists an empty topThemes array', async () => {
      spyCallLlm(service, {
        topIssues: [],
        emergingTrends: [],
        recommendations: [],
        narrativeSummary: 'No activity this week.',
      });
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.topThemes).toEqual([]);
    });
  });

  // ── 5. Spike events ──────────────────────────────────────────────────────────

  describe('generateDigest — spike events', () => {
    const mockSpike = {
      id: 'spike-1',
      ticketCount: 42,
      zScore: 3.8,
      cluster: { title: 'Login failures' },
    };

    beforeEach(() => {
      mockPrisma.issueSpikeEvent.findMany.mockResolvedValue([mockSpike]);
    });

    it('includes spike events in the persisted summary', async () => {
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.spikeEvents).toHaveLength(1);
      expect(createArgs.data.summary.spikeEvents[0]).toMatchObject({
        clusterTitle: 'Login failures',
        ticketCount: 42,
        zScore: 3.8,
      });
    });
  });

  // ── 6. Sentiment trend ───────────────────────────────────────────────────────

  describe('generateDigest — sentiment trend', () => {
    it('sets trend to "improving" when current sentiment > prior + 0.05', async () => {
      mockPrisma.feedback.aggregate
        .mockResolvedValueOnce({ _avg: { sentiment: 0.5 }, _count: { id: 10 } })
        .mockResolvedValueOnce({ _avg: { sentiment: 0.3 }, _count: { id: 8 } });
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.sentimentSummary.trend).toBe('improving');
    });

    it('sets trend to "declining" when current sentiment < prior - 0.05', async () => {
      mockPrisma.feedback.aggregate
        .mockResolvedValueOnce({ _avg: { sentiment: 0.1 }, _count: { id: 10 } })
        .mockResolvedValueOnce({ _avg: { sentiment: 0.5 }, _count: { id: 8 } });
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.sentimentSummary.trend).toBe('declining');
    });

    it('sets trend to "stable" when change is within ±0.05', async () => {
      mockPrisma.feedback.aggregate
        .mockResolvedValueOnce({ _avg: { sentiment: 0.4 }, _count: { id: 10 } })
        .mockResolvedValueOnce({
          _avg: { sentiment: 0.42 },
          _count: { id: 8 },
        });
      spyCallLlm(service);
      await service.generateDigest(WORKSPACE_ID);
      const createArgs = mockPrisma.digestRun.create.mock.calls[0][0];
      expect(createArgs.data.summary.sentimentSummary.trend).toBe('stable');
    });
  });

  // ── 7. getLatest ─────────────────────────────────────────────────────────────

  describe('getLatest', () => {
    it('returns the most recent DigestRun for a workspace', async () => {
      const mockRun = {
        id: 'run-latest',
        workspaceId: WORKSPACE_ID,
        sentAt: new Date().toISOString(),
        summary: {},
      };
      mockPrisma.digestRun.findFirst.mockResolvedValue(mockRun);
      const result = await service.getLatest(WORKSPACE_ID);
      expect(result).toEqual(mockRun);
      expect(mockPrisma.digestRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID },
          orderBy: { sentAt: 'desc' },
        }),
      );
    });

    it('returns null when no digest has been generated', async () => {
      mockPrisma.digestRun.findFirst.mockResolvedValue(null);
      const result = await service.getLatest(WORKSPACE_ID);
      expect(result).toBeNull();
    });
  });

  // ── 8. getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    const mockHistory = [
      { id: 'run-3', sentAt: new Date().toISOString(), summary: {} },
      {
        id: 'run-2',
        sentAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        summary: {},
      },
      {
        id: 'run-1',
        sentAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        summary: {},
      },
    ];

    it('returns digest history ordered newest first', async () => {
      mockPrisma.digestRun.findMany.mockResolvedValue(mockHistory);
      const result = await service.getHistory(WORKSPACE_ID);
      expect(result).toEqual(mockHistory);
      expect(mockPrisma.digestRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID },
          orderBy: { sentAt: 'desc' },
        }),
      );
    });

    it('uses default limit of 10', async () => {
      mockPrisma.digestRun.findMany.mockResolvedValue([]);
      await service.getHistory(WORKSPACE_ID);
      const args = mockPrisma.digestRun.findMany.mock.calls[0][0];
      expect(args.take).toBe(10);
    });

    it('respects a custom limit', async () => {
      mockPrisma.digestRun.findMany.mockResolvedValue([]);
      await service.getHistory(WORKSPACE_ID, 5);
      const args = mockPrisma.digestRun.findMany.mock.calls[0][0];
      expect(args.take).toBe(5);
    });

    it('selects only id, sentAt, and summary fields', async () => {
      mockPrisma.digestRun.findMany.mockResolvedValue([]);
      await service.getHistory(WORKSPACE_ID);
      const args = mockPrisma.digestRun.findMany.mock.calls[0][0];
      expect(args.select).toMatchObject({
        id: true,
        sentAt: true,
        summary: true,
      });
    });
  });
});
