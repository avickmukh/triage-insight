/**
 * SentimentService
 *
 * Lexicon-based sentiment scoring for support tickets.
 * Scores each ticket's subject + description on a -1.0 → +1.0 scale
 * using a curated positive/negative word list, then aggregates per cluster.
 *
 * Uses raw SQL for the new schema fields (sentimentScore, avgSentiment,
 * negativeTicketPct, hasActiveSpike) because the Prisma client is generated
 * from the committed schema at deploy time, not at dev-time in this repo.
 *
 * Design decisions:
 * - No external API call — fully offline, zero latency, zero cost.
 * - Scores are stored on SupportTicket.sentimentScore (nullable Float).
 * - Cluster aggregates (avgSentiment, negativeTicketPct, hasActiveSpike)
 *   are recomputed after scoring.
 * - The service is idempotent: re-scoring overwrites the previous score.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Lexicon ─────────────────────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  'great',
  'good',
  'excellent',
  'awesome',
  'love',
  'perfect',
  'thanks',
  'thank',
  'helpful',
  'resolved',
  'fixed',
  'working',
  'fast',
  'quick',
  'easy',
  'smooth',
  'happy',
  'pleased',
  'satisfied',
  'appreciate',
  'wonderful',
  'fantastic',
  'brilliant',
  'superb',
  'outstanding',
  'impressive',
  'reliable',
  'efficient',
  'clear',
  'simple',
  'intuitive',
]);

const NEGATIVE_WORDS = new Set([
  'broken',
  'bug',
  'error',
  'fail',
  'failed',
  'failure',
  'crash',
  'crashing',
  'slow',
  'terrible',
  'awful',
  'horrible',
  'bad',
  'worst',
  'useless',
  'frustrating',
  'frustrated',
  'annoying',
  'annoyed',
  'disappointed',
  'disappointing',
  'confusing',
  'confused',
  'stuck',
  'unable',
  'cannot',
  'cant',
  'wont',
  'doesnt',
  'wrong',
  'issue',
  'problem',
  'urgent',
  'critical',
  'blocker',
  'blocking',
  'down',
  'outage',
  'unavailable',
  'missing',
  'lost',
  'deleted',
  'corrupt',
  'corrupted',
  'timeout',
  'hang',
  'hanging',
  'freeze',
  'frozen',
  'unacceptable',
  'ridiculous',
  'hate',
  'waste',
  'refund',
  'cancel',
]);

const NEGATION_WORDS = new Set([
  'not',
  'no',
  'never',
  'neither',
  'nor',
  "n't",
  'without',
]);

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score a single piece of text. Returns a value in [-1, +1].
   * Uses a sliding-window negation: a negation word within 3 tokens
   * flips the polarity of the next sentiment word.
   */
  scoreText(text: string): number {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    let positive = 0;
    let negative = 0;
    let negationActive = false;
    let negationWindow = 0;

    for (const token of tokens) {
      if (NEGATION_WORDS.has(token)) {
        negationActive = true;
        negationWindow = 3;
        continue;
      }

      const isPositive = POSITIVE_WORDS.has(token);
      const isNegative = NEGATIVE_WORDS.has(token);

      if (isPositive || isNegative) {
        const polarity = isPositive ? 1 : -1;
        const effective = negationActive ? -polarity : polarity;
        if (effective > 0) positive++;
        else negative++;
      }

      if (negationActive) {
        negationWindow--;
        if (negationWindow <= 0) negationActive = false;
      }
    }

    const total = positive + negative;
    if (total === 0) return 0;
    return (positive - negative) / total;
  }

  /**
   * Score all tickets in a workspace and persist the results via raw SQL.
   * Returns the count of tickets scored.
   */
  async scoreWorkspaceTickets(
    workspaceId: string,
  ): Promise<{ scored: number }> {
    this.logger.log(`[Sentiment] Scoring tickets for workspace ${workspaceId}`);

    const tickets = await this.prisma.supportTicket.findMany({
      where: { workspaceId },
      select: { id: true, subject: true, description: true },
    });

    if (tickets.length === 0) return { scored: 0 };

    for (const t of tickets) {
      const text = `${t.subject} ${t.description ?? ''}`;
      const score = this.scoreText(text);
      await this.prisma.$executeRaw`
        UPDATE "SupportTicket"
        SET "sentimentScore" = ${score}
        WHERE id = ${t.id}
      `;
    }

    this.logger.log(`[Sentiment] Scored ${tickets.length} tickets`);
    return { scored: tickets.length };
  }

  /**
   * Aggregate sentiment scores from tickets into their parent clusters via raw SQL.
   * Updates avgSentiment, negativeTicketPct, and hasActiveSpike on each cluster.
   */
  async aggregateClusterSentiment(
    workspaceId: string,
  ): Promise<{ updated: number }> {
    this.logger.log(
      `[Sentiment] Aggregating cluster sentiment for workspace ${workspaceId}`,
    );

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Single SQL statement: aggregate per cluster and update in one pass
    await this.prisma.$executeRaw`
      UPDATE "SupportIssueCluster" AS c
      SET
        "avgSentiment"      = agg."avgSentiment",
        "negativeTicketPct" = agg."negativeTicketPct",
        "hasActiveSpike"    = agg."hasActiveSpike"
      FROM (
        SELECT
          m."clusterId",
          AVG(t."sentimentScore")                                                 AS "avgSentiment",
          COALESCE(
            SUM(CASE WHEN t."sentimentScore" < -0.2 THEN 1 ELSE 0 END)::float
            / NULLIF(COUNT(t."sentimentScore"), 0),
            0
          )                                                                       AS "negativeTicketPct",
          EXISTS (
            SELECT 1 FROM "IssueSpikeEvent" se
            WHERE se."clusterId" = m."clusterId"
              AND se."windowEnd" >= ${sevenDaysAgo}
          )                                                                       AS "hasActiveSpike"
        FROM "SupportIssueClusterMap" m
        JOIN "SupportTicket" t ON t.id = m."ticketId"
        GROUP BY m."clusterId"
      ) agg
      WHERE c.id = agg."clusterId"
        AND c."workspaceId" = ${workspaceId}
    `;

    const count = await this.prisma.supportIssueCluster.count({
      where: { workspaceId },
    });
    this.logger.log(`[Sentiment] Updated ${count} clusters`);
    return { updated: count };
  }

  /**
   * Full sentiment pass: score tickets then aggregate into clusters.
   */
  async runFullSentimentPass(workspaceId: string): Promise<{
    scored: number;
    clustersUpdated: number;
  }> {
    const { scored } = await this.scoreWorkspaceTickets(workspaceId);
    const { updated: clustersUpdated } =
      await this.aggregateClusterSentiment(workspaceId);
    return { scored, clustersUpdated };
  }

  /**
   * Return the top N clusters with the most negative sentiment.
   * Used by the "Recent Negative Trends" dashboard section.
   */
  async getNegativeTrends(
    workspaceId: string,
    limit = 10,
  ): Promise<
    Array<{
      id: string;
      title: string;
      avgSentiment: number | null;
      negativeTicketPct: number | null;
      ticketCount: number;
      arrExposure: number;
      hasActiveSpike: boolean;
      themeId: string | null;
      themeTitle: string | null;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        avgSentiment: number | null;
        negativeTicketPct: number | null;
        ticketCount: number;
        arrExposure: number;
        hasActiveSpike: boolean;
        themeId: string | null;
      }>
    >`
      SELECT id, title, "avgSentiment", "negativeTicketPct",
             "ticketCount", "arrExposure", "hasActiveSpike", "themeId"
      FROM "SupportIssueCluster"
      WHERE "workspaceId" = ${workspaceId}
        AND "avgSentiment" IS NOT NULL
        AND "avgSentiment" < 0
      ORDER BY "avgSentiment" ASC
      LIMIT ${limit}
    `;

    if (rows.length === 0) return [];

    const themeIds = rows.map((r) => r.themeId).filter(Boolean) as string[];
    const themes = themeIds.length
      ? await this.prisma.theme.findMany({
          where: { id: { in: themeIds } },
          select: { id: true, title: true },
        })
      : [];
    const themeMap = new Map(themes.map((t) => [t.id, t.title]));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      avgSentiment: r.avgSentiment != null ? Number(r.avgSentiment) : null,
      negativeTicketPct:
        r.negativeTicketPct != null ? Number(r.negativeTicketPct) : null,
      ticketCount: Number(r.ticketCount),
      arrExposure: Number(r.arrExposure),
      hasActiveSpike: Boolean(r.hasActiveSpike),
      themeId: r.themeId,
      themeTitle: r.themeId ? (themeMap.get(r.themeId) ?? null) : null,
    }));
  }
}
