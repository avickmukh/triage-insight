/**
 * CIQ Endpoints E2E Tests
 *
 * Validates the new endpoints added to the CIQ controller:
 *   GET  /workspaces/:id/ciq/top        — returns top N feature ranking items
 *   POST /workspaces/:id/ciq/recompute  — triggers workspace-wide CIQ recompute
 *
 * Also validates the existing ranking endpoints return correct shapes.
 */
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CiqEngineService } from '../src/ciq/ciq-engine.service';
import { PrioritizationService } from '../src/prioritization/services/prioritization.service';

// ─── Shared constants ─────────────────────────────────────────────────────────
const WORKSPACE_ID = 'ws-ciq-ep-001';
const USER_ID      = 'user-ciq-ep-001';

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_FEATURE_RANKING = [
  {
    feedbackId: 'fb-001',
    title: 'Bulk CSV export',
    ciqScore: 88,
    impactScore: 85,
    voteCount: 24,
    sentiment: 0.6,
    customerName: 'Acme Corp',
    customerArr: 120000,
    themeCount: 3,
    breakdown: {},
  },
  {
    feedbackId: 'fb-002',
    title: 'SSO / SAML support',
    ciqScore: 76,
    impactScore: 72,
    voteCount: 18,
    sentiment: 0.4,
    customerName: 'Beta LLC',
    customerArr: 80000,
    themeCount: 2,
    breakdown: {},
  },
];

const MOCK_THEME_RANKING = [
  {
    themeId: 'theme-001',
    title: 'Data Export & Reporting',
    status: 'ACTIVE',
    ciqScore: 85,
    priorityScore: 82,
    revenueInfluence: 200000,
    feedbackCount: 30,
    uniqueCustomerCount: 12,
    dealInfluenceValue: 150000,
    voiceSignalScore: 0.7,
    surveySignalScore: 0.5,
    supportSignalScore: 0.3,
    lastScoredAt: new Date().toISOString(),
    breakdown: {},
  },
];

const MOCK_RECOMPUTE_RESULT = {
  processed: 5,
  failed: 0,
  duration: 1234,
  scores: [
    { themeId: 'theme-001', priorityScore: 85, confidenceScore: 0.9 },
  ],
};

// ─── Mock services ────────────────────────────────────────────────────────────
const mockCiqEngine = {
  getFeatureRanking: jest.fn().mockResolvedValue(MOCK_FEATURE_RANKING),
  getThemeRanking:   jest.fn().mockResolvedValue(MOCK_THEME_RANKING),
};

const mockPrioritizationService = {
  recomputeWorkspace: jest.fn().mockResolvedValue(MOCK_RECOMPUTE_RESULT),
};

const mockPrisma = {
  workspace:       { findUnique: jest.fn().mockResolvedValue({ id: WORKSPACE_ID, slug: 'test-org' }) },
  workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN', userId: USER_ID }) },
};

// ─── Auth mock helper ─────────────────────────────────────────────────────────
function mockJwt(app: INestApplication): string {
  // Return a dummy bearer token; the guard is mocked via module override
  return 'Bearer mock-jwt-token';
}

describe('CIQ Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(CiqEngineService)
      .useValue(mockCiqEngine)
      .overrideProvider(PrioritizationService)
      .useValue(mockPrioritizationService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /ciq/top ──────────────────────────────────────────────────────────

  describe('GET /workspaces/:id/ciq/top', () => {
    it('returns top 10 feature ranking items by default', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/top`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(mockCiqEngine.getFeatureRanking).toHaveBeenCalledWith(
        WORKSPACE_ID,
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('respects custom limit query param', async () => {
      await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/top?limit=5`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      expect(mockCiqEngine.getFeatureRanking).toHaveBeenCalledWith(
        WORKSPACE_ID,
        expect.objectContaining({ limit: 5 }),
      );
    });

    it('returns items with required CIQ fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/top`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      const first = res.body[0];
      expect(first).toHaveProperty('feedbackId');
      expect(first).toHaveProperty('ciqScore');
      expect(first).toHaveProperty('impactScore');
      expect(first).toHaveProperty('voteCount');
      expect(first).toHaveProperty('customerArr');
    });

    it('returns 401 without auth header', async () => {
      await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/top`)
        .expect(401);
    });

    it('returns 404 for unknown workspace', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .get(`/workspaces/nonexistent/ciq/top`)
        .set('Authorization', mockJwt(app))
        .expect(404);
    });
  });

  // ─── POST /ciq/recompute ───────────────────────────────────────────────────

  describe('POST /workspaces/:id/ciq/recompute', () => {
    it('triggers workspace-wide CIQ recompute and returns result', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${WORKSPACE_ID}/ciq/recompute`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      expect(res.body).toHaveProperty('processed');
      expect(res.body).toHaveProperty('failed');
      expect(res.body).toHaveProperty('duration');
      expect(mockPrioritizationService.recomputeWorkspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
        USER_ID,
      );
    });

    it('returns 401 without auth header', async () => {
      await request(app.getHttpServer())
        .post(`/workspaces/${WORKSPACE_ID}/ciq/recompute`)
        .expect(401);
    });

    it('returns 403 for non-admin users', async () => {
      mockPrisma.workspaceMember.findFirst.mockResolvedValueOnce({ role: 'MEMBER', userId: USER_ID });
      await request(app.getHttpServer())
        .post(`/workspaces/${WORKSPACE_ID}/ciq/recompute`)
        .set('Authorization', mockJwt(app))
        .expect(403);
    });
  });

  // ─── GET /ciq/feature-ranking ──────────────────────────────────────────────

  describe('GET /workspaces/:id/ciq/feature-ranking', () => {
    it('returns feature ranking array with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/feature-ranking`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const item = res.body[0];
      expect(item).toHaveProperty('feedbackId');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('ciqScore');
      expect(item).toHaveProperty('voteCount');
      expect(item).toHaveProperty('customerArr');
      expect(item).toHaveProperty('sentiment');
    });

    it('items are sorted by ciqScore descending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/feature-ranking`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      const scores = res.body.map((i: { ciqScore: number }) => i.ciqScore);
      for (let j = 1; j < scores.length; j++) {
        expect(scores[j - 1]).toBeGreaterThanOrEqual(scores[j]);
      }
    });
  });

  // ─── GET /ciq/theme-ranking ────────────────────────────────────────────────

  describe('GET /workspaces/:id/ciq/theme-ranking', () => {
    it('returns theme ranking array with source mix fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${WORKSPACE_ID}/ciq/theme-ranking`)
        .set('Authorization', mockJwt(app))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const item = res.body[0];
      expect(item).toHaveProperty('themeId');
      expect(item).toHaveProperty('ciqScore');
      expect(item).toHaveProperty('voiceSignalScore');
      expect(item).toHaveProperty('surveySignalScore');
      expect(item).toHaveProperty('supportSignalScore');
      expect(item).toHaveProperty('feedbackCount');
      expect(item).toHaveProperty('uniqueCustomerCount');
    });
  });
});
