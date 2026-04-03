/**
 * ThemeClusteringService — Batch Finalization Tests
 *
 * Tests for the runBatchFinalization() method and its three private helpers:
 *   _reassignBorderlineItems, _runBatchMergePass, _suppressWeakClusters
 *
 * Key implementation details that drive mock design:
 * - _reassignBorderlineItems uses $queryRaw for the borderline query, then
 *   $queryRaw for embedding fetch, then $queryRaw for alternatives, then
 *   $executeRaw for the INSERT ON CONFLICT, then themeFeedback.deleteMany.
 * - _runBatchMergePass uses $queryRaw for the themes list, then $queryRaw
 *   per pair for similarity, then $executeRaw for the INSERT, then
 *   themeFeedback.deleteMany + theme.update.
 * - _suppressWeakClusters uses $queryRaw for weak themes, then $queryRaw
 *   for nearest neighbour, then $executeRaw + themeFeedback.deleteMany +
 *   theme.update (merge) OR theme.update (archive).
 * - _updateAllCentroids uses theme.findMany then $queryRaw + $executeRaw
 *   per theme (updateThemeCentroid).
 * - _promoteProvisionalThemes uses $queryRaw then theme.update per theme.
 * - recomputeClusterConfidence uses themeFeedback.findMany × 2 + theme.update.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ThemeClusteringService } from './theme-clustering.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { AutoMergeService } from './auto-merge.service';
import { CIQ_SCORING_QUEUE } from '../processors/ciq-scoring.processor';

// ── Mock factories ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    themeFeedback: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    feedback: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    theme: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-theme', title: 'New Theme' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    importBatch: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        themeFeedback: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        feedback: { findUnique: jest.fn() },
        theme: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'new-theme', title: 'New Theme' }),
          count: jest.fn().mockResolvedValue(0),
        },
      }),
    ),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ThemeClusteringService — runBatchFinalization', () => {
  let service: ThemeClusteringService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockCiqQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockCiqQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThemeClusteringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbeddingService, useValue: { generateEmbedding: jest.fn() } },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockCiqQueue },
        // AutoMergeService is injected via forwardRef — provide a minimal mock
        {
          provide: AutoMergeService,
          useValue: {
            detectAndMerge: jest.fn().mockResolvedValue({
              invoked: false, merged: false, mergedCount: 0, detectedCount: 0,
              suggestions: [], bootstrapMode: false, effectiveThreshold: 0.85, reason: 'mock',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ThemeClusteringService>(ThemeClusteringService);
    jest.clearAllMocks();
  });

  // ── runBatchFinalization: happy path (empty workspace) ──────────────────────

  describe('runBatchFinalization — empty workspace', () => {
    beforeEach(() => {
      // All $queryRaw calls return empty arrays (no borderline, no weak, no themes)
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // _updateAllCentroids uses theme.findMany
      mockPrisma.theme.findMany.mockResolvedValue([]);
      // theme.count for dynamicMinSupport
      mockPrisma.theme.count.mockResolvedValue(0);
      // theme.updateMany for promote
      mockPrisma.theme.updateMany.mockResolvedValue({ count: 0 });
    });

    it('should return zero counts when workspace has no themes', async () => {
      const result = await service.runBatchFinalization('ws-empty', 'batch-empty');

      expect(result).toEqual({
        reassigned: 0,
        merged: 0,
        suppressed: 0,
        promoted: 0,
        centroidsUpdated: 0,
      });
    });

    it('should not enqueue CIQ when there are no active themes', async () => {
      await service.runBatchFinalization('ws-empty', 'batch-no-ciq');
      expect(mockCiqQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── runBatchFinalization: CIQ enqueue ───────────────────────────────────────

  describe('runBatchFinalization — CIQ re-scoring', () => {
    it('should enqueue CIQ re-scoring for each active theme after finalization', async () => {
      // No borderline, no weak, no merge candidates
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(2);
      mockPrisma.theme.updateMany.mockResolvedValue({ count: 0 });

      // _updateAllCentroids + active themes for confidence refresh + CIQ enqueue
      const activeThemes = [{ id: 'theme-a' }, { id: 'theme-b' }];
      mockPrisma.theme.findMany.mockResolvedValue(activeThemes);

      // recomputeClusterConfidence: themeFeedback.findMany returns empty for each theme
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      await service.runBatchFinalization('ws-test', 'batch-ciq');

      // CIQ should be enqueued for each active theme
      expect(mockCiqQueue.add).toHaveBeenCalledTimes(activeThemes.length);
      expect(mockCiqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THEME_SCORED', themeId: 'theme-a', workspaceId: 'ws-test' }),
        expect.any(Object),
      );
      expect(mockCiqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THEME_SCORED', themeId: 'theme-b', workspaceId: 'ws-test' }),
        expect.any(Object),
      );
    });

    it('should complete finalization even when CIQ queue throws', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(1);
      mockPrisma.theme.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.theme.findMany.mockResolvedValue([{ id: 'theme-x' }]);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      // CIQ queue is down
      mockCiqQueue.add.mockRejectedValue(new Error('Redis connection refused'));

      // Should not throw — CIQ enqueue failure is non-fatal
      await expect(
        service.runBatchFinalization('ws-test', 'batch-ciq-fail'),
      ).resolves.toBeDefined();
    });
  });

  // ── _suppressWeakClusters ───────────────────────────────────────────────────

  describe('_suppressWeakClusters', () => {
    it('should archive a single-item PROVISIONAL theme when no neighbour exceeds merge threshold', async () => {
      // $queryRaw call order in runBatchFinalization:
      //   1. _reassignBorderlineItems → borderline items (empty)
      //   2. _runBatchMergePass → themes list (empty, so no pairs)
      //   3. _suppressWeakClusters → weak themes (one weak theme)
      //   4. _suppressWeakClusters → nearest neighbour (none above threshold)
      //   5. _promoteProvisionalThemes → provisional themes (empty)
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // 1. borderline items
        .mockResolvedValueOnce([])   // 2. merge pass themes
        .mockResolvedValueOnce([{ id: 'weak-theme', title: 'Weak Theme', liveCount: 1 }]) // 3. weak themes
        .mockResolvedValueOnce([])   // 4. nearest neighbour (none)
        .mockResolvedValueOnce([]);  // 5. promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]); // _updateAllCentroids
      // N=25 > 20 so standard suppression path is used (not bootstrap mode)
      mockPrisma.theme.count.mockResolvedValue(25);
      mockPrisma.theme.update.mockResolvedValue({});
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-suppress');

      expect(result.suppressed).toBe(1);
      // The weak theme should be archived
      expect(mockPrisma.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'weak-theme' },
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );
    });

    it('should NOT suppress a theme with enough members', async () => {
      // _suppressWeakClusters returns empty (no weak themes)
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items
        .mockResolvedValueOnce([])   // merge pass
        .mockResolvedValueOnce([])   // weak themes — empty (theme has 3 items, above threshold)
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-no-suppress');

      expect(result.suppressed).toBe(0);
      // theme.update should NOT have been called with ARCHIVED
      const archiveCalls = (mockPrisma.theme.update.mock.calls as Array<[{ data: { status?: string } }]>)
        .filter((call) => call[0]?.data?.status === 'ARCHIVED');
      expect(archiveCalls).toHaveLength(0);
    });

    it('should merge a weak theme into its nearest neighbour when similarity is high enough', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items
        .mockResolvedValueOnce([])   // merge pass
        .mockResolvedValueOnce([{ id: 'weak-theme', title: 'Weak Theme', liveCount: 1 }]) // weak themes
        .mockResolvedValueOnce([{ id: 'strong-theme', title: 'Strong Theme', sim: 0.80 }]) // nearest neighbour (sim >= 0.65)
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      // N=25 > 20 so standard suppression path is used (not bootstrap mode)
      mockPrisma.theme.count.mockResolvedValue(25);
      mockPrisma.theme.update.mockResolvedValue({});
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-merge-weak');

      expect(result.suppressed).toBe(1);
      // Should have archived the weak theme (after merging its items)
      expect(mockPrisma.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'weak-theme' },
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );
    });
  });

  // ── _runBatchMergePass ──────────────────────────────────────────────────────

  describe('_runBatchMergePass', () => {
    it('should return 0 when fewer than 2 themes exist', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items
        .mockResolvedValueOnce([{ id: 't1', title: 'Only Theme', liveCount: 3, ciqScore: 50 }]) // only 1 theme
        .mockResolvedValueOnce([])   // weak themes
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-single-theme');

      expect(result.merged).toBe(0);
    });

    it('should not merge themes when similarity is below BATCH_MERGE_THRESHOLD (0.78)', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items
        .mockResolvedValueOnce([     // merge pass: 2 themes
          { id: 't1', title: 'Theme A', liveCount: 3, ciqScore: 60 },
          { id: 't2', title: 'Theme B', liveCount: 2, ciqScore: 40 },
        ])
        .mockResolvedValueOnce({ sim: 0.65 }) // pair similarity — below 0.78
        .mockResolvedValueOnce([])   // weak themes
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-no-merge');

      expect(result.merged).toBe(0);
    });
  });

  // ── _reassignBorderlineItems ────────────────────────────────────────────────

  describe('_reassignBorderlineItems', () => {
    it('should return 0 when no borderline items exist', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items — empty
        .mockResolvedValueOnce([])   // merge pass
        .mockResolvedValueOnce([])   // weak themes
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-no-borderline');

      expect(result.reassigned).toBe(0);
    });

    it('should reassign a borderline item when a meaningfully better cluster exists', async () => {
      // Borderline item with confidence 0.55 (below BORDERLINE_SCORE_THRESHOLD=0.60)
      const borderlineItem = { themeId: 'theme-old', feedbackId: 'fb-1', confidence: 0.55 };
      // Embedding for the feedback
      const embeddingStr = JSON.stringify(Array.from({ length: 8 }, () => 0.5));

      mockPrisma.$queryRaw
        .mockResolvedValueOnce([borderlineItem])  // 1. borderline items
        .mockResolvedValueOnce([{ embedding: embeddingStr }]) // 2. fetch embedding
        .mockResolvedValueOnce([{ id: 'theme-better', title: 'Better Theme', similarity: 0.85 }]) // 3. alternatives
        .mockResolvedValueOnce([])   // 4. merge pass
        .mockResolvedValueOnce([])   // 5. weak themes
        .mockResolvedValueOnce([]);  // 6. promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-reassign');

      expect(result.reassigned).toBe(1);
      // The INSERT ON CONFLICT should have been called
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      // The old link should have been deleted
      expect(mockPrisma.themeFeedback.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { themeId: 'theme-old', feedbackId: 'fb-1' },
        }),
      );
    });

    it('should NOT reassign when improvement is below 0.08', async () => {
      const borderlineItem = { themeId: 'theme-old', feedbackId: 'fb-2', confidence: 0.55 };
      const embeddingStr = JSON.stringify(Array.from({ length: 8 }, () => 0.5));

      mockPrisma.$queryRaw
        .mockResolvedValueOnce([borderlineItem])  // borderline items
        .mockResolvedValueOnce([{ embedding: embeddingStr }]) // fetch embedding
        .mockResolvedValueOnce([{ id: 'theme-marginal', title: 'Marginal', similarity: 0.60 }]) // alternatives (improvement = 0.05 < 0.08)
        .mockResolvedValueOnce([])   // merge pass
        .mockResolvedValueOnce([])   // weak themes
        .mockResolvedValueOnce([]);  // promote provisional

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(0);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-no-reassign');

      expect(result.reassigned).toBe(0);
      // No INSERT should have been called for reassignment
      expect(mockPrisma.themeFeedback.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ── Promote PROVISIONAL → STABLE ───────────────────────────────────────────

  describe('_promoteProvisionalThemes', () => {
    it('should promote a PROVISIONAL theme that meets dynamicMinSupport', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])   // borderline items
        .mockResolvedValueOnce([])   // merge pass
        .mockResolvedValueOnce([])   // weak themes
        .mockResolvedValueOnce([{ id: 'prov-theme', title: 'Provisional Theme', liveCount: 3 }]); // promote

      mockPrisma.theme.findMany.mockResolvedValue([]);
      mockPrisma.theme.count.mockResolvedValue(5); // N=5, dynamicMinSupport=max(2, floor(log2(7)))=2
      mockPrisma.theme.update.mockResolvedValue({});
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      const result = await service.runBatchFinalization('ws-test', 'batch-promote');

      expect(result.promoted).toBe(1);
      expect(mockPrisma.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prov-theme' },
          data: expect.objectContaining({ status: 'AI_GENERATED' }),
        }),
      );
    });
  });
});
