import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Alert type constants ────────────────────────────────────────────────────
export type AlertType = 'VELOCITY_SPIKE' | 'RESURFACED' | 'SENTIMENT_DROP';

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface TrendAlert {
  themeId: string;
  themeName: string;
  shortLabel: string | null;
  alertType: AlertType;
  urgency: UrgencyLevel;
  changePercent: number | null; // WoW velocity % or sentiment shift %
  reason: string; // deterministic, human-readable explanation
  signals: {
    trendDelta: number | null;
    resurfaceCount: number;
    resurfacedAt: Date | null;
    negativePct: number | null; // 0–1 fraction of negative signals
    totalSignals: number;
    ciqScore: number;
  };
}

export interface TrendAlertResponse {
  generatedAt: string;
  alerts: TrendAlert[];
}

// ─── Detection thresholds ────────────────────────────────────────────────────
/** Velocity spike: trendDelta ≥ this value (%) triggers a VELOCITY_SPIKE alert */
const VELOCITY_SPIKE_THRESHOLD = 25; // +25% WoW
const VELOCITY_CRITICAL_THRESHOLD = 50; // +50% WoW → CRITICAL

/** Resurfacing: any theme with resurfaceCount > 0 and resurfacedAt within 14 days */
const RESURFACE_WINDOW_DAYS = 14;

/** Sentiment drop: fraction of negative signals ≥ this triggers a SENTIMENT_DROP alert */
const SENTIMENT_DROP_THRESHOLD = 0.45; // ≥ 45% negative
const SENTIMENT_CRITICAL_THRESHOLD = 0.65; // ≥ 65% negative → CRITICAL

@Injectable()
export class TrendAlertService {
  private readonly logger = new Logger(TrendAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAlerts(workspaceId: string): Promise<TrendAlertResponse> {
    // ── 1. Fetch all non-archived themes with alert-relevant fields ───────────
    const themes = await this.prisma.theme.findMany({
      where: {
        workspaceId,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        title: true,
        shortLabel: true,
        ciqScore: true,
        priorityScore: true,
        trendDelta: true,
        trendDirection: true,
        currentWeekSignals: true,
        prevWeekSignals: true,
        resurfaceCount: true,
        resurfacedAt: true,
        sentimentDistribution: true,
        totalSignalCount: true,
        feedbackCount: true,
        lastEvidenceAt: true,
      },
    });

    if (themes.length === 0) {
      return { generatedAt: new Date().toISOString(), alerts: [] };
    }

    const now = Date.now();
    const rawAlerts: (TrendAlert & { _score: number })[] = [];

    for (const t of themes) {
      const ciq = Math.round(t.ciqScore ?? t.priorityScore ?? 0);
      const delta = t.trendDelta ?? 0;

      // ── Detector 1: Velocity spike ─────────────────────────────────────────
      if (delta >= VELOCITY_SPIKE_THRESHOLD) {
        const urgency: UrgencyLevel =
          delta >= VELOCITY_CRITICAL_THRESHOLD ? 'CRITICAL' : 'HIGH';
        const prev = t.prevWeekSignals ?? 0;
        const curr = t.currentWeekSignals ?? 0;
        const reason = [
          `Signal velocity spiked +${Math.round(delta)}% week-over-week`,
          curr > 0 && prev > 0 ? `(${prev} → ${curr} signals)` : null,
          ciq > 0 ? `CIQ score ${ciq}/100` : null,
          t.totalSignalCount ? `${t.totalSignalCount} total signals` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        rawAlerts.push({
          themeId: t.id,
          themeName: t.title,
          shortLabel: t.shortLabel ?? null,
          alertType: 'VELOCITY_SPIKE',
          urgency,
          changePercent: Math.round(delta),
          reason,
          signals: {
            trendDelta: delta,
            resurfaceCount: t.resurfaceCount ?? 0,
            resurfacedAt: t.resurfacedAt ?? null,
            negativePct: null,
            totalSignals: t.totalSignalCount ?? 0,
            ciqScore: ciq,
          },
          _score: delta + (urgency === 'CRITICAL' ? 50 : 0),
        });
      }

      // ── Detector 2: Resurfacing ────────────────────────────────────────────
      if ((t.resurfaceCount ?? 0) > 0 && t.resurfacedAt) {
        const ageDays = (now - new Date(t.resurfacedAt).getTime()) / 86_400_000;
        if (ageDays <= RESURFACE_WINDOW_DAYS) {
          const count = t.resurfaceCount ?? 1;
          const urgency: UrgencyLevel =
            count >= 3 ? 'CRITICAL' : count >= 2 ? 'HIGH' : 'MEDIUM';
          const reason = [
            `Resurfaced ${count}× after being shipped`,
            `Last resurfaced ${Math.round(ageDays)} day${Math.round(ageDays) === 1 ? '' : 's'} ago`,
            ciq > 0 ? `CIQ score ${ciq}/100` : null,
            delta > 0 ? `velocity +${Math.round(delta)}% WoW` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          rawAlerts.push({
            themeId: t.id,
            themeName: t.title,
            shortLabel: t.shortLabel ?? null,
            alertType: 'RESURFACED',
            urgency,
            changePercent: null,
            reason,
            signals: {
              trendDelta: delta,
              resurfaceCount: count,
              resurfacedAt: t.resurfacedAt,
              negativePct: null,
              totalSignals: t.totalSignalCount ?? 0,
              ciqScore: ciq,
            },
            _score:
              count * 30 +
              (urgency === 'CRITICAL' ? 50 : urgency === 'HIGH' ? 25 : 0),
          });
        }
      }

      // ── Detector 3: Sudden negative sentiment increase ─────────────────────
      const dist = t.sentimentDistribution as {
        positive?: number;
        neutral?: number;
        negative?: number;
      } | null;
      if (dist) {
        const pos = dist.positive ?? 0;
        const neu = dist.neutral ?? 0;
        const neg = dist.negative ?? 0;
        const total = pos + neu + neg;
        if (total >= 5) {
          // need at least 5 signals to be statistically meaningful
          const negativePct = neg / total;
          if (negativePct >= SENTIMENT_DROP_THRESHOLD) {
            const urgency: UrgencyLevel =
              negativePct >= SENTIMENT_CRITICAL_THRESHOLD ? 'CRITICAL' : 'HIGH';
            const reason = [
              `${Math.round(negativePct * 100)}% of signals are negative (${neg}/${total})`,
              ciq > 0 ? `CIQ score ${ciq}/100` : null,
              delta > 0 ? `velocity +${Math.round(delta)}% WoW` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            rawAlerts.push({
              themeId: t.id,
              themeName: t.title,
              shortLabel: t.shortLabel ?? null,
              alertType: 'SENTIMENT_DROP',
              urgency,
              changePercent: Math.round(negativePct * 100),
              reason,
              signals: {
                trendDelta: delta,
                resurfaceCount: t.resurfaceCount ?? 0,
                resurfacedAt: t.resurfacedAt ?? null,
                negativePct,
                totalSignals: total,
                ciqScore: ciq,
              },
              _score: negativePct * 100 + (urgency === 'CRITICAL' ? 50 : 0),
            });
          }
        }
      }
    }

    // ── 2. Deduplicate: one alert per theme (keep highest-scoring alert type) ─
    const byTheme = new Map<string, (typeof rawAlerts)[0]>();
    for (const alert of rawAlerts) {
      const existing = byTheme.get(alert.themeId);
      if (!existing || alert._score > existing._score) {
        byTheme.set(alert.themeId, alert);
      }
    }

    // ── 3. Sort by score descending, take top 5 ───────────────────────────────
    const top5 = Array.from(byTheme.values())
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)
      .map(({ _score: _s, ...alert }) => alert); // strip internal _score field

    this.logger.log(
      `[TrendAlert] ${top5.length} alerts generated for workspace ${workspaceId} ` +
        `(${rawAlerts.length} raw detections across ${themes.length} themes)`,
    );

    return { generatedAt: new Date().toISOString(), alerts: top5 };
  }
}
