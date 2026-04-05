/**
 * TrendComputationService — unit tests
 *
 * Tests cover:
 *  1. UP trend: currentWeek > prevWeek by > 10%
 *  2. DOWN trend: currentWeek < prevWeek by > 10%
 *  3. STABLE trend: change within ±10%
 *  4. Edge case: prevWeek = 0 (no previous data)
 *  5. Workspace batch: processes multiple themes
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TrendComputationService } from './trend-computation.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  $queryRaw: jest.fn().mockResolvedValue([]),
  theme: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  themeFeedback: {
    count: jest.fn(),
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TrendComputationService', () => {
  let service: TrendComputationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendComputationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TrendComputationService>(TrendComputationService);
  });

  // ── 1. UP trend ─────────────────────────────────────────────────────────────

  it('should compute UP trend when current week signals exceed previous week by > 10%', async () => {
    // 10 this week vs 6 last week → +67%
    // $queryRaw returns rows with bigint counts
    mockPrisma.$queryRaw.mockResolvedValue([
      { themeId: 'theme-1', currentWeek: BigInt(10), prevWeek: BigInt(6) },
    ]);
    mockPrisma.theme.update.mockResolvedValue({});
    await service.computeWorkspaceTrends('ws-1');
    expect(mockPrisma.theme.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trendDirection: 'UP',
          trendDelta: expect.any(Number),
        }),
      }),
    );

    const updateCall = mockPrisma.theme.update.mock.calls[0][0];
    expect(updateCall.data.trendDelta).toBeGreaterThan(0);
  });

  // ── 2. DOWN trend ───────────────────────────────────────────────────────────

  it('should compute DOWN trend when current week signals are less than previous week by > 10%', async () => {
    // 4 this week vs 10 last week → -60%
    mockPrisma.$queryRaw.mockResolvedValue([
      { themeId: 'theme-1', currentWeek: BigInt(4), prevWeek: BigInt(10) },
    ]);
    mockPrisma.theme.update.mockResolvedValue({});
    await service.computeWorkspaceTrends('ws-1');
    const updateCall = mockPrisma.theme.update.mock.calls[0][0];
    expect(updateCall.data.trendDirection).toBe('DOWN');
    expect(updateCall.data.trendDelta).toBeLessThan(0);
  });

  // ── 3. STABLE trend ─────────────────────────────────────────────────────────

  it('should compute STABLE trend when change is within ±10%', async () => {
    // 10 this week vs 10 last week → 0%
    mockPrisma.$queryRaw.mockResolvedValue([
      { themeId: 'theme-1', currentWeek: BigInt(10), prevWeek: BigInt(10) },
    ]);
    mockPrisma.theme.update.mockResolvedValue({});
    await service.computeWorkspaceTrends('ws-1');
    const updateCall = mockPrisma.theme.update.mock.calls[0][0];
    expect(updateCall.data.trendDirection).toBe('STABLE');
  });

  // ── 4. Edge: prevWeek = 0 ───────────────────────────────────────────────────

  it('should handle prevWeek = 0 without division errors', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { themeId: 'theme-1', currentWeek: BigInt(5), prevWeek: BigInt(0) },
    ]);
    mockPrisma.theme.update.mockResolvedValue({});
    await expect(service.computeWorkspaceTrends('ws-1')).resolves.not.toThrow();
    const updateCall = mockPrisma.theme.update.mock.calls[0][0];
    // When prevWeek = 0 and currentWeek > 0, direction should be UP
    expect(updateCall.data.trendDirection).toBe('UP');
  });

  // ── 5. Workspace batch ──────────────────────────────────────────────────────

  it('should process all themes in the workspace', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { themeId: 'theme-1', currentWeek: BigInt(5), prevWeek: BigInt(5) },
      { themeId: 'theme-2', currentWeek: BigInt(5), prevWeek: BigInt(5) },
      { themeId: 'theme-3', currentWeek: BigInt(5), prevWeek: BigInt(5) },
    ]);
    mockPrisma.theme.update.mockResolvedValue({});
    const result = await service.computeWorkspaceTrends('ws-1');
    expect(mockPrisma.theme.update).toHaveBeenCalledTimes(3);
    expect(result).toEqual(expect.objectContaining({ processed: 3 }));
  });
});
