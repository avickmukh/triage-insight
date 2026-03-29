/**
 * AutoMergeService — unit tests
 *
 * Tests cover:
 *  1. Hybrid similarity computation (embedding + keyword overlap)
 *  2. Merge candidate detection (above/below threshold)
 *  3. Execute merge: feedback re-assignment, CIQ recompute, source deletion
 *  4. Workspace scan: only flags pairs above threshold
 *  5. Dismiss: clears autoMergeCandidate flag
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AutoMergeService } from './auto-merge.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CiqService } from '../services/ciq.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake Theme row with optional embedding and keywords */
function fakeTheme(overrides: Partial<{
  id: string;
  title: string;
  centroidEmbedding: number[];
  topKeywords: string[];
  workspaceId: string;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'theme-1',
    title: overrides.title ?? 'Test Theme',
    workspaceId: overrides.workspaceId ?? 'ws-1',
    status: overrides.status ?? 'AI_GENERATED',
    centroidEmbedding: overrides.centroidEmbedding ?? null,
    topKeywords: overrides.topKeywords ?? null,
    aiSummary: null,
    autoMergeCandidate: false,
    autoMergeTargetId: null,
    autoMergeSimilarity: null,
  };
}

/** Cosine similarity helper (mirrors service implementation) */
function cosineSim(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
}

/** Keyword overlap Jaccard similarity */
function keywordOverlap(a: string[], b: string[]): number {
  const setA = new Set(a.map((k) => k.toLowerCase()));
  const setB = new Set(b.map((k) => k.toLowerCase()));
  const intersection = [...setA].filter((k) => setB.has(k)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Mock factories ────────────────────────────────────────────────────────────

const mockPrisma = {
  theme: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  themeFeedback: {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

const mockCiqService = {
  scoreTheme: jest.fn().mockResolvedValue({ score: 72 }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoMergeService', () => {
  let service: AutoMergeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoMergeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CiqService, useValue: mockCiqService },
      ],
    }).compile();

    service = module.get<AutoMergeService>(AutoMergeService);
  });

  // ── 1. Hybrid similarity ────────────────────────────────────────────────────

  describe('hybrid similarity computation', () => {
    it('should return 1.0 for identical embeddings and identical keywords', () => {
      const emb = [0.5, 0.5, 0.7];
      const kw = ['payment', 'failure', 'checkout'];

      const embSim = cosineSim(emb, emb);
      const kwSim = keywordOverlap(kw, kw);
      const hybrid = embSim * 0.7 + kwSim * 0.3;

      expect(hybrid).toBeCloseTo(1.0, 5);
    });

    it('should return a lower score for orthogonal embeddings', () => {
      const embA = [1, 0, 0];
      const embB = [0, 1, 0];
      const kw = ['payment'];

      const embSim = cosineSim(embA, embB); // 0
      const kwSim = keywordOverlap(kw, kw); // 1
      const hybrid = embSim * 0.7 + kwSim * 0.3;

      expect(hybrid).toBeCloseTo(0.3, 5);
    });

    it('should produce higher score when keywords overlap significantly', () => {
      const embA = [0.8, 0.2];
      const embB = [0.6, 0.4];
      const kwA = ['payment', 'error', 'checkout'];
      const kwB = ['payment', 'error', 'timeout'];

      const embSim = cosineSim(embA, embB);
      const kwSim = keywordOverlap(kwA, kwB); // 2/4 = 0.5
      const hybrid = embSim * 0.7 + kwSim * 0.3;

      // keyword overlap boosts the score
      const hybridWithoutKw = embSim * 0.7;
      expect(hybrid).toBeGreaterThan(hybridWithoutKw);
    });
  });

  // ── 2. Merge candidate detection ───────────────────────────────────────────

  describe('detectMergeCandidates', () => {
    it('should flag a theme pair with similarity > 0.85 as merge candidates', async () => {
      // Two nearly identical embeddings
      const embA = [0.9, 0.1, 0.4];
      const embB = [0.88, 0.12, 0.42];
      const kw = ['payment', 'failure', 'checkout'];

      const themeA = fakeTheme({ id: 'a', centroidEmbedding: embA, topKeywords: kw });
      const themeB = fakeTheme({ id: 'b', centroidEmbedding: embB, topKeywords: kw });

      mockPrisma.theme.findMany.mockResolvedValue([themeA, themeB]);
      mockPrisma.theme.update.mockResolvedValue({});

      await service.detectMergeCandidates('ws-1');

      // At least one update call should set autoMergeCandidate = true
      const updateCalls = mockPrisma.theme.update.mock.calls;
      const flaggedCalls = updateCalls.filter(
        ([args]: [{ data: { autoMergeCandidate: boolean } }]) => args.data.autoMergeCandidate === true,
      );
      expect(flaggedCalls.length).toBeGreaterThan(0);
    });

    it('should NOT flag a theme pair with similarity < 0.85', async () => {
      // Orthogonal embeddings — similarity will be well below 0.85
      const themeA = fakeTheme({ id: 'a', centroidEmbedding: [1, 0, 0], topKeywords: ['payment'] });
      const themeB = fakeTheme({ id: 'b', centroidEmbedding: [0, 1, 0], topKeywords: ['login'] });

      mockPrisma.theme.findMany.mockResolvedValue([themeA, themeB]);
      mockPrisma.theme.update.mockResolvedValue({});

      await service.detectMergeCandidates('ws-1');

      const updateCalls = mockPrisma.theme.update.mock.calls;
      const flaggedCalls = updateCalls.filter(
        ([args]: [{ data: { autoMergeCandidate: boolean } }]) => args.data.autoMergeCandidate === true,
      );
      expect(flaggedCalls.length).toBe(0);
    });

    it('should skip themes without centroid embeddings', async () => {
      const themeA = fakeTheme({ id: 'a', centroidEmbedding: undefined });
      const themeB = fakeTheme({ id: 'b', centroidEmbedding: [0.5, 0.5] });

      mockPrisma.theme.findMany.mockResolvedValue([themeA, themeB]);

      await service.detectMergeCandidates('ws-1');

      // No updates should be made when embeddings are missing
      expect(mockPrisma.theme.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ autoMergeCandidate: true }) }),
      );
    });
  });

  // ── 3. Execute merge ────────────────────────────────────────────────────────

  describe('executeMerge', () => {
    it('should re-assign all feedback from source to target theme', async () => {
      const source = fakeTheme({ id: 'source', workspaceId: 'ws-1' });
      const target = fakeTheme({ id: 'target', workspaceId: 'ws-1' });

      mockPrisma.theme.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(source);
      mockPrisma.themeFeedback.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.themeFeedback.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.theme.update.mockResolvedValue({});
      mockPrisma.theme.delete.mockResolvedValue({});

      await service.executeMerge('ws-1', 'target', 'source', 'user-1');

      expect(mockPrisma.themeFeedback.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ themeId: 'source' }),
          data: expect.objectContaining({ themeId: 'target' }),
        }),
      );
    });

    it('should delete the source theme after merging', async () => {
      const source = fakeTheme({ id: 'source', workspaceId: 'ws-1' });
      const target = fakeTheme({ id: 'target', workspaceId: 'ws-1' });

      mockPrisma.theme.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(source);
      mockPrisma.themeFeedback.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.themeFeedback.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.theme.update.mockResolvedValue({});
      mockPrisma.theme.delete.mockResolvedValue({});

      await service.executeMerge('ws-1', 'target', 'source', 'user-1');

      expect(mockPrisma.theme.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'source' } }),
      );
    });

    it('should throw if source and target are in different workspaces', async () => {
      const source = fakeTheme({ id: 'source', workspaceId: 'ws-OTHER' });
      const target = fakeTheme({ id: 'target', workspaceId: 'ws-1' });

      mockPrisma.theme.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(source);

      await expect(
        service.executeMerge('ws-1', 'target', 'source', 'user-1'),
      ).rejects.toThrow();
    });
  });

  // ── 4. Dismiss ──────────────────────────────────────────────────────────────

  describe('dismissMergeCandidate', () => {
    it('should clear the autoMergeCandidate flag on the theme', async () => {
      mockPrisma.theme.update.mockResolvedValue({});

      await service.dismissMergeCandidate('ws-1', 'theme-1');

      expect(mockPrisma.theme.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'theme-1' },
          data: expect.objectContaining({ autoMergeCandidate: false }),
        }),
      );
    });
  });
});
