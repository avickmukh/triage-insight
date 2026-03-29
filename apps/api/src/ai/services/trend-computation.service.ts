import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * TrendComputationService
 *
 * Computes weekly signal trends for each theme and updates:
 *   - trendDirection: 'UP' | 'STABLE' | 'DOWN'
 *   - trendDelta: percentage change vs. previous 7-day window
 *   - currentWeekSignals: signal count in the last 7 days
 *   - prevWeekSignals: signal count in the 7 days before that
 *   - lastTrendedAt: timestamp of this computation
 *
 * TREND LOGIC (PRD Part 5):
 *   - UP:     trendDelta >= +10%
 *   - STABLE: trendDelta between -10% and +10%
 *   - DOWN:   trendDelta <= -10%
 *
 * PERFORMANCE (PRD Part 8):
 *   - Single SQL query per workspace using GROUP BY to count signals in both windows
 *   - No O(n²) comparisons; processes all themes in one pass
 *   - Batch update via updateMany for themes with unchanged direction
 */
@Injectable()
export class TrendComputationService {
  private readonly logger = new Logger(TrendComputationService.name);

  /** Threshold for UP/DOWN classification (percentage). */
  private readonly TREND_UP_THRESHOLD = 10;
  private readonly TREND_DOWN_THRESHOLD = -10;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Compute and persist trends for all themes in a workspace.
   * Returns a summary of how many themes changed direction.
   */
  async computeWorkspaceTrends(workspaceId: string): Promise<{
    processed: number;
    up: number;
    stable: number;
    down: number;
  }> {
    this.logger.log(`[Trend] Computing trends for workspace ${workspaceId}`);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Count signals per theme in current and previous windows using a single query
    const rows = await this.prisma.$queryRaw<Array<{
      themeId: string;
      currentWeek: bigint;
      prevWeek: bigint;
    }>>`
      SELECT
        tf."themeId",
        COUNT(CASE WHEN f."createdAt" >= ${weekAgo} AND f."createdAt" < ${now} THEN 1 END)         AS "currentWeek",
        COUNT(CASE WHEN f."createdAt" >= ${twoWeeksAgo} AND f."createdAt" < ${weekAgo} THEN 1 END) AS "prevWeek"
      FROM "ThemeFeedback" tf
      JOIN "Feedback" f ON f.id = tf."feedbackId"
      JOIN "Theme" t ON t.id = tf."themeId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t.status != 'ARCHIVED'
      GROUP BY tf."themeId";
    `;

    let up = 0, stable = 0, down = 0;

    for (const row of rows) {
      const current = Number(row.currentWeek);
      const prev = Number(row.prevWeek);

      let trendDelta = 0;
      if (prev > 0) {
        trendDelta = ((current - prev) / prev) * 100;
      } else if (current > 0) {
        trendDelta = 100; // new signals where there were none → 100% up
      }

      const trendDirection =
        trendDelta >= this.TREND_UP_THRESHOLD
          ? 'UP'
          : trendDelta <= this.TREND_DOWN_THRESHOLD
          ? 'DOWN'
          : 'STABLE';

      await this.prisma.theme.update({
        where: { id: row.themeId },
        data: {
          trendDirection,
          trendDelta: parseFloat(trendDelta.toFixed(1)),
          currentWeekSignals: current,
          prevWeekSignals: prev,
          lastTrendedAt: now,
        },
      });

      if (trendDirection === 'UP') up++;
      else if (trendDirection === 'DOWN') down++;
      else stable++;
    }

    this.logger.log(
      `[Trend] Workspace ${workspaceId}: processed=${rows.length}, up=${up}, stable=${stable}, down=${down}`,
    );

    return { processed: rows.length, up, stable, down };
  }

  /**
   * Compute trend for a single theme (called after CIQ scoring or new feedback).
   */
  async computeThemeTrend(themeId: string): Promise<{
    trendDirection: string;
    trendDelta: number;
    currentWeekSignals: number;
    prevWeekSignals: number;
  }> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<Array<{
      currentWeek: bigint;
      prevWeek: bigint;
    }>>`
      SELECT
        COUNT(CASE WHEN f."createdAt" >= ${weekAgo} AND f."createdAt" < ${now} THEN 1 END)         AS "currentWeek",
        COUNT(CASE WHEN f."createdAt" >= ${twoWeeksAgo} AND f."createdAt" < ${weekAgo} THEN 1 END) AS "prevWeek"
      FROM "ThemeFeedback" tf
      JOIN "Feedback" f ON f.id = tf."feedbackId"
      WHERE tf."themeId" = ${themeId};
    `;

    const current = Number(rows[0]?.currentWeek ?? 0);
    const prev = Number(rows[0]?.prevWeek ?? 0);

    let trendDelta = 0;
    if (prev > 0) {
      trendDelta = ((current - prev) / prev) * 100;
    } else if (current > 0) {
      trendDelta = 100;
    }

    const trendDirection =
      trendDelta >= this.TREND_UP_THRESHOLD
        ? 'UP'
        : trendDelta <= this.TREND_DOWN_THRESHOLD
        ? 'DOWN'
        : 'STABLE';

    await this.prisma.theme.update({
      where: { id: themeId },
      data: {
        trendDirection,
        trendDelta: parseFloat(trendDelta.toFixed(1)),
        currentWeekSignals: current,
        prevWeekSignals: prev,
        lastTrendedAt: now,
      },
    });

    return { trendDirection, trendDelta, currentWeekSignals: current, prevWeekSignals: prev };
  }
}
