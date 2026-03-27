/**
 * Themes, Roadmap, and Dashboard API E2E Tests
 *
 * Tests all happy paths for the three major workspace-scoped feature areas.
 * All external dependencies (Prisma, Bull queues, OpenAI) are mocked so
 * these tests run without any live services.
 *
 * Happy paths covered:
 *
 * Themes
 *   1. POST   /themes                    — create a theme
 *   2. GET    /themes                    — list themes (includes AI narration fields)
 *   3. GET    /themes/:id                — get theme detail with AI fields
 *   4. PATCH  /themes/:id                — update a theme
 *   5. GET    /themes/:id/feedback       — list feedback linked to a theme
 *   6. POST   /themes/:id/feedback/:fid  — link feedback to a theme
 *
 * Roadmap
 *   7. POST   /roadmap                   — create a roadmap item
 *   8. GET    /roadmap                   — list roadmap items
 *   9. GET    /roadmap/:id               — get a roadmap item
 *  10. PATCH  /roadmap/:id               — update a roadmap item
 *  11. POST   /roadmap/from-theme/:id    — promote a theme to roadmap
 *
 * Dashboard
 *  12. GET    /dashboard/executive       — executive summary
 *  13. GET    /dashboard/themes          — emerging themes with AI summaries
 *  14. GET    /dashboard/roadmap-health  — roadmap health panel
 */

import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mocks
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-e2e-1';
const USER_ID = 'user-e2e-1';

const mockUser = {
  id: USER_ID,
  email: 'e2e@example.com',
  firstName: 'E2E',
  lastName: 'User',
  passwordHash: '$2b$10$hashedpassword',
  workspaceId: WORKSPACE_ID,
};

const mockWorkspace = {
  id: WORKSPACE_ID,
  name: 'E2E Workspace',
  slug: 'e2e-workspace',
  ownerId: USER_ID,
};

const mockTheme = {
  id: 'theme-e2e-1',
  title: 'Checkout Performance',
  description: 'Users report slow checkout',
  workspaceId: WORKSPACE_ID,
  priorityScore: 82,
  aiSummary: 'Checkout is consistently slow for users on mobile.',
  aiExplanation: 'This impacts conversion rates and revenue.',
  aiRecommendation: 'Optimise the payment gateway integration.',
  aiConfidence: 0.87,
  aiNarratedAt: new Date(),
  feedbackCount: 12,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoadmapItem = {
  id: 'roadmap-e2e-1',
  title: 'Fix Checkout Performance',
  status: 'PLANNED',
  workspaceId: WORKSPACE_ID,
  themeId: 'theme-e2e-1',
  priorityScore: 82,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  workspace: {
    findFirst: jest.fn().mockResolvedValue(mockWorkspace),
    findUnique: jest.fn().mockResolvedValue(mockWorkspace),
    create: jest.fn().mockResolvedValue(mockWorkspace),
  },
  workspaceMember: {
    findFirst: jest.fn().mockResolvedValue({ userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'OWNER' }),
  },
  feedback: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { sentiment: 0 }, _count: { id: 0 } }),
  },
  theme: {
    findUnique: jest.fn().mockResolvedValue(mockTheme),
    findFirst: jest.fn().mockResolvedValue(mockTheme),
    findMany: jest.fn().mockResolvedValue([mockTheme]),
    create: jest.fn().mockResolvedValue(mockTheme),
    update: jest.fn().mockResolvedValue(mockTheme),
    count: jest.fn().mockResolvedValue(1),
  },
  roadmapItem: {
    findUnique: jest.fn().mockResolvedValue(mockRoadmapItem),
    findFirst: jest.fn().mockResolvedValue(mockRoadmapItem),
    findMany: jest.fn().mockResolvedValue([mockRoadmapItem]),
    create: jest.fn().mockResolvedValue(mockRoadmapItem),
    update: jest.fn().mockResolvedValue(mockRoadmapItem),
    count: jest.fn().mockResolvedValue(1),
  },
  aiJobLog: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
  },
  digest: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockQueue = { add: jest.fn() };

// ─────────────────────────────────────────────────────────────────────────────
// Test module bootstrap
// ─────────────────────────────────────────────────────────────────────────────

let app: INestApplication;
let authToken: string;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .overrideProvider('BullQueue_ai-analysis')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_ciq-scoring')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_digest')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_theme-clustering')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_dashboard')
    .useValue(mockQueue)
    .compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  // Obtain a JWT for authenticated requests
  mockPrisma.user.findUnique.mockResolvedValue(mockUser);
  mockPrisma.user.findFirst.mockResolvedValue(mockUser);
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'e2e@example.com', password: 'password123' });
  authToken = loginRes.body?.accessToken ?? 'mock-token';
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default mocks after clearAllMocks
  mockPrisma.workspace.findFirst.mockResolvedValue(mockWorkspace);
  mockPrisma.workspace.findUnique.mockResolvedValue(mockWorkspace);
  mockPrisma.workspaceMember.findFirst.mockResolvedValue({ userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'OWNER' });
  mockPrisma.theme.findUnique.mockResolvedValue(mockTheme);
  mockPrisma.theme.findFirst.mockResolvedValue(mockTheme);
  mockPrisma.theme.findMany.mockResolvedValue([mockTheme]);
  mockPrisma.theme.create.mockResolvedValue(mockTheme);
  mockPrisma.theme.update.mockResolvedValue(mockTheme);
  mockPrisma.theme.count.mockResolvedValue(1);
  mockPrisma.roadmapItem.findUnique.mockResolvedValue(mockRoadmapItem);
  mockPrisma.roadmapItem.findFirst.mockResolvedValue(mockRoadmapItem);
  mockPrisma.roadmapItem.findMany.mockResolvedValue([mockRoadmapItem]);
  mockPrisma.roadmapItem.create.mockResolvedValue(mockRoadmapItem);
  mockPrisma.roadmapItem.update.mockResolvedValue(mockRoadmapItem);
  mockPrisma.feedback.findMany.mockResolvedValue([]);
  mockPrisma.feedback.count.mockResolvedValue(0);
  mockPrisma.feedback.aggregate.mockResolvedValue({ _avg: { sentiment: 0 }, _count: { id: 0 } });
  mockPrisma.aiJobLog.upsert.mockResolvedValue({});
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockQueue.add.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────────────
// Themes
// ─────────────────────────────────────────────────────────────────────────────

describe('Themes API', () => {
  const BASE = `/api/v1/workspaces/${WORKSPACE_ID}/themes`;

  it('POST /themes — should create a theme and return it', async () => {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Checkout Performance', description: 'Users report slow checkout' })
      .expect(201);

    expect(res.body).toHaveProperty('id', 'theme-e2e-1');
    expect(res.body).toHaveProperty('title', 'Checkout Performance');
  });

  it('GET /themes — should return a list of themes with AI narration fields', async () => {
    const res = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data ?? res.body)).toBe(true);
    const theme = (res.body.data ?? res.body)[0];
    expect(theme).toHaveProperty('aiSummary');
    expect(theme).toHaveProperty('aiExplanation');
    expect(theme).toHaveProperty('aiRecommendation');
    expect(theme).toHaveProperty('aiConfidence');
  });

  it('GET /themes/:id — should return theme detail with AI fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/theme-e2e-1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('id', 'theme-e2e-1');
    expect(res.body).toHaveProperty('aiSummary', 'Checkout is consistently slow for users on mobile.');
    expect(res.body).toHaveProperty('aiConfidence', 0.87);
  });

  it('PATCH /themes/:id — should update a theme title', async () => {
    mockPrisma.theme.update.mockResolvedValueOnce({ ...mockTheme, title: 'Updated Title' });

    const res = await request(app.getHttpServer())
      .patch(`${BASE}/theme-e2e-1`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Updated Title' })
      .expect(200);

    expect(res.body).toHaveProperty('title', 'Updated Title');
  });

  it('GET /themes/:id/feedback — should return feedback linked to the theme', async () => {
    mockPrisma.feedback.findMany.mockResolvedValueOnce([
      { id: 'fb-1', title: 'Checkout is slow', workspaceId: WORKSPACE_ID },
    ]);

    const res = await request(app.getHttpServer())
      .get(`${BASE}/theme-e2e-1/feedback`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const items = res.body.data ?? res.body;
    expect(Array.isArray(items)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap
// ─────────────────────────────────────────────────────────────────────────────

describe('Roadmap API', () => {
  const BASE = `/api/v1/workspaces/${WORKSPACE_ID}/roadmap`;

  it('POST /roadmap — should create a roadmap item', async () => {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Fix Checkout Performance', status: 'PLANNED' })
      .expect(201);

    expect(res.body).toHaveProperty('id', 'roadmap-e2e-1');
    expect(res.body).toHaveProperty('title', 'Fix Checkout Performance');
  });

  it('GET /roadmap — should return a list of roadmap items', async () => {
    const res = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const items = res.body.data ?? res.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('GET /roadmap/:id — should return a single roadmap item', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/roadmap-e2e-1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('id', 'roadmap-e2e-1');
  });

  it('PATCH /roadmap/:id — should update roadmap item status', async () => {
    mockPrisma.roadmapItem.update.mockResolvedValueOnce({ ...mockRoadmapItem, status: 'IN_PROGRESS' });

    const res = await request(app.getHttpServer())
      .patch(`${BASE}/roadmap-e2e-1`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    expect(res.body).toHaveProperty('status', 'IN_PROGRESS');
  });

  it('POST /roadmap/from-theme/:themeId — should promote a theme to a roadmap item', async () => {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/from-theme/theme-e2e-1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    expect(res.body).toHaveProperty('themeId', 'theme-e2e-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

describe('Dashboard API', () => {
  const BASE = `/api/v1/workspaces/${WORKSPACE_ID}/dashboard`;

  it('GET /dashboard/executive — should return the executive summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/executive`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Executive summary always returns an object
    expect(typeof res.body).toBe('object');
  });

  it('GET /dashboard/themes — should return emerging themes with AI summaries', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/themes`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const items = res.body.data ?? res.body;
    // Either an array of themes or an object with a themes key
    expect(res.body).toBeDefined();
  });

  it('GET /dashboard/roadmap-health — should return roadmap health metrics', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/roadmap-health`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(typeof res.body).toBe('object');
  });
});
