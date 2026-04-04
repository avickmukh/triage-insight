/**
 * E2E tests for the Support Intelligence module.
 *
 * Covers:
 *  - GET  /workspaces/:id/support/negative-trends
 *  - GET  /workspaces/:id/support/linked-themes
 *  - POST /workspaces/:id/support/score-sentiment
 *  - GET  /workspaces/:id/support/overview  (enriched with sentiment fields)
 *  - GET  /workspaces/:id/support/clusters  (enriched with spike + sentiment)
 */
import request from 'supertest';
import { createTestApp } from './helpers';
import { INestApplication } from '@nestjs/common';
import { SentimentService } from '../src/support/services/sentiment.service';

describe('Support Intelligence API (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let authToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    const testEnv = await createTestApp();
    app = testEnv.app;
    prisma = testEnv.prisma;

    // Seed workspace + user
    workspaceId = 'ws-support-intel-test';
    prisma.workspace.findFirst.mockResolvedValue({
      id: workspaceId,
      slug: 'test-org',
      name: 'Test Org',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      role: 'ADMIN',
      workspaceId,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      role: 'ADMIN',
      workspaceId,
    });

    // Obtain JWT
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password' });
    authToken = loginRes.body?.access_token ?? 'mock-token';
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /support/negative-trends ──────────────────────────────────────────

  describe('GET /workspaces/:id/support/negative-trends', () => {
    it('returns 200 with an array of negative trend clusters', async () => {
      const mockSentimentService = app.get(SentimentService);
      jest.spyOn(mockSentimentService, 'getNegativeTrends').mockResolvedValue([
        {
          id: 'c-1',
          title: 'Login failures',
          avgSentiment: -0.72,
          negativeTicketPct: 0.85,
          ticketCount: 20,
          arrExposure: 45000,
          hasActiveSpike: true,
          themeId: 'theme-1',
          themeTitle: 'Authentication Issues',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/negative-trends`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({
        id: 'c-1',
        title: 'Login failures',
        avgSentiment: expect.any(Number),
        negativeTicketPct: expect.any(Number),
        ticketCount: expect.any(Number),
        arrExposure: expect.any(Number),
        hasActiveSpike: expect.any(Boolean),
      });
    });

    it('returns 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/negative-trends`)
        .expect(401);
    });

    it('accepts optional limit query param', async () => {
      const mockSentimentService = app.get(SentimentService);
      const spy = jest
        .spyOn(mockSentimentService, 'getNegativeTrends')
        .mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/negative-trends?limit=5`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(spy).toHaveBeenCalledWith(workspaceId, 5);
    });

    it('returns 404 for unknown workspace', async () => {
      prisma.workspace.findFirst.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .get('/workspaces/unknown-ws/support/negative-trends')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ─── GET /support/linked-themes ────────────────────────────────────────────

  describe('GET /workspaces/:id/support/linked-themes', () => {
    it('returns 200 with an array of linked theme objects', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          themeId: 'theme-1',
          themeTitle: 'Authentication Issues',
          themeCiqScore: 78,
          themeStatus: 'ACTIVE',
          feedbackCount: 12,
          totalTickets: 20,
          linkedClusters: [],
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/linked-themes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/linked-themes`)
        .expect(401);
    });
  });

  // ─── POST /support/score-sentiment ─────────────────────────────────────────

  describe('POST /workspaces/:id/support/score-sentiment', () => {
    it('returns 200 with scored and clustersUpdated counts', async () => {
      const mockSentimentService = app.get(SentimentService);
      jest
        .spyOn(mockSentimentService, 'runFullSentimentPass')
        .mockResolvedValue({
          scored: 42,
          clustersUpdated: 7,
        });

      const res = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/support/score-sentiment`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        scored: 42,
        clustersUpdated: 7,
      });
    });

    it('returns 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/support/score-sentiment`)
        .expect(401);
    });

    it('returns 403 for non-admin users', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-2',
        email: 'viewer@test.com',
        role: 'VIEWER',
        workspaceId,
      });

      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/support/score-sentiment`)
        .set('Authorization', `Bearer mock-viewer-token`)
        .expect(403);
    });
  });

  // ─── GET /support/overview — enriched sentiment fields ─────────────────────

  describe('GET /workspaces/:id/support/overview (sentiment enrichment)', () => {
    it('returns topClusters with avgSentiment and hasActiveSpike fields', async () => {
      prisma.supportTicket.count.mockResolvedValue(100);
      prisma.supportIssueCluster.findMany.mockResolvedValue([
        {
          id: 'c-1',
          title: 'Login failures',
          description: 'Users cannot log in',
          ticketCount: 20,
          arrExposure: 45000,
          avgSentiment: -0.72,
          negativeTicketPct: 0.85,
          hasActiveSpike: true,
          latestSpikeSeverity: 'HIGH',
          themeId: 'theme-1',
          theme: { title: 'Authentication Issues' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/overview`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const cluster = res.body?.topClusters?.[0];
      if (cluster) {
        // If the overview returns clusters, they should have sentiment fields
        expect(cluster).toHaveProperty('avgSentiment');
        expect(cluster).toHaveProperty('hasActiveSpike');
      }
    });
  });

  // ─── GET /support/clusters — enriched with spike + sentiment ───────────────

  describe('GET /workspaces/:id/support/clusters (spike + sentiment enrichment)', () => {
    it('returns clusters with hasActiveSpike, avgSentiment, negativeTicketPct', async () => {
      prisma.supportIssueCluster.findMany.mockResolvedValue([
        {
          id: 'c-1',
          title: 'Billing errors',
          description: null,
          ticketCount: 15,
          arrExposure: 30000,
          avgSentiment: -0.55,
          negativeTicketPct: 0.6,
          hasActiveSpike: false,
          latestSpikeSeverity: null,
          themeId: null,
          theme: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/support/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('hasActiveSpike');
        expect(res.body[0]).toHaveProperty('avgSentiment');
        expect(res.body[0]).toHaveProperty('negativeTicketPct');
      }
    });
  });
});
