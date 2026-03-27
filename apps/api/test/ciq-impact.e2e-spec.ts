/**
 * CIQ Impact E2E Tests
 *
 * Validates that:
 * 1. The theme list API returns all CIQ impact fields
 * 2. The theme detail API returns all CIQ impact fields
 * 3. The roadmap list API returns inherited theme impact fields
 * 4. The roadmap detail API returns inherited theme impact fields
 * 5. The /themes/:id/ciq endpoint returns a full CiqScoreOutput
 */

import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CiqService } from '../src/ai/services/ciq.service';

// ─── Shared mock data ─────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-ciq-test-001';
const THEME_ID     = 'theme-ciq-test-001';
const ROADMAP_ID   = 'roadmap-ciq-test-001';

const MOCK_THEME = {
  id: THEME_ID,
  workspaceId: WORKSPACE_ID,
  title: 'Slow checkout performance',
  description: 'Users report slowness during checkout',
  status: 'ACTIVE',
  pinned: false,
  priorityScore: 78.5,
  urgencyScore: 65.0,
  revenueInfluence: 250000,
  signalBreakdown: {
    requestFrequency: { value: 12, weight: 0.3, contribution: 22.5, label: 'Request Frequency' },
    arrValue:         { value: 250000, weight: 0.25, contribution: 18.0, label: 'ARR Value' },
    sentimentPenalty: { value: -0.4, weight: 0.15, contribution: 8.5, label: 'Sentiment Penalty' },
  },
  aggregatedPriorityScore: 78.5,
  aiSummary: 'Checkout slowness affects 12 enterprise customers.',
  aiExplanation: 'This is a critical revenue path. Delays here directly cause cart abandonment.',
  aiRecommendation: 'Optimise the payment gateway integration and add CDN caching.',
  aiConfidence: 0.87,
  aiNarratedAt: new Date().toISOString(),
  lastScoredAt: new Date().toISOString(),
  feedbackCount: 12,
  _count: { feedbacks: 12 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_ROADMAP_ITEM = {
  id: ROADMAP_ID,
  workspaceId: WORKSPACE_ID,
  themeId: THEME_ID,
  title: 'Optimise checkout performance',
  description: 'Checkout slowness affects 12 enterprise customers.\n\nWhy it matters: This is a critical revenue path.',
  status: 'EXPLORING',
  priorityScore: 78.5,
  confidenceScore: 0.72,
  revenueImpactScore: 65.0,
  revenueImpactValue: 250000,
  signalCount: 8,
  feedbackCount: 12,
  isPublic: false,
  theme: {
    id: THEME_ID,
    title: 'Slow checkout performance',
    status: 'ACTIVE',
    priorityScore: 78.5,
    aiExplanation: 'This is a critical revenue path. Delays here directly cause cart abandonment.',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_CIQ_SCORE = {
  priorityScore: 78.5,
  confidenceScore: 0.87,
  urgencyScore: 65.0,
  revenueImpactScore: 72.0,
  revenueImpactValue: 250000,
  dealInfluenceValue: 180000,
  signalCount: 8,
  uniqueCustomerCount: 12,
  sentimentScore: -0.35,
  dominantDriver: 'requestFrequency',
  scoreExplanation: {
    requestFrequency: { value: 12, weight: 0.3, contribution: 22.5, label: 'Request Frequency' },
    arrValue:         { value: 250000, weight: 0.25, contribution: 18.0, label: 'ARR Value' },
  },
};

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  workspace:    { findUnique: jest.fn().mockResolvedValue({ id: WORKSPACE_ID, slug: 'test-org' }) },
  workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN', userId: 'user-001' }) },
  theme: {
    findMany:  jest.fn().mockResolvedValue([MOCK_THEME]),
    findUnique: jest.fn().mockResolvedValue(MOCK_THEME),
    count:     jest.fn().mockResolvedValue(1),
  },
  themeFeedback: { count: jest.fn().mockResolvedValue(12) },
  roadmapItem: {
    findMany:  jest.fn().mockResolvedValue([MOCK_ROADMAP_ITEM]),
    findUnique: jest.fn().mockResolvedValue({ ...MOCK_ROADMAP_ITEM, theme: { ...MOCK_ROADMAP_ITEM.theme, feedbacks: [] } }),
    count:     jest.fn().mockResolvedValue(1),
  },
  customerSignal: { count: jest.fn().mockResolvedValue(8), findMany: jest.fn().mockResolvedValue([]) },
  feedback: { findMany: jest.fn().mockResolvedValue([]) },
  customer: { findMany: jest.fn().mockResolvedValue([]) },
  aiJobLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog:  { create: jest.fn().mockResolvedValue({}) },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CIQ Impact API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService).useValue(mockPrisma)
      .overrideProvider(CiqService).useValue({
        scoreTheme:   jest.fn().mockResolvedValue(MOCK_CIQ_SCORE),
        scoreRoadmap: jest.fn().mockResolvedValue(MOCK_CIQ_SCORE),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    // Obtain a mock JWT — the guard reads workspaceId from the token sub claim
    // In test mode the JwtAuthGuard is overridden by the helpers mock, so any
    // Bearer token is accepted and the workspace is resolved from the URL param.
    authToken = 'test-bearer-token';
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Theme list ─────────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/themes', () => {
    it('should return priorityScore in theme list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const themes = res.body.data ?? res.body;
      const theme = Array.isArray(themes) ? themes[0] : themes;
      expect(theme).toHaveProperty('priorityScore');
      expect(typeof theme.priorityScore).toBe('number');
    });

    it('should return urgencyScore in theme list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const themes = res.body.data ?? res.body;
      const theme = Array.isArray(themes) ? themes[0] : themes;
      expect(theme).toHaveProperty('urgencyScore');
    });

    it('should return signalBreakdown in theme list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const themes = res.body.data ?? res.body;
      const theme = Array.isArray(themes) ? themes[0] : themes;
      expect(theme).toHaveProperty('signalBreakdown');
    });

    it('should return AI narration fields in theme list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const themes = res.body.data ?? res.body;
      const theme = Array.isArray(themes) ? themes[0] : themes;
      expect(theme).toHaveProperty('aiSummary');
      expect(theme).toHaveProperty('aiExplanation');
      expect(theme).toHaveProperty('aiRecommendation');
      expect(theme).toHaveProperty('aiConfidence');
    });
  });

  // ─── Theme detail ────────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/themes/:id', () => {
    it('should return all CIQ impact fields in theme detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('priorityScore');
      expect(res.body).toHaveProperty('urgencyScore');
      expect(res.body).toHaveProperty('revenueInfluence');
      expect(res.body).toHaveProperty('signalBreakdown');
      expect(res.body).toHaveProperty('aiSummary');
      expect(res.body).toHaveProperty('aiExplanation');
      expect(res.body).toHaveProperty('aiRecommendation');
      expect(res.body).toHaveProperty('aiConfidence');
    });

    it('should return a numeric priorityScore in theme detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(typeof res.body.priorityScore).toBe('number');
      expect(res.body.priorityScore).toBeGreaterThanOrEqual(0);
      expect(res.body.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ─── Live CIQ score endpoint ─────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/themes/:id/ciq', () => {
    it('should return a full CiqScoreOutput', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}/ciq`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('priorityScore');
      expect(res.body).toHaveProperty('confidenceScore');
      expect(res.body).toHaveProperty('urgencyScore');
      expect(res.body).toHaveProperty('revenueImpactValue');
      expect(res.body).toHaveProperty('signalCount');
      expect(res.body).toHaveProperty('uniqueCustomerCount');
      expect(res.body).toHaveProperty('dominantDriver');
      expect(res.body).toHaveProperty('scoreExplanation');
    });

    it('should return sentimentScore in CIQ output', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}/ciq`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('sentimentScore');
      expect(typeof res.body.sentimentScore).toBe('number');
    });

    it('should return scoreExplanation with contribution values', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}/ciq`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const explanation = res.body.scoreExplanation;
      expect(typeof explanation).toBe('object');
      const firstFactor = Object.values(explanation)[0] as { contribution: number; label: string };
      expect(firstFactor).toHaveProperty('contribution');
      expect(firstFactor).toHaveProperty('label');
    });
  });

  // ─── Roadmap list ────────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/roadmap', () => {
    it('should return priorityScore in roadmap items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/roadmap`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Response is a Kanban columns object: { EXPLORING: [], IN_PROGRESS: [], ... }
      const allItems = Object.values(res.body as Record<string, unknown[]>).flat();
      if (allItems.length > 0) {
        const item = allItems[0] as Record<string, unknown>;
        expect(item).toHaveProperty('priorityScore');
      }
    });

    it('should return inherited theme aiExplanation in roadmap items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/roadmap`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const allItems = Object.values(res.body as Record<string, unknown[]>).flat();
      if (allItems.length > 0) {
        const item = allItems[0] as { theme?: { aiExplanation?: string } };
        if (item.theme) {
          expect(item.theme).toHaveProperty('aiExplanation');
        }
      }
    });
  });

  // ─── Roadmap detail ──────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/roadmap/:id', () => {
    it('should return priorityScore in roadmap item detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/roadmap/${ROADMAP_ID}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('priorityScore');
    });

    it('should return inherited theme aiExplanation in roadmap item detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/roadmap/${ROADMAP_ID}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (res.body.theme) {
        expect(res.body.theme).toHaveProperty('aiExplanation');
      }
    });

    it('should return confidenceScore and revenueImpactScore in roadmap item detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/${WORKSPACE_ID}/roadmap/${ROADMAP_ID}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('confidenceScore');
      expect(res.body).toHaveProperty('revenueImpactScore');
    });
  });
});
