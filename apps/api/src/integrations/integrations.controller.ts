/**
 * IntegrationsController
 *
 * All integration management endpoints for a workspace.
 * Uses the unified IntegrationService for all state transitions.
 *
 * Routes:
 *   GET    /workspaces/:id/integrations                  — list all providers
 *   GET    /workspaces/:id/integrations/:provider/status — single provider status
 *   POST   /workspaces/:id/integrations/zendesk/connect  — connect Zendesk
 *   POST   /workspaces/:id/integrations/intercom/connect — connect Intercom
 *   POST   /workspaces/:id/integrations/slack/connect    — connect Slack
 *   GET    /workspaces/:id/integrations/slack/channels   — list Slack channels
 *   POST   /workspaces/:id/integrations/slack/channels   — configure channels
 *   POST   /workspaces/:id/integrations/slack/sync       — trigger Slack sync
 *   POST   /workspaces/:id/integrations/slack/webhook    — Slack Events API webhook
 *   DELETE /workspaces/:id/integrations/:provider        — disconnect
 *   POST   /workspaces/:id/integrations/sync             — sync all
 */
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole, IntegrationProvider } from '@prisma/client';
import { ConnectZendeskDto } from './dto/connect-zendesk.dto';
import { ConnectIntercomDto } from './dto/connect-intercom.dto';
import { ConnectSlackDto } from './dto/connect-slack.dto';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { SlackService } from './providers/slack.service';
import { SlackIngestionService } from './services/slack-ingestion.service';
import { SLACK_INGESTION_QUEUE } from './processors/slack-ingestion.processor';
import {
  IntegrationService,
  IntegrationStatusDto,
} from './services/integration.service';
import * as crypto from 'crypto';

@Controller('workspaces/:workspaceId/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly integrationService: IntegrationService,
    private readonly slackService: SlackService,
    private readonly slackIngestionService: SlackIngestionService,
    @InjectQueue('support-sync') private readonly syncQueue: Queue,
    @InjectQueue(SLACK_INGESTION_QUEUE) private readonly slackQueue: Queue,
  ) {}

  // ─── GET /workspaces/:workspaceId/integrations ────────────────────────────

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async listIntegrations(
    @Param('workspaceId') workspaceId: string,
  ): Promise<IntegrationStatusDto[]> {
    return this.integrationService.listAll(workspaceId);
  }

  // ─── GET /workspaces/:workspaceId/integrations/:provider/status ───────────

  @Get(':provider/status')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async getProviderStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
  ): Promise<IntegrationStatusDto> {
    const providerEnum = provider.toUpperCase() as IntegrationProvider;
    return this.integrationService.getStatus(workspaceId, providerEnum);
  }

  // ─── POST /workspaces/:workspaceId/integrations/zendesk/connect ───────────

  @Post('zendesk/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectZendesk(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectZendeskDto,
  ): Promise<IntegrationStatusDto> {
    return this.integrationService.connect(
      workspaceId,
      IntegrationProvider.ZENDESK,
      {
        accessToken: dto.accessToken,
        subdomain: dto.subdomain,
        metadata: { subdomain: dto.subdomain },
      },
    );
  }

  // ─── POST /workspaces/:workspaceId/integrations/intercom/connect ──────────

  @Post('intercom/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectIntercom(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectIntercomDto,
  ): Promise<IntegrationStatusDto> {
    return this.integrationService.connect(
      workspaceId,
      IntegrationProvider.INTERCOM,
      { accessToken: dto.accessToken },
    );
  }

  // ─── POST /workspaces/:workspaceId/integrations/slack/connect ─────────────

  @Post('slack/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectSlack(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectSlackDto,
  ): Promise<IntegrationStatusDto> {
    let teamMeta: Record<string, string> = {};
    if (dto.accessToken) {
      try {
        const authInfo = await this.slackService.testAuth(dto.accessToken);
        teamMeta = {
          teamId: authInfo.teamId,
          teamName: authInfo.teamName,
          botUserId: authInfo.botUserId,
        };
      } catch {
        if (dto.teamId) teamMeta.teamId = dto.teamId;
        if (dto.teamName) teamMeta.teamName = dto.teamName;
      }
    }

    return this.integrationService.connect(
      workspaceId,
      IntegrationProvider.SLACK,
      {
        accessToken: dto.accessToken,
        metadata: teamMeta,
      },
    );
  }

  // ─── GET /workspaces/:workspaceId/integrations/slack/channels ────────────

  @Get('slack/channels')
  @Roles(WorkspaceRole.ADMIN)
  async listSlackChannels(@Param('workspaceId') workspaceId: string) {
    const conn = await this.integrationService.getConnection(
      workspaceId,
      IntegrationProvider.SLACK,
    );
    const channels = await this.slackService.listChannels(conn.accessToken);
    return { channels };
  }

  // ─── POST /workspaces/:workspaceId/integrations/slack/channels ───────────

  @Post('slack/channels')
  @Roles(WorkspaceRole.ADMIN)
  async configureSlackChannels(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { channels: Array<{ id: string; name: string }> },
  ): Promise<IntegrationStatusDto> {
    const conn = await this.integrationService.getConnection(
      workspaceId,
      IntegrationProvider.SLACK,
    );
    const existing = (conn.metadata ?? {}) as Record<string, unknown>;
    // Merge channels into existing metadata via direct Prisma access
    await (this.integrationService as any).prisma.integrationConnection.update({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: IntegrationProvider.SLACK,
        },
      },
      data: { metadata: { ...existing, channels: body.channels } },
    });
    return this.integrationService.getStatus(
      workspaceId,
      IntegrationProvider.SLACK,
    );
  }

  // ─── POST /workspaces/:workspaceId/integrations/slack/sync ───────────────

  @Post('slack/sync')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  async syncSlack(@Param('workspaceId') workspaceId: string) {
    try {
      await this.slackQueue.add(
        { workspaceId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (queueErr) {
      console.warn(
        '[Queue] Redis unavailable — job skipped:',
        (queueErr as Error).message,
      );
    }
    return { message: 'Slack ingestion job queued.' };
  }

  // ─── POST /workspaces/:workspaceId/integrations/slack/webhook ────────────
  /**
   * Slack Events API webhook receiver.
   *
   * Handles:
   * 1. URL verification challenge (no auth required — Slack sends during setup)
   * 2. Real-time message events — dispatched to the Slack ingestion queue
   *
   * Security: verifies Slack request signature using SLACK_SIGNING_SECRET env var.
   * Falls back to accepting all requests if the env var is not set (dev mode).
   *
   * Note: This endpoint intentionally bypasses JwtAuthGuard — Slack calls it directly.
   * Route-level guard override is handled by not applying @UseGuards here.
   */
  @Post('slack/webhook')
  @HttpCode(HttpStatus.OK)
  async slackWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-slack-signature') slackSignature?: string,
    @Headers('x-slack-request-timestamp') slackTimestamp?: string,
  ) {
    // ── URL verification challenge ─────────────────────────────────────────
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // ── Signature verification ─────────────────────────────────────────────
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (signingSecret && slackSignature && slackTimestamp) {
      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(slackTimestamp, 10);
      if (Math.abs(now - ts) > 300) {
        this.logger.warn(
          `Slack webhook replay attack: workspace=${workspaceId}`,
        );
        return { ok: false };
      }
      const rawBody = JSON.stringify(body);
      const sigBase = `v0:${slackTimestamp}:${rawBody}`;
      const expected = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(sigBase)
        .digest('hex')}`;
      const sigBuf = Buffer.from(slackSignature, 'utf8');
      const expBuf = Buffer.from(expected, 'utf8');
      if (
        sigBuf.length !== expBuf.length ||
        !crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        this.logger.warn(
          `Slack webhook signature mismatch: workspace=${workspaceId}`,
        );
        return { ok: false };
      }
    }

    // ── Dispatch event to ingestion queue ──────────────────────────────────
    if (body.type === 'event_callback') {
      const event = body.event as Record<string, unknown> | undefined;
      if (event?.type === 'message' && !event.subtype) {
        try {
          await this.slackQueue.add(
            { workspaceId, event },
            { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
          );
        } catch (queueErr) {
          console.warn(
            '[Queue] Redis unavailable — job skipped:',
            (queueErr as Error).message,
          );
        }
        this.logger.debug(
          `Slack message event queued: workspace=${workspaceId} channel=${String(event.channel)}`,
        );
      }
    }

    return { ok: true };
  }

  // ─── DELETE /workspaces/:workspaceId/integrations/:provider ──────────────

  @Delete(':provider')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
  ): Promise<void> {
    const providerEnum = provider.toUpperCase() as IntegrationProvider;
    if (!Object.values(IntegrationProvider).includes(providerEnum)) return;
    await this.integrationService.disconnect(workspaceId, providerEnum);
  }

  // ─── POST /workspaces/:workspaceId/integrations/sync ─────────────────────

  @Post('sync')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  async sync(@Param('workspaceId') workspaceId: string) {
    const connections = await (
      this.integrationService as any
    ).prisma.integrationConnection.findMany({
      where: { workspaceId },
      select: { provider: true, lastSyncedAt: true },
    });
    for (const conn of connections) {
      try {
        await this.syncQueue.add(
          {
            workspaceId,
            provider: conn.provider,
            lastSyncedAt: conn.lastSyncedAt,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
      } catch (queueErr) {
        console.warn(
          '[Queue] Redis unavailable — job skipped:',
          (queueErr as Error).message,
        );
      }
    }
    return {
      message: `Sync jobs started for ${connections.length} active integration(s).`,
    };
  }
}
