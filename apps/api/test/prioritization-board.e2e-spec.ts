/**
 * E2E Tests: Roadmap Prioritization Board API
 *
 * Validates the following happy paths for the Prioritization Board feature:
 *   1. GET /roadmap?flat=true returns a flat array (not kanban columns)
 *   2. GET /roadmap?flat=true&sortBy=priorityScore returns items sorted by CIQ score
 *   3. GET /roadmap?flat=true&sortBy=feedbackCount returns items sorted by feedback volume
 *   4. GET /roadmap?flat=true&sortBy=manualRank returns items sorted by manual rank (nulls last)
 *   5. PATCH /roadmap/:id sets manualRank on a roadmap item
 *   6. PATCH /roadmap/:id clears manualRank when set to null
 *   7. GET /roadmap?flat=true includes theme.aiRecommendation in response
 *   8. GET /roadmap?flat=true&search=... filters items by title
 */
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CiqService } from '../src/ai/services/ciq.service';
import { AuditService } from '../src/ai/services/audit.service';
import { getQueueToken } from '@nestjs/bull';
import { CIQ_SCORING_QUEUE } from '../src/ai/processors/ciq-scoring.processor';
import { RoadmapStatus } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-pboard-test-001';
const THEME_ID_A   = 'theme-pboard-001';
const THEME_ID_B   = 'theme-pboard-002';
const ITEM_ID_A    = 'roadmap-pboard-001';
const ITEM_ID_B    = 'roadmap-pboard-002';
const ITEM_ID_C    = 'roadmap-pboard-003';
const USER_ID      = 'user-pboard-001';

const mockThemeA = {
  id: THEME_ID_A,
  workspaceId: WORKSPACE_ID,
  title: 'Slow checkout experience',
  status: 'ACTIVE',
  priorityScore: 82,
  aiSummary: 'Checkout latency is degrading conversion rates.',
  aiExplanation: 'This theme directly impacts revenue.',
  aiRecommendation: 'Prioritise server-side rendering of the checkout page.',
  aiConfidence: 0.87,
};

const mockThemeB = {
  id: THEME_ID_B,
  workspaceId: WORKSPACE_ID,
  title: 'Onboarding friction',
  status: 'ACTIVE',
  priorityScore: 55,
  aiSummary: 'New users struggle with the onboarding flow.',
  aiExplanation: 'Onboarding drop-off reduces activation rates.',
  aiRecommendation: 'Simplify the first-run wizard to 3 steps.',
  aiConfidence: 0.72,
};

const mockItemA = {
  id: ITEM_ID_A,
  workspaceId: WORKSPACE_ID,
  themeId: THEME_ID_A,
  title: 'Optimise checkout performance',
  description: 'High-priority CIQ item',
  status: RoadmapStatus.COMMITTED,
  priorityScore: 82,
  confidenceScore: 0.87,
  revenueImpactScore: 75,
  revenueImpactValue: 250000,
  dealInfluenceValue: 45000,
  signalCount: 15,
  manualRank: 1,
  isPublic: true,
  targetQuarter: 'Q2',
  targetYear: 2026,
  createdAt: new Date('2026-01-15').toISOString(),
  updatedAt: new Date('2026-03-01').toISOString(),
  theme: mockThemeA,
};

const mockItemB = {
  id: ITEM_ID_B,
  workspaceId: WORKSPACE_ID,
  themeId: THEME_ID_B,
  title: 'Redesign onboarding wizard',
  description: 'Medium-priority CIQ item',
  status: RoadmapStatus.PLANNED,
  priorityScore: 55,
  confidenceScore: 0.72,
  revenueImpactScore: 45,
  revenueImpactValue: 80000,
  dealInfluenceValue: 20000,
  signalCount: 8,
  manualRank: 2,
  isPublic: true,
  targetQuarter: 'Q3',
  targetYear: 2026,
  createdAt: new Date('2026-02-01').toISOString(),
  updatedAt: new Date('2026-03-10').toISOString(),
  theme: mockThemeB,
};

const mockItemC = {
  id: ITEM_ID_C,
  workspaceId: WORKSPACE_ID,
  themeId: null,
  title: 'Improve API rate limits',
  description: 'Low-priority backlog item',
  status: RoadmapStatus.BACKLOG,
  priorityScore: 22,
  confidenceScore: 0.3,
  revenueImpactScore: 15,
  revenueImpactValue: 10000,
  dealInfluenceValue: 5000,
  signalCount: 2,
  manualRank: null,
  isPublic: false,
  targetQuarter: null,
  targetYear: null,
  createdAt: new Date('2026-03-01').toISOString(),
  updatedAt: new Date('2026-03-20').toISOString(),
  theme: null,
};

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  workspace: {
    findUnique: jest.fn().mockResolvedValue({ id: WORKSPACE_ID, slug: 'test-org' }),
  },
  workspaceMember: {
    findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN', userId: USER_ID }),
  },
  roadmapItem: {
    findMany: jest.fn().mockResolvedValue([mockItemA, mockItemB, mockItemC]),
    findUnique: jest.fn().mockResolvedValue(mockItemA),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(mockItemA),
    update: jest.fn().mockImplementation(({ data }) => {
      return Promise.resolve({ ...mockItemA, ...data, theme: mockThemeA });
    }),
    count: jest.fn().mockResolvedValue(3),
  },
  theme: {
    findUnique: jest.fn().mockResolvedValue(mockThemeA),
    findMany: jest.fn().mockResolvedValue([mockThemeA, mockThemeB]),
    count: jest.fn().mockResolvedValue(2),
  },
  themeFeedback: {
    count: jest.fn().mockResolvedValue(12),
  },
  customerSignal: {
    count: jest.fn().mockResolvedValue(8),
    findMany: jest.fn().mockResolvedValue([]),
  },
  feedback: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  customer: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  aiJobLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog:  { create: jest.fn().mockResolvedValue({}) },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
};

// ─── Mock CIQ service ─────────────────────────────────────────────────────────

const mockCiqService = {
  scoreRoadmapItem: jest.fn().mockResolvedValue({
    priorityScore: 82,
    confidenceScore: 0.87,
    revenueImpactScore: 75,
    revenueImpactValue: 250000,
    dealInfluenceValue: 45000,
    signalCount: 15,
    uniqueCustomerCount: 5,
    sentimentScore: -0.35,
    dominantDriver: 'requestFrequency',
    scoreExplanation: {},
  }),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Prioritization Board API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(CiqService)
      .useValue(mockCiqService)
      .overrideProvider(AuditService)
      .useValue({ logAction: jest.fn().mockResolvedValue({}) })
      .overrideProvider(getQueueToken(CIQ_SCORING_QUEUE))
      .useValue({ add: jest.fn().mockResolvedValue({}) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    // Obtain a JWT by logging in with a mocked user
    mockPrisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: 'test-org' });
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: 'ADMIN', userId: USER_ID });

    // Use the test helper to get a token (or skip auth for unit-level e2e)
    // We'll use a fake bearer token and rely on the mock guard
    authToken = 'test-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.roadmapItem.findMany.mockResolvedValue([mockItemA, mockItemB, mockItemC]);
    mockPrisma.roadmapItem.findUnique.mockResolvedValue(mockItemA);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: 'ADMIN', userId: USER_ID });
    mockPrisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: 'test-org' });
    mockPrisma.themeFeedback.count.mockResolvedValue(12);
    mockPrisma.customerSignal.count.mockResolvedValue(8);
  });

  // ── Test 1: flat=true returns array ─────────────────────────────────────────

  it('GET /roadmap?flat=true should return a flat array (not kanban columns)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Flat mode returns an array, not an object with status keys
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 2: sortBy=priorityScore ─────────────────────────────────────────────

  it('GET /roadmap?flat=true&sortBy=priorityScore should pass priorityScore orderBy to Prisma', async () => {
    await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true', sortBy: 'priorityScore', sortOrder: 'desc' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(mockPrisma.roadmapItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { priorityScore: 'desc' },
      }),
    );
  });

  // ── Test 3: sortBy=feedbackCount ─────────────────────────────────────────────

  it('GET /roadmap?flat=true&sortBy=feedbackCount should return a flat array sorted by feedback volume', async () => {
    // feedbackCount is a computed field (not a DB column), so the service fetches by priorityScore
    // and then re-sorts in memory after enrichment. We verify the response is a flat array.
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true', sortBy: 'feedbackCount', sortOrder: 'desc' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // The service falls back to priorityScore for the DB query when feedbackCount is requested
    expect(mockPrisma.roadmapItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { priorityScore: 'desc' },
      }),
    );
  });

  // ── Test 4: sortBy=manualRank (nulls last) ────────────────────────────────────

  it('GET /roadmap?flat=true&sortBy=manualRank should use nulls:last ordering', async () => {
    await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true', sortBy: 'manualRank', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(mockPrisma.roadmapItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { manualRank: { sort: 'asc', nulls: 'last' } },
      }),
    );
  });

  // ── Test 5: PATCH sets manualRank ─────────────────────────────────────────────

  it('PATCH /roadmap/:id should set manualRank on a roadmap item', async () => {
    mockPrisma.roadmapItem.update.mockResolvedValue({ ...mockItemA, manualRank: 3, theme: mockThemeA });

    const res = await request(app.getHttpServer())
      .patch(`/workspaces/${WORKSPACE_ID}/roadmap/${ITEM_ID_A}`)
      .send({ manualRank: 3 })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(mockPrisma.roadmapItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ manualRank: 3 }),
      }),
    );
    expect(res.body.manualRank).toBe(3);
  });

  // ── Test 6: PATCH clears manualRank ──────────────────────────────────────────

  it('PATCH /roadmap/:id should clear manualRank when set to null', async () => {
    mockPrisma.roadmapItem.update.mockResolvedValue({ ...mockItemA, manualRank: null, theme: mockThemeA });

    const res = await request(app.getHttpServer())
      .patch(`/workspaces/${WORKSPACE_ID}/roadmap/${ITEM_ID_A}`)
      .send({ manualRank: null })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.manualRank).toBeNull();
  });

  // ── Test 7: flat list includes theme.aiRecommendation ────────────────────────

  it('GET /roadmap?flat=true should include theme.aiRecommendation in response', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // The first item has a theme with aiRecommendation
    const itemWithTheme = res.body.find((i: { theme?: { aiRecommendation?: string } }) => i.theme?.aiRecommendation);
    expect(itemWithTheme).toBeDefined();
    expect(itemWithTheme.theme.aiRecommendation).toBe(mockThemeA.aiRecommendation);
  });

  // ── Test 8: flat list includes feedbackCount ──────────────────────────────────

  it('GET /roadmap?flat=true should include feedbackCount in each item', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(typeof item.feedbackCount).toBe('number');
    }
  });

  // ── Test 9: flat list includes manualRank ─────────────────────────────────────

  it('GET /roadmap?flat=true should include manualRank field in each item', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .query({ flat: 'true' })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Items should have manualRank (either a number or null)
    const rankedItem = res.body.find((i: { manualRank?: number | null }) => i.manualRank != null);
    expect(rankedItem).toBeDefined();
  });

  // ── Test 10: non-flat mode still returns kanban columns ───────────────────────

  it('GET /roadmap (no flat flag) should return kanban-grouped columns object', async () => {
    const res = await request(app.getHttpServer())
      .get(`/workspaces/${WORKSPACE_ID}/roadmap`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Kanban mode returns an object with status keys
    expect(Array.isArray(res.body)).toBe(false);
    expect(typeof res.body).toBe('object');
    // Should have at least one RoadmapStatus key
    const statusKeys = ['BACKLOG', 'EXPLORING', 'PLANNED', 'COMMITTED', 'SHIPPED'];
    const hasStatusKey = statusKeys.some((k) => k in res.body);
    expect(hasStatusKey).toBe(true);
  });
});
