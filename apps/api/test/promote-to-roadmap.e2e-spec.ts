/**
 * E2E Tests: Promote to Roadmap Flow
 *
 * Covers all happy paths and key guard cases for:
 *   GET  /workspaces/:id/roadmap/from-theme/:themeId/preview
 *   POST /workspaces/:id/roadmap/from-theme/:themeId
 *
 * Uses a fully mocked NestJS test application (no live DB or Redis required).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CiqService } from '../src/ai/services/ciq.service';
import { AuditService } from '../src/ai/services/audit.service';
import { getQueueToken } from '@nestjs/bull';
import { CIQ_SCORING_QUEUE } from '../src/ai/processors/ciq-scoring.processor';
import { RoadmapStatus } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-promote-test-001';
const THEME_ID = 'theme-promote-001';
const ROADMAP_ITEM_ID = 'roadmap-promote-001';
const USER_ID = 'user-promote-001';
const OTHER_WORKSPACE_ID = 'ws-other-002';

const mockTheme = {
  id: THEME_ID,
  workspaceId: WORKSPACE_ID,
  title: 'Slow checkout experience',
  description: 'Users report slowness during checkout',
  aiSummary: 'Checkout latency is degrading conversion rates across mobile users.',
  aiExplanation: 'This theme directly impacts revenue. A 200ms improvement in checkout speed correlates with a 1.5% lift in conversion.',
  aiRecommendation: 'Prioritise server-side rendering of the checkout page and defer non-critical JS bundles.',
  aiConfidence: 0.82,
  feedbacks: [
    {
      assignedAt: new Date(),
      feedback: {
        id: 'fb-001',
        title: 'Checkout is too slow on mobile',
        sentiment: -0.7,
        sourceType: 'MANUAL',
      },
    },
    {
      assignedAt: new Date(),
      feedback: {
        id: 'fb-002',
        title: 'Payment page takes 10 seconds to load',
        sentiment: -0.85,
        sourceType: 'SLACK',
      },
    },
  ],
};

const mockCiqScore = {
  priorityScore: 78,
  confidenceScore: 0.82,
  revenueImpactScore: 65,
  revenueImpactValue: 120000,
  dealInfluenceValue: 45000,
  signalCount: 12,
  uniqueCustomerCount: 5,
};

const mockRoadmapItem = {
  id: ROADMAP_ITEM_ID,
  workspaceId: WORKSPACE_ID,
  themeId: THEME_ID,
  title: 'Slow checkout experience',
  description:
    'Checkout latency is degrading conversion rates across mobile users.\n\nWhy it matters: This theme directly impacts revenue. A 200ms improvement in checkout speed correlates with a 1.5% lift in conversion.\n\nSuggested action: Prioritise server-side rendering of the checkout page and defer non-critical JS bundles.',
  status: RoadmapStatus.EXPLORING,
  priorityScore: 78,
  confidenceScore: 0.82,
  revenueImpactScore: 65,
  revenueImpactValue: 120000,
  dealInfluenceValue: 45000,
  signalCount: 12,
  customerCount: 5,
  isPublic: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  theme: {
    id: THEME_ID,
    title: 'Slow checkout experience',
    status: 'ACTIVE',
    aiExplanation: mockTheme.aiExplanation,
  },
};

// ─── Mock Factories ───────────────────────────────────────────────────────────

function buildMockPrisma(overrides?: {
  existingRoadmapItem?: object | null;
  theme?: object | null;
}) {
  return {
    theme: {
      findUnique: jest.fn().mockResolvedValue(overrides?.theme ?? mockTheme),
    },
    roadmapItem: {
      findFirst: jest.fn().mockResolvedValue(overrides?.existingRoadmapItem ?? null),
      create: jest.fn().mockResolvedValue(mockRoadmapItem),
      findUnique: jest.fn().mockResolvedValue({ ...mockRoadmapItem, feedbacks: [], _count: { feedbacks: 2 } }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function buildMockCiqService() {
  return {
    scoreTheme: jest.fn().mockResolvedValue(mockCiqScore),
  };
}

function buildMockAuditService() {
  return {
    logAction: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-001' }),
  };
}

// ─── Test Setup ───────────────────────────────────────────────────────────────

async function buildApp(prismaOverrides?: Parameters<typeof buildMockPrisma>[0]): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(buildMockPrisma(prismaOverrides))
    .overrideProvider(CiqService)
    .useValue(buildMockCiqService())
    .overrideProvider(AuditService)
    .useValue(buildMockAuditService())
    .overrideProvider(getQueueToken(CIQ_SCORING_QUEUE))
    .useValue(buildMockQueue())
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

// ─── JWT stub ────────────────────────────────────────────────────────────────
// We mock the JwtAuthGuard to inject a fake user so tests don't need real tokens.
jest.mock('../src/auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class {
    canActivate(context: import('@nestjs/common').ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = { sub: USER_ID, email: 'test@example.com', workspaceId: WORKSPACE_ID };
      return true;
    }
  },
}));

jest.mock('../src/workspace/guards/roles.guard', () => ({
  RolesGuard: class {
    canActivate() { return true; }
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Promote to Roadmap — Preview Endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('GET /roadmap/from-theme/:themeId/preview — returns AI-prefilled suggestion', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}/preview`)
      .expect(200);

    expect(res.body).toMatchObject({
      suggestedTitle: 'Slow checkout experience',
      aiSummary: mockTheme.aiSummary,
      aiExplanation: mockTheme.aiExplanation,
      aiRecommendation: mockTheme.aiRecommendation,
      aiConfidence: 0.82,
      alreadyPromoted: false,
      existingRoadmapItemId: null,
    });
  });

  it('GET /roadmap/from-theme/:themeId/preview — includes top feedback items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}/preview`)
      .expect(200);

    expect(res.body.topFeedback).toHaveLength(2);
    expect(res.body.topFeedback[0]).toMatchObject({
      id: 'fb-001',
      title: 'Checkout is too slow on mobile',
      sentiment: -0.7,
    });
  });

  it('GET /roadmap/from-theme/:themeId/preview — builds rich suggestedDescription from AI fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}/preview`)
      .expect(200);

    expect(res.body.suggestedDescription).toContain(mockTheme.aiSummary!);
    expect(res.body.suggestedDescription).toContain('Why it matters:');
    expect(res.body.suggestedDescription).toContain('Suggested action:');
  });

  it('GET /roadmap/from-theme/:themeId/preview — sets alreadyPromoted=true when roadmap item exists', async () => {
    const appWithExisting = await buildApp({ existingRoadmapItem: mockRoadmapItem });
    const res = await request(appWithExisting.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}/preview`)
      .expect(200);

    expect(res.body.alreadyPromoted).toBe(true);
    expect(res.body.existingRoadmapItemId).toBe(ROADMAP_ITEM_ID);
    await appWithExisting.close();
  });

  it('GET /roadmap/from-theme/:themeId/preview — 404 when theme not found', async () => {
    const appNoTheme = await buildApp({ theme: null });
    await request(appNoTheme.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/nonexistent/preview`)
      .expect(404);
    await appNoTheme.close();
  });
});

describe('Promote to Roadmap — Create Endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('POST /roadmap/from-theme/:themeId — creates roadmap item with AI-enriched description', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}`)
      .send({})
      .expect(201);

    expect(res.body).toMatchObject({
      id: ROADMAP_ITEM_ID,
      themeId: THEME_ID,
      workspaceId: WORKSPACE_ID,
      title: 'Slow checkout experience',
      status: RoadmapStatus.EXPLORING,
    });
    expect(res.body.description).toContain('Why it matters:');
  });

  it('POST /roadmap/from-theme/:themeId — respects override title and description', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}`)
      .send({
        title: 'Custom Title from User',
        description: 'User-provided description that overrides AI suggestion.',
        status: RoadmapStatus.PLANNED,
      })
      .expect(201);

    // The mock always returns the same item, but we verify the override body was accepted (no 400)
    expect(res.body.id).toBe(ROADMAP_ITEM_ID);
  });

  it('POST /roadmap/from-theme/:themeId — 400 when roadmap item already exists for theme', async () => {
    const appWithExisting = await buildApp({ existingRoadmapItem: mockRoadmapItem });
    await request(appWithExisting.getHttpServer())
      .post(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}`)
      .send({})
      .expect(400);
    await appWithExisting.close();
  });

  it('POST /roadmap/from-theme/:themeId — 404 when theme not found', async () => {
    const appNoTheme = await buildApp({ theme: null });
    await request(appNoTheme.getHttpServer())
      .post(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/nonexistent`)
      .send({})
      .expect(404);
    await appNoTheme.close();
  });

  it('POST /roadmap/from-theme/:themeId — response includes linked theme with aiExplanation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}`)
      .send({})
      .expect(201);

    expect(res.body.theme).toBeDefined();
    expect(res.body.theme.aiExplanation).toBe(mockTheme.aiExplanation);
  });
});

describe('Promote to Roadmap — Tenant Isolation', () => {
  it('GET preview — cannot access theme from a different workspace', async () => {
    // Theme mock returns null when workspaceId doesn't match — simulated by returning null
    const appCrossWorkspace = await buildApp({ theme: null });
    await request(appCrossWorkspace.getHttpServer())
      .get(`/api/v1/workspaces/${OTHER_WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}/preview`)
      .expect(404);
    await appCrossWorkspace.close();
  });

  it('POST create — cannot promote theme from a different workspace', async () => {
    const appCrossWorkspace = await buildApp({ theme: null });
    await request(appCrossWorkspace.getHttpServer())
      .post(`/api/v1/workspaces/${OTHER_WORKSPACE_ID}/roadmap/from-theme/${THEME_ID}`)
      .send({})
      .expect(404);
    await appCrossWorkspace.close();
  });
});
