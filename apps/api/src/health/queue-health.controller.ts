/**
 * QueueHealthController
 *
 * Exposes GET /health/queues — a detailed queue-depth and status report
 * for all 20 Bull queues registered in QueueModule.
 *
 * Response shape:
 * {
 *   "timestamp": "2025-03-28T12:00:00.000Z",
 *   "overall": "ok" | "warn" | "error",
 *   "queues": [
 *     {
 *       "name": "ai-analysis",
 *       "waiting": 0,
 *       "active": 1,
 *       "completed": 142,
 *       "failed": 0,
 *       "delayed": 0,
 *       "paused": false,
 *       "status": "ok",
 *       "warnings": []
 *     },
 *     ...
 *   ]
 * }
 *
 * Status codes:
 *   200 — overall is "ok" or "warn" (service is up, warnings are informational)
 *   503 — overall is "error" (Redis unreachable or queue stats unavailable)
 *
 * This endpoint is intentionally unauthenticated so that monitoring tools
 * (Datadog, Grafana, k8s probes) can reach it without credentials.
 */
import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QueueHealthService, QueueHealthReport } from './queue-health.service';

@Controller('health/queues')
export class QueueHealthController {
  constructor(private readonly queueHealthService: QueueHealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const report: QueueHealthReport = await this.queueHealthService.getReport();
    const statusCode =
      report.overall === 'error'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.OK;
    res.status(statusCode).json(report);
  }
}
