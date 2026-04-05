/**
 * AutoMergeService — unit tests
 *
 * Tests cover:
 *  1. Guard: returns early when fewer than 2 themes have embeddings
 *  2. Bootstrap mode detection (small dataset / high size-1 ratio)
 *  3. Suggestion mode: flags source theme as autoMergeCandidate
 *  4. autoExecute mode: calls executeMerge for pairs above threshold
 *  5. Bootstrap mode uses relaxed threshold (0.72 instead of 0.85)
 *  6. anchorThemeId fast path: only scans the anchor theme
 *  7. executeMerge: re-links feedback, archives source, re-points RoadmapItems
 *  8. executeMerge: enqueues CIQ re-scoring for target
 *  9. dismissAutoMerge: clears autoMergeCandidate flag
 * 10. Structured log events emitted
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { AutoMergeService } from './auto-merge.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';
import { IssueDimensionService } from './issue-dimension.service';
import { UnifiedAggregationService } from '../../theme/services/unified-aggregation.service';

// ─── Mock factories ────────────────────────────────────────────────────────────

/** Build a minimal theme row as returned by $queryRaw (feedbackCount only) */
function fakeThemeRaw(
  id: string,
  feedbackCount = 2,
): { id: string; feedbackCount: number } {
  return { id, feedbackCount };
}

/** Build a theme row as returned by theme.findMany */
function fakeTheme(
  overrides: Partial<{
    id: string;
    title: string;
    topKeywords: string | null;
    feedbackCount: number;
    autoMergeCandidate: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 'theme-1',
    title: overrides.title ?? 'Test Theme',
    topKeywords: overrides.topKeywords ?? null,
    feedbackCount: overrides.feedbackCount ?? 2,
    autoMergeCandidate: overrides.autoMergeCandidate ?? false,
  };
}

/** Build a pgvector candidate row as returned by $queryRaw in the scan loop */
function fakeCandidate(
  overrides: Partial<{
    id: string;
    title: string;
    similarity: number;
    topKeywords: string | null;
    feedbackCount: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 'theme-2',
    title: overrides.title ?? 'Candidate Theme',
    similarity: overrides.similarity ?? 0.9,
    topKeywords: overrides.topKeywords ?? null,
    feedbackCount: overrides.feedbackCount ?? 2,
  };
}

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockCiqQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

const mockIssueDimensionService = {
  extract: jest.fn().mockResolvedValue({}),
  computeCompatibility: jest.fn().mockReturnValue(1.0),
};

const mockUnifiedAggregationService = {
  aggregateTheme: jest.fn().mockResolvedValue({}),
  aggregateWorkspace: jest.fn().mockResolvedValue({}),
};

// The $transaction mock executes the callback synchronously with the same mock
const mockPrisma: Record<string, unknown> = {
  theme: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  themeFeedback: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  roadmapItem: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  customerSignal: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  supportIssueCluster: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrisma),
  ),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoMergeService', () => {
  let service: AutoMergeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: $queryRaw returns empty (no themes with embeddings)
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (mockPrisma.theme as Record<string, jest.Mock>).findMany.mockResolvedValue(
      [],
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoMergeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockCiqQueue },
        { provide: IssueDimensionService, useValue: mockIssueDimensionService },
        { provide: UnifiedAggregationService, useValue: mockUnifiedAggregationService },
      ],
    }).compile();

    service = module.get<AutoMergeService>(AutoMergeService);
  });

  // ── 1. Guard: fewer than 2 themes ──────────────────────────────────────────

  describe('guard: fewer than 2 themes with embeddings', () => {
    it('returns early with merged=false and reason when only 1 theme exists', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        fakeThemeRaw('theme-1', 3),
      ]);

      const result = await service.detectAndMerge('ws-1');

      expect(result.invoked).toBe(true);
      expect(result.merged).toBe(false);
      expect(result.mergedCount).toBe(0);
      expect(result.reason).toMatch(/Only 1 theme/);
    });

    it('returns early with merged=false when no themes exist', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.detectAndMerge('ws-1');

      expect(result.invoked).toBe(true);
      expect(result.merged).toBe(false);
      expect(result.mergedCount).toBe(0);
    });
  });

  // ── 2. Bootstrap mode detection ────────────────────────────────────────────

  describe('bootstrap mode detection', () => {
    it('activates bootstrap mode when total themes <= 10', async () => {
      // 3 themes — all below BOOTSTRAP_THEME_COUNT=10
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          fakeThemeRaw('t1', 2),
          fakeThemeRaw('t2', 2),
          fakeThemeRaw('t3', 2),
        ])
        // Second $queryRaw call is the candidate scan — return empty to short-circuit
        .mockResolvedValue([]);

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1' }),
        fakeTheme({ id: 't2' }),
        fakeTheme({ id: 't3' }),
      ]);

      const result = await service.detectAndMerge('ws-1');

      expect(result.bootstrapMode).toBe(true);
      expect(result.effectiveThreshold).toBe(0.72);
    });

    it('activates bootstrap mode when >= 60% of themes are size-1', async () => {
      // 12 themes, 8 are size-1 (67%)
      const rawRows = [
        ...Array.from({ length: 8 }, (_, i) => fakeThemeRaw(`t${i}`, 1)),
        ...Array.from({ length: 4 }, (_, i) => fakeThemeRaw(`t${i + 8}`, 5)),
      ];
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(rawRows)
        .mockResolvedValue([]);

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue(
        rawRows.map((r) =>
          fakeTheme({ id: r.id, feedbackCount: r.feedbackCount }),
        ),
      );

      const result = await service.detectAndMerge('ws-1');

      expect(result.bootstrapMode).toBe(true);
      expect(result.effectiveThreshold).toBe(0.72);
    });

    it('uses normal threshold (0.85) for large datasets', async () => {
      // 15 themes, all with 5+ items
      const rawRows = Array.from({ length: 15 }, (_, i) =>
        fakeThemeRaw(`t${i}`, 5),
      );
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(rawRows)
        .mockResolvedValue([]);

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue(
        rawRows.map((r) =>
          fakeTheme({ id: r.id, feedbackCount: r.feedbackCount }),
        ),
      );

      const result = await service.detectAndMerge('ws-1');

      expect(result.bootstrapMode).toBe(false);
      expect(result.effectiveThreshold).toBe(0.82); // recalibrated from 0.85 in commit 43a82ad
    });
  });

  // ── 3. Suggestion mode ─────────────────────────────────────────────────────

  describe('suggestion mode (autoExecute=false)', () => {
    it('flags the source theme as autoMergeCandidate when score >= threshold', async () => {
      // 2 themes → bootstrap mode (threshold=0.72)
      // hybridScore = similarity*0.7 + keywordJaccard*0.3
      // With similarity=1.0 and matching keywords (Jaccard=1.0): hybrid = 1.0 ≥ 0.72 ✓
      const sharedKeywords = JSON.stringify(['payment', 'failure', 'checkout']);
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([fakeThemeRaw('t1', 3), fakeThemeRaw('t2', 3)]) // call 1
        .mockResolvedValueOnce([
          fakeCandidate({
            id: 't2',
            similarity: 1.0,
            feedbackCount: 3,
            topKeywords: sharedKeywords,
          }),
        ]); // call 2

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1', feedbackCount: 3, topKeywords: sharedKeywords }),
        fakeTheme({ id: 't2', feedbackCount: 3, topKeywords: sharedKeywords }),
      ]);

      const result = await service.detectAndMerge('ws-1', {
        autoExecute: false,
      });

      expect(result.detectedCount).toBe(1);
      expect(result.mergedCount).toBe(0); // suggestion mode — no execution
      expect(result.suggestions[0].similarity).toBeGreaterThanOrEqual(0.72);

      // theme.update should have been called to flag the source
      const updateCalls = (mockPrisma.theme as Record<string, jest.Mock>).update
        .mock.calls as Array<[{ data: { autoMergeCandidate?: boolean } }]>;
      const flagCalls = updateCalls.filter(
        ([args]) => args.data.autoMergeCandidate === true,
      );
      expect(flagCalls.length).toBeGreaterThan(0);
    });

    it('does NOT flag themes when score < threshold', async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([fakeThemeRaw('t1', 3), fakeThemeRaw('t2', 3)]) // call 1
        // Candidate with low similarity — below bootstrap threshold 0.72
        .mockResolvedValueOnce([
          fakeCandidate({ id: 't2', similarity: 0.5, feedbackCount: 3 }),
        ]); // call 2

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1', feedbackCount: 3 }),
        fakeTheme({ id: 't2', feedbackCount: 3 }),
      ]);

      const result = await service.detectAndMerge('ws-1', {
        autoExecute: false,
      });

      expect(result.detectedCount).toBe(0);
      expect(result.mergedCount).toBe(0);

      // No flagging update should have been called
      const updateCalls = (mockPrisma.theme as Record<string, jest.Mock>).update
        .mock.calls as Array<[{ data: { autoMergeCandidate?: boolean } }]>;
      const flagCalls = updateCalls.filter(
        ([args]) => args.data.autoMergeCandidate === true,
      );
      expect(flagCalls).toHaveLength(0);
    });
  });

  // ── 4. autoExecute mode ────────────────────────────────────────────────────

  describe('autoExecute mode', () => {
    it('executes merge and returns merged=true when score >= threshold', async () => {
      // hybridScore = similarity*0.7 + keywordJaccard*0.3
      // With similarity=1.0 and matching keywords (Jaccard=1.0): hybrid = 1.0 ≥ 0.72 ✓
      const sharedKeywords = JSON.stringify(['payment', 'failure', 'checkout']);
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([fakeThemeRaw('t1', 3), fakeThemeRaw('t2', 3)]) // call 1
        .mockResolvedValueOnce([
          fakeCandidate({
            id: 't2',
            similarity: 1.0,
            feedbackCount: 3,
            topKeywords: sharedKeywords,
          }),
        ]); // call 2

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1', feedbackCount: 3, topKeywords: sharedKeywords }),
        fakeTheme({ id: 't2', feedbackCount: 3, topKeywords: sharedKeywords }),
      ]);

      // themeFeedback.findMany inside executeMerge (called inside $transaction)
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        {
          themeId: 't2',
          feedbackId: 'fb-1',
          assignedBy: 'ai',
          confidence: 0.9,
        },
      ]);

      const result = await service.detectAndMerge('ws-1', {
        autoExecute: true,
      });

      expect(result.merged).toBe(true);
      expect(result.mergedCount).toBe(1);
    });

    it('enqueues CIQ re-scoring for the target theme after merge', async () => {
      // t1 has 5 items, t2 has 3 → t1 is the target (larger cluster absorbs smaller)
      const sharedKeywords = JSON.stringify(['payment', 'failure', 'checkout']);
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([fakeThemeRaw('t1', 5), fakeThemeRaw('t2', 3)]) // call 1
        .mockResolvedValueOnce([
          fakeCandidate({
            id: 't2',
            similarity: 1.0,
            feedbackCount: 3,
            topKeywords: sharedKeywords,
          }),
        ]); // call 2

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1', feedbackCount: 5, topKeywords: sharedKeywords }),
        fakeTheme({ id: 't2', feedbackCount: 3, topKeywords: sharedKeywords }),
      ]);

      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        {
          themeId: 't2',
          feedbackId: 'fb-1',
          assignedBy: 'ai',
          confidence: 0.9,
        },
      ]);

      await service.detectAndMerge('ws-1', { autoExecute: true });

      // t1 has more feedback (5 vs 3) so t1 is the target
      expect(mockCiqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'THEME_SCORED',
          workspaceId: 'ws-1',
          themeId: 't1',
        }),
        expect.any(Object),
      );
    });
  });

  // ── 5. anchorThemeId fast path ─────────────────────────────────────────────

  describe('anchorThemeId fast path', () => {
    it('only scans the anchor theme when anchorThemeId is provided', async () => {
      (mockPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          fakeThemeRaw('t1', 2),
          fakeThemeRaw('t2', 2),
          fakeThemeRaw('t3', 2),
        ])
        // Candidate scan for t1 only
        .mockResolvedValueOnce([fakeCandidate({ id: 't2', similarity: 0.9 })]);

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1' }),
        fakeTheme({ id: 't2' }),
        fakeTheme({ id: 't3' }),
      ]);

      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([]);

      await service.detectAndMerge('ws-1', {
        autoExecute: true,
        anchorThemeId: 't1',
      });

      // $queryRaw for candidates should have been called exactly once (for t1 only)
      // First call is the themes-with-embeddings query, second is the candidate scan
      const rawCalls = (mockPrisma.$queryRaw as jest.Mock).mock.calls.length;
      // 1 (themes) + 1 (candidates for t1) = 2 total $queryRaw calls
      expect(rawCalls).toBe(2);
    });

    it('returns skip result when anchorThemeId is not found in workspace', async () => {
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        fakeThemeRaw('t1', 2),
        fakeThemeRaw('t2', 2),
      ]);

      (
        mockPrisma.theme as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        fakeTheme({ id: 't1' }),
        fakeTheme({ id: 't2' }),
      ]);

      const result = await service.detectAndMerge('ws-1', {
        anchorThemeId: 'nonexistent',
      });

      expect(result.merged).toBe(false);
      expect(result.reason).toMatch(/not found/);
    });
  });

  // ── 6. executeMerge side effects ───────────────────────────────────────────

  describe('executeMerge', () => {
    it('re-links all feedback from source to target via upsert', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        {
          themeId: 'source',
          feedbackId: 'fb-1',
          assignedBy: 'ai',
          confidence: 0.9,
        },
        {
          themeId: 'source',
          feedbackId: 'fb-2',
          assignedBy: 'ai',
          confidence: 0.8,
        },
      ]);

      await service.executeMerge('ws-1', 'target', 'source', 'user-1', 0.88);

      expect(
        (mockPrisma.themeFeedback as Record<string, jest.Mock>).upsert,
      ).toHaveBeenCalledTimes(2);
      expect(
        (mockPrisma.themeFeedback as Record<string, jest.Mock>).upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            themeId: 'target',
            feedbackId: 'fb-1',
          }),
        }),
      );
    });

    it('archives the source theme (does NOT delete it)', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([]);

      await service.executeMerge('ws-1', 'target', 'source', 'user-1');

      // Should update source to ARCHIVED
      expect(
        (mockPrisma.theme as Record<string, jest.Mock>).update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'source', workspaceId: 'ws-1' },
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );

      // Should NOT delete the source theme
      const deleteCalls =
        (mockPrisma.theme as Record<string, jest.Mock>).update?.mock?.calls ??
        [];
      const hardDeleteCalls = deleteCalls.filter(
        ([args]: [{ data: { status?: string } }]) =>
          args.data?.status === 'DELETED',
      );
      expect(hardDeleteCalls).toHaveLength(0);
    });

    it('re-points RoadmapItems from source to target', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([]);

      await service.executeMerge('ws-1', 'target', 'source', 'user-1');

      expect(
        (mockPrisma.roadmapItem as Record<string, jest.Mock>).updateMany,
      ).toHaveBeenCalledWith({
        where: { themeId: 'source' },
        data: { themeId: 'target' },
      });
    });

    it('re-points CustomerSignals from source to target', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([]);

      await service.executeMerge('ws-1', 'target', 'source', 'user-1');

      expect(
        (mockPrisma.customerSignal as Record<string, jest.Mock>).updateMany,
      ).toHaveBeenCalledWith({
        where: { themeId: 'source' },
        data: { themeId: 'target' },
      });
    });

    it('enqueues CIQ re-scoring for the target theme', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([]);

      await service.executeMerge('ws-1', 'target', 'source', 'user-1', 0.9);

      expect(mockCiqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'THEME_SCORED',
          workspaceId: 'ws-1',
          themeId: 'target',
        }),
        expect.any(Object),
      );
    });

    it('returns affectedFeedbackCount equal to number of re-linked items', async () => {
      (
        mockPrisma.themeFeedback as Record<string, jest.Mock>
      ).findMany.mockResolvedValue([
        {
          themeId: 'source',
          feedbackId: 'fb-1',
          assignedBy: 'ai',
          confidence: 0.9,
        },
        {
          themeId: 'source',
          feedbackId: 'fb-2',
          assignedBy: 'ai',
          confidence: 0.8,
        },
        {
          themeId: 'source',
          feedbackId: 'fb-3',
          assignedBy: 'ai',
          confidence: 0.7,
        },
      ]);

      const result = await service.executeMerge(
        'ws-1',
        'target',
        'source',
        'user-1',
      );

      expect(result.affectedFeedbackCount).toBe(3);
    });
  });

  // ── 7. dismissAutoMerge ────────────────────────────────────────────────────

  describe('dismissAutoMerge', () => {
    it('clears the autoMergeCandidate flag on the theme', async () => {
      await service.dismissAutoMerge('ws-1', 'theme-1');

      expect(
        (mockPrisma.theme as Record<string, jest.Mock>).update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'theme-1', workspaceId: 'ws-1' },
          data: expect.objectContaining({
            autoMergeCandidate: false,
            autoMergeTargetId: null,
            autoMergeSimilarity: null,
          }),
        }),
      );
    });

    it('returns { ok: true }', async () => {
      const result = await service.dismissAutoMerge('ws-1', 'theme-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
