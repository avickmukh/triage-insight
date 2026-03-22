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
} from '@nestjs/common';
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { WorkspaceRole, IntegrationProvider } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectZendeskDto } from './dto/connect-zendesk.dto';
import { ConnectIntercomDto } from './dto/connect-intercom.dto';
import { ConnectSlackDto } from './dto/connect-slack.dto';
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";

/**
 * Shape returned by GET /workspaces/:workspaceId/integrations
 *
 * Every known provider is always present in the list so the frontend can
 * render a card for each one regardless of connection state.
 */
export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  /** Non-sensitive metadata (e.g. Slack team name, Zendesk subdomain). */
  metadata: Record<string, string> | null;
  createdAt: string | null;
}

/** All providers the product currently surfaces to workspace admins. */
const KNOWN_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.SLACK,
  IntegrationProvider.ZENDESK,
  IntegrationProvider.INTERCOM,
  IntegrationProvider.FRESHDESK,
  IntegrationProvider.HUBSPOT,
  IntegrationProvider.SALESFORCE,
  IntegrationProvider.EMAIL,
  IntegrationProvider.STRIPE,
];

@Controller('workspaces/:workspaceId/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('support-sync') private readonly syncQueue: Queue,
  ) {}

  // ─── GET /workspaces/:workspaceId/integrations ────────────────────────────
  /**
   * Returns the connection status for every known provider.
   * ADMIN, EDITOR, and VIEWER may all read this list.
   */
  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  async listIntegrations(
    @Param('workspaceId') workspaceId: string,
  ): Promise<IntegrationStatus[]> {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { workspaceId },
      select: {
        provider: true,
        lastSyncedAt: true,
        metadata: true,
        subdomain: true,
        createdAt: true,
      },
    });

    const connectedMap = new Map(
      connections.map((c) => [c.provider, c]),
    );

    return KNOWN_PROVIDERS.map((provider) => {
      const conn = connectedMap.get(provider);
      if (!conn) {
        return {
          provider,
          connected: false,
          lastSyncedAt: null,
          metadata: null,
          createdAt: null,
        };
      }
      const stored = (conn.metadata as Record<string, string> | null) ?? {};
      const meta: Record<string, string> = { ...stored };
      if (conn.subdomain) meta.subdomain = conn.subdomain;
      return {
        provider,
        connected: true,
        lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
        metadata: Object.keys(meta).length > 0 ? meta : null,
        createdAt: conn.createdAt.toISOString(),
      };
    });
  }

  // ─── POST /workspaces/:workspaceId/integrations/zendesk/connect ───────────
  @Post('zendesk/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectZendesk(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectZendeskDto,
  ): Promise<IntegrationStatus> {
    const conn = await this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ZENDESK } },
      update: { accessToken: dto.accessToken, subdomain: dto.subdomain },
      create: { workspaceId, provider: IntegrationProvider.ZENDESK, accessToken: dto.accessToken, subdomain: dto.subdomain },
    });
    return {
      provider: conn.provider,
      connected: true,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      metadata: conn.subdomain ? { subdomain: conn.subdomain } : null,
      createdAt: conn.createdAt.toISOString(),
    };
  }

  // ─── POST /workspaces/:workspaceId/integrations/intercom/connect ──────────
  @Post('intercom/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectIntercom(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectIntercomDto,
  ): Promise<IntegrationStatus> {
    const conn = await this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.INTERCOM } },
      update: { accessToken: dto.accessToken },
      create: { workspaceId, provider: IntegrationProvider.INTERCOM, accessToken: dto.accessToken },
    });
    return {
      provider: conn.provider,
      connected: true,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      metadata: null,
      createdAt: conn.createdAt.toISOString(),
    };
  }

  // ─── POST /workspaces/:workspaceId/integrations/slack/connect ─────────────
  /**
   * Stores a Slack bot token.  In production this endpoint would be called
   * from the OAuth callback after the user authorises the Slack App.
   */
  @Post('slack/connect')
  @Roles(WorkspaceRole.ADMIN)
  async connectSlack(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ConnectSlackDto,
  ): Promise<IntegrationStatus> {
    const metadata: Record<string, string> = {};
    if (dto.teamId) metadata.teamId = dto.teamId;
    if (dto.teamName) metadata.teamName = dto.teamName;

    const conn = await this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.SLACK } },
      update: {
        accessToken: dto.accessToken,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
      create: {
        workspaceId,
        provider: IntegrationProvider.SLACK,
        accessToken: dto.accessToken,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
    });
    return {
      provider: conn.provider,
      connected: true,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      createdAt: conn.createdAt.toISOString(),
    };
  }

  // ─── DELETE /workspaces/:workspaceId/integrations/:provider ───────────────
  /**
   * Disconnects (deletes) an integration connection.
   * Returns 204 No Content on success.
   */
  @Delete(':provider')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectIntegration(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
  ): Promise<void> {
    const providerEnum = provider.toUpperCase() as IntegrationProvider;
    if (!Object.values(IntegrationProvider).includes(providerEnum)) {
      return;
    }
    await this.prisma.integrationConnection.deleteMany({
      where: { workspaceId, provider: providerEnum },
    });
  }

  // ─── POST /workspaces/:workspaceId/integrations/sync ─────────────────────
  @Post('sync')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  async sync(@Param('workspaceId') workspaceId: string) {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { workspaceId },
    });
    for (const conn of connections) {
      await this.syncQueue.add({
        workspaceId,
        provider: conn.provider,
        lastSyncedAt: conn.lastSyncedAt,
      });
    }
    return { message: 'Sync jobs started for all active integrations.' };
  }
}
