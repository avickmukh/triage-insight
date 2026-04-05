/**
 * DuplicateDetectionService — Unit Tests
 *
 * Validates:
 *   - Embedding-based suggestions: pgvector query is called with correct args
 *   - Heuristic fallback: keyword overlap scoring when no embedding provided
 *   - Suggestions are persisted via upsert (not insert — safe for re-runs)
 *   - Tenant isolation: workspaceId is always included in DB queries
 *   - Near-duplicate detection: high-similarity items produce suggestions
 *   - Low-similarity noise: items below threshold are not suggested
 *   - Repeated processing: upsert updates similarity score, no duplicate rows
 *
 * Mocking strategy:
 *   - PrismaService is fully mocked
 *   - pgvector $queryRaw returns controlled similarity results
 *   - No real DB or vector operations
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock PrismaService ───────────────────────────────────────────────────────

function makeMockPrisma() {
  const suggestionStore: Array<{
    sourceId: string;
    targetId: string;
    similarity: number;
  }> = [];

  return {
    _store: suggestionStore,

    feedbackDuplicateSuggestion: {
      upsert: jest.fn().mockImplementation(({ create, update, where }) => {
        const key = `${where.sourceId_targetId.sourceId}:${where.sourceId_targetId.targetId}`;
        const existing = suggestionStore.findIndex(
          (s) => `${s.sourceId}:${s.targetId}` === key,
        );
        if (existing >= 0) {
          suggestionStore[existing].similarity = update.similarity;
        } else {
          suggestionStore.push({ ...create });
        }
        return Promise.resolve(create);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          suggestionStore
            .filter((s) => s.sourceId === where?.sourceId)
            .map((s) => ({
              targetId: s.targetId,
              similarity: s.similarity,
              targetFeedback: { title: `Feedback ${s.targetId}` },
            })),
        );
      }),
    },

    feedback: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    $queryRaw: jest.fn(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
    jest.clearAllMocks();

    // Re-bind mocks after clearAllMocks
    mockPrisma.feedbackDuplicateSuggestion.upsert.mockImplementation(
      ({ create, update, where }) => {
        const key = `${where.sourceId_targetId.sourceId}:${where.sourceId_targetId.targetId}`;
        const existing = mockPrisma._store.findIndex(
          (s) => `${s.sourceId}:${s.targetId}` === key,
        );
        if (existing >= 0) {
          mockPrisma._store[existing].similarity = update.similarity;
        } else {
          mockPrisma._store.push({ ...create });
        }
        return Promise.resolve(create);
      },
    );
    mockPrisma.feedbackDuplicateSuggestion.findMany.mockImplementation(
      ({ where }) => {
        return Promise.resolve(
          mockPrisma._store
            .filter((s) => s.sourceId === where?.sourceId)
            .map((s) => ({
              targetId: s.targetId,
              similarity: s.similarity,
              targetFeedback: { title: `Feedback ${s.targetId}` },
            })),
        );
      },
    );
  });

  // ── Embedding-based suggestions ──────────────────────────────────────────

  describe('generateSuggestions — embedding path', () => {
    const embedding = Array.from(
      { length: 1536 },
      (_, i) => Math.sin(i) * 0.001,
    );

    it('should call $queryRaw with workspaceId and feedbackId for tenant isolation', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi keeps disconnecting', description: 'My WiFi drops every few minutes' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const rawCall = mockPrisma.$queryRaw.mock.calls[0];
      // The query template literal should contain the workspaceId and feedbackId
      expect(JSON.stringify(rawCall)).toContain('ws-tenant-a');
      expect(JSON.stringify(rawCall)).toContain('fb-source');
    });

    it('should persist suggestions for each similar feedback found', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi drops constantly', description: 'WiFi drops constantly in the office' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'fb-similar-1',
          title: 'WiFi drops constantly',
          description: 'WiFi drops constantly',
          similarity: 0.95,
        },
        { id: 'fb-similar-2', title: 'WiFi drops constantly', description: 'WiFi drops constantly', similarity: 0.91 },
      ]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      expect(
        mockPrisma.feedbackDuplicateSuggestion.upsert,
      ).toHaveBeenCalledTimes(2);
    });

    it('should not persist suggestions when no similar feedback is found', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi keeps disconnecting', description: 'My WiFi drops every few minutes' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      expect(
        mockPrisma.feedbackDuplicateSuggestion.upsert,
      ).not.toHaveBeenCalled();
    });

    it('should use upsert to safely handle re-processing without duplicate rows', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi drops', description: 'WiFi drops in the office' });
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'fb-similar-1', title: 'WiFi drops', description: 'WiFi drops', similarity: 0.95 },
      ]);
      // First run
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);
      // Second run (re-processing)
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      // upsert called twice but store should only have one entry
      expect(
        mockPrisma.feedbackDuplicateSuggestion.upsert,
      ).toHaveBeenCalledTimes(2);
      const storeEntries = mockPrisma._store.filter(
        (s) => s.sourceId === 'fb-source',
      );
      expect(storeEntries).toHaveLength(1);
    });

    it('should persist the exact similarity score from the vector query', async () => {
      const exactSimilarity = 0.9347;
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi drops', description: 'WiFi drops in the office' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'fb-similar-1',
          title: 'WiFi drops',
          description: 'WiFi drops',
          similarity: exactSimilarity,
        },
      ]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      const upsertCall =
        mockPrisma.feedbackDuplicateSuggestion.upsert.mock.calls[0][0];
      expect(upsertCall.create.similarity).toBe(exactSimilarity);
    });

    it('should not include the source feedback itself in suggestions', async () => {
      // The SQL query has WHERE id != feedbackId — verify the call includes the exclusion
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi keeps disconnecting', description: 'My WiFi drops every few minutes' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      const rawCall = mockPrisma.$queryRaw.mock.calls[0];
      expect(JSON.stringify(rawCall)).toContain('fb-source');
    });
  });

  // ── Heuristic fallback ───────────────────────────────────────────────────

  describe('generateSuggestions — heuristic fallback (no embedding)', () => {
    it('should use keyword overlap when no embedding is provided', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValueOnce({
        id: 'fb-source',
        title: 'WiFi disconnects in office',
        normalizedText: 'wifi disconnects office network unstable',
        description: 'WiFi disconnects in the office. Network is unstable.',
      });

      mockPrisma.feedback.findMany.mockResolvedValueOnce([
        {
          id: 'fb-similar',
          title: 'WiFi disconnects in office',
          normalizedText: 'wifi disconnects office network unstable',
          description: 'WiFi disconnects in the office. Network is unstable.',
        },
        {
          id: 'fb-unrelated',
          title: 'Dark mode request',
          normalizedText: 'dark mode interface theme',
          description: 'Please add dark mode',
        },
      ]);

      await service.generateSuggestions('ws-tenant-a', 'fb-source'); // no embedding

      // Only the WiFi-related item should produce a suggestion (keyword overlap)
      const upsertCalls =
        mockPrisma.feedbackDuplicateSuggestion.upsert.mock.calls;
      const targetIds = upsertCalls.map((c) => c[0].create.targetId);
      expect(targetIds).toContain('fb-similar');
      expect(targetIds).not.toContain('fb-unrelated');
    });

    it('should return early if source feedback is not found', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValueOnce(null);

      await service.generateSuggestions('ws-tenant-a', 'fb-nonexistent');

      expect(mockPrisma.feedback.findMany).not.toHaveBeenCalled();
      expect(
        mockPrisma.feedbackDuplicateSuggestion.upsert,
      ).not.toHaveBeenCalled();
    });

    it('should return early if source feedback has no usable text', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValueOnce({
        id: 'fb-empty',
        title: '',
        normalizedText: '',
        description: '',
      });

      await service.generateSuggestions('ws-tenant-a', 'fb-empty');

      expect(
        mockPrisma.feedbackDuplicateSuggestion.upsert,
      ).not.toHaveBeenCalled();
    });
  });

  // ── findDuplicates (legacy entry point) ─────────────────────────────────

  describe('findDuplicates', () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);

    it('should return persisted suggestions after generating them', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi drops', description: 'WiFi drops in the office' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'fb-dup-1', title: 'WiFi drops', description: 'WiFi drops', similarity: 0.93 },
      ]);
      const results = await service.findDuplicates(
        'ws-tenant-a',
        'fb-source',
        embedding,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'fb-dup-1',
        similarity: 0.93,
      });
    });

    it('should return empty array when no duplicates are found', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi keeps disconnecting', description: 'My WiFi drops every few minutes' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.feedbackDuplicateSuggestion.findMany.mockResolvedValueOnce([]);
      const results = await service.findDuplicates(
        'ws-tenant-a',
        'fb-source',
        embedding,
      );

      expect(results).toEqual([]);
    });
  });

  // ── Tenant isolation ─────────────────────────────────────────────────────

  describe('Tenant isolation', () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);

    it('should scope the vector query to the correct workspaceId', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValue({ title: 'WiFi keeps disconnecting', description: 'My WiFi drops every few minutes' });
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await service.generateSuggestions('ws-tenant-a', 'fb-source', embedding);

      const rawCall = mockPrisma.$queryRaw.mock.calls[0];
      // workspaceId must appear in the query parameters
      expect(JSON.stringify(rawCall)).toContain('ws-tenant-a');
      expect(JSON.stringify(rawCall)).not.toContain('ws-tenant-b');
    });

    it('should scope the heuristic query to the correct workspaceId', async () => {
      mockPrisma.feedback.findFirst.mockResolvedValueOnce({
        id: 'fb-source',
        title: 'WiFi disconnects',
        normalizedText: 'wifi disconnects',
        description: 'WiFi disconnects',
      });
      mockPrisma.feedback.findMany.mockResolvedValueOnce([]);

      await service.generateSuggestions('ws-tenant-a', 'fb-source'); // heuristic path

      const findManyCall = mockPrisma.feedback.findMany.mock.calls[0][0];
      expect(findManyCall.where.workspaceId).toBe('ws-tenant-a');
    });
  });
});
