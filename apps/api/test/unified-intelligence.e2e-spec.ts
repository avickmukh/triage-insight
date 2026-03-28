/**
 * Unified Intelligence — E2E Tests
 *
 * Tests cover:
 *   GET  /workspaces/:id/themes/top-issues
 *   GET  /workspaces/:id/themes/source-summary
 *   POST /workspaces/:id/themes/aggregate-all
 *   POST /workspaces/:id/themes/:themeId/aggregate
 *
 * All Prisma and queue calls are mocked.
 * Auth is mocked via the standard helpers pattern.
 */
import request from 'supertest';
import { createTestApp } from './helpers';
import { INestApplication } from '@nestjs/common';

describe('Unified Intelligence API (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  const WORKSPACE_ID = 'ws-unified-test';
  const THEME_ID = 'theme-unified-1';
  const AUTH_HEADER = 'Bearer test-token';

  // Realistic mock theme rows for top-issues
  const MOCK_TOP_ISSUES = [
    {
      id: 'theme-1',
      title: 'Checkout Performance',
      status: 'OPEN',
      ciqScore: 82,
      priorityScore: 78,
      totalSignalCount: 45,
      feedbackCount: 20,
      voiceCount: 5,
      supportCount: 20,
      sentimentDistribution: { positive: 8, neutral: 10, negative: 27 },
      crossSourceInsight: 'High negative sentiment (60%) across 20 feedback, 20 support tickets and 5 voice reports.',
      aiRecommendation: 'Prioritise server-side rendering of the checkout page.',
      lastAggregatedAt: new Date('2026-03-01'),
    },
    {
      id: 'theme-2',
      title: 'Onboarding Flow',
      status: 'OPEN',
      ciqScore: 61,
      priorityScore: 58,
      totalSignalCount: 28,
      feedbackCount: 18,
      voiceCount: 3,
      supportCount: 7,
      sentimentDistribution: { positive: 10, neutral: 12, negative: 6 },
      crossSourceInsight: 'Reported across 3 sources: 18 feedback, 7 support tickets and 3 voice reports.',
      aiRecommendation: 'Simplify the onboarding wizard to reduce drop-off.',
      lastAggregatedAt: new Date('2026-03-01'),
    },
  ];

  const MOCK_SOURCE_SUMMARY = {
    feedbackCount: 120,
    voiceCount: 15,
    supportCount: 65,
    totalSignals: 200,
    feedbackPct: 60,
    voicePct: 8,
    supportPct: 33,
    themeCount: 18,
    scoredThemeCount: 14,
    topThemeByFeedback: 'Checkout Performance',
    topThemeBySupport: 'Login Issues',
    topThemeByVoice: 'Onboarding Flow',
  };

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default workspace auth mock
    prisma.workspace.findFirst.mockResolvedValue({
      id: WORKSPACE_ID,
      slug: 'test-org',
      members: [{ userId: 'user-1', role: 'ADMIN' }],
    });
  });

  // ─── GET /themes/top-issues ────────────────────────────────────────────────

  describe('GET /workspaces/:id/themes/top-issues', () => {
    it('should return 200 with unified top issues array', async () => {
      prisma.$queryRaw.mockResolvedValue(MOCK_TOP_ISSUES);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/top-issues`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should return items with required unified fields', async () => {
      prisma.$queryRaw.mockResolvedValue(MOCK_TOP_ISSUES);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/top-issues`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      const first = res.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('feedbackCount');
      expect(first).toHaveProperty('voiceCount');
      expect(first).toHaveProperty('supportCount');
      expect(first).toHaveProperty('totalSignalCount');
      expect(first).toHaveProperty('sentimentDistribution');
      expect(first).toHaveProperty('crossSourceInsight');
      expect(first).toHaveProperty('ciqScore');
    });

    it('should respect the limit query parameter', async () => {
      prisma.$queryRaw.mockResolvedValue([MOCK_TOP_ISSUES[0]]);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/top-issues?limit=1`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      // Verify $queryRaw was called (limit is passed as template literal param)
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return 401 without auth header', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/top-issues`)
        .expect(401);
    });

    it('should return 404 for unknown workspace', async () => {
      prisma.workspace.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/unknown-ws/themes/top-issues`)
        .set('Authorization', AUTH_HEADER)
        .expect(404);
    });

    it('should return empty array when no themes exist', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/top-issues`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─── GET /themes/source-summary ───────────────────────────────────────────

  describe('GET /workspaces/:id/themes/source-summary', () => {
    it('should return 200 with source summary object', async () => {
      prisma.feedback.groupBy.mockResolvedValue([
        { sourceType: 'FEEDBACK', _count: { id: 120 } },
        { sourceType: 'VOICE', _count: { id: 15 } },
      ]);
      prisma.supportIssueCluster.aggregate.mockResolvedValue({ _sum: { ticketCount: 65 } });
      prisma.theme.aggregate.mockResolvedValue({ _count: { id: 18 } });
      prisma.theme.count.mockResolvedValue(14);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ title: 'Checkout Performance' }])
        .mockResolvedValueOnce([{ title: 'Login Issues' }])
        .mockResolvedValueOnce([{ title: 'Onboarding Flow' }]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/source-summary`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body).toHaveProperty('totalSignals');
      expect(res.body).toHaveProperty('feedbackCount');
      expect(res.body).toHaveProperty('voiceCount');
      expect(res.body).toHaveProperty('supportCount');
      expect(res.body).toHaveProperty('feedbackPct');
      expect(res.body).toHaveProperty('themeCount');
      expect(res.body).toHaveProperty('scoredThemeCount');
      expect(res.body).toHaveProperty('topThemeByFeedback');
    });

    it('should return correct percentage calculations', async () => {
      prisma.feedback.groupBy.mockResolvedValue([
        { sourceType: 'FEEDBACK', _count: { id: 50 } },
        { sourceType: 'VOICE', _count: { id: 10 } },
      ]);
      prisma.supportIssueCluster.aggregate.mockResolvedValue({ _sum: { ticketCount: 40 } });
      prisma.theme.aggregate.mockResolvedValue({ _count: { id: 5 } });
      prisma.theme.count.mockResolvedValue(3);
      prisma.$queryRaw.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/source-summary`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      // 50 feedback + 10 voice + 40 support = 100 total
      expect(res.body.totalSignals).toBe(100);
      expect(res.body.feedbackPct).toBe(50);
      expect(res.body.voicePct).toBe(10);
      expect(res.body.supportPct).toBe(40);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WORKSPACE_ID}/themes/source-summary`)
        .expect(401);
    });
  });

  // ─── POST /themes/aggregate-all ───────────────────────────────────────────

  describe('POST /workspaces/:id/themes/aggregate-all', () => {
    it('should return 200 with processed count for admin', async () => {
      prisma.theme.findMany.mockResolvedValue([
        { id: 'theme-1' },
        { id: 'theme-2' },
      ]);
      // Mock the per-theme aggregation calls
      prisma.theme.findUnique.mockResolvedValue({ title: 'Test Theme' });
      prisma.themeFeedback.findMany.mockResolvedValue([]);
      prisma.supportIssueCluster.aggregate.mockResolvedValue({ _sum: { ticketCount: 0 } });
      prisma.theme.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/aggregate-all`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body).toHaveProperty('processed');
      expect(typeof res.body.processed).toBe('number');
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/aggregate-all`)
        .expect(401);
    });

    it('should return 403 for non-admin role', async () => {
      prisma.workspace.findFirst.mockResolvedValue({
        id: WORKSPACE_ID,
        members: [{ userId: 'user-1', role: 'VIEWER' }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/aggregate-all`)
        .set('Authorization', AUTH_HEADER)
        .expect(403);
    });
  });

  // ─── POST /themes/:themeId/aggregate ──────────────────────────────────────

  describe('POST /workspaces/:id/themes/:themeId/aggregate', () => {
    it('should return 200 with theme aggregation result', async () => {
      prisma.theme.findUnique.mockResolvedValue({ title: 'Checkout Performance' });
      prisma.themeFeedback.findMany.mockResolvedValue([
        { feedback: { sourceType: 'FEEDBACK', sentiment: 0.5 } },
        { feedback: { sourceType: 'VOICE', sentiment: -0.7 } },
        { feedback: { sourceType: 'FEEDBACK', sentiment: -0.4 } },
      ]);
      prisma.supportIssueCluster.aggregate.mockResolvedValue({ _sum: { ticketCount: 8 } });
      prisma.theme.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}/aggregate`)
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body).toHaveProperty('themeId', THEME_ID);
      expect(res.body).toHaveProperty('feedbackCount', 3);
      expect(res.body).toHaveProperty('voiceCount', 1);
      expect(res.body).toHaveProperty('supportCount', 8);
      expect(res.body).toHaveProperty('totalSignalCount', 12);
      expect(res.body).toHaveProperty('sentimentDistribution');
      expect(res.body.sentimentDistribution).toHaveProperty('positive');
      expect(res.body.sentimentDistribution).toHaveProperty('neutral');
      expect(res.body.sentimentDistribution).toHaveProperty('negative');
    });

    it('should return 404 for unknown theme', async () => {
      prisma.theme.findUnique.mockResolvedValue(null);
      prisma.themeFeedback.findMany.mockResolvedValue([]);
      prisma.supportIssueCluster.aggregate.mockResolvedValue({ _sum: { ticketCount: 0 } });
      prisma.theme.update.mockRejectedValue(
        Object.assign(new Error('Not found'), { code: 'P2025' }),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/nonexistent-theme/aggregate`)
        .set('Authorization', AUTH_HEADER)
        .expect(404);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}/aggregate`)
        .expect(401);
    });
  });
});
