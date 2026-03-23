/**
 * IntegrationService — Unified Integration Abstraction
 *
 * Responsibilities:
 * 1. Unified provider registry — all future integrations register here
 * 2. Health state management — OK / ERROR / SYNCING transitions
 * 3. Error tracking — persists lastErrorAt + lastErrorMessage on failure
 * 4. Status management — ACTIVE / DISCONNECTED / ERROR / SYNCING
 * 5. Safe connect / disconnect lifecycle
 * 6. Normalised IntegrationStatusDto for API responses (no secrets exposed)
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationHealthState,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ZendeskService } from '../providers/zendesk.service';
import { IntercomService } from '../providers/intercom.service';
import { SupportProvider } from '../providers/provider.interface';

// ─── Normalised response DTO (no secrets) ─────────────────────────────────────

export interface IntegrationStatusDto {
  provider: IntegrationProvider;
  connected: boolean;
  status: IntegrationStatus;
  healthState: IntegrationHealthState;
  lastSyncedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  /** Non-sensitive display metadata only — never exposes tokens */
  metadata: Record<string, string> | null;
  createdAt: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/** All providers the product surfaces to workspace admins. */
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

/** Keys that must never appear in the metadata returned to the API. */
const SECRET_KEY_PATTERN = /token|secret|key|password|credential/i;

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── List all known providers for a workspace ───────────────────────────────

  async listAll(workspaceId: string): Promise<IntegrationStatusDto[]> {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { workspaceId },
      select: {
        provider: true,
        status: true,
        healthState: true,
        lastSyncedAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        metadata: true,
        subdomain: true,
        createdAt: true,
      },
    });

    const connMap = new Map(connections.map((c) => [c.provider, c]));

    return KNOWN_PROVIDERS.map((provider) => {
      const conn = connMap.get(provider);
      if (!conn) {
        return {
          provider,
          connected: false,
          status: IntegrationStatus.DISCONNECTED,
          healthState: IntegrationHealthState.UNKNOWN,
          lastSyncedAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          metadata: null,
          createdAt: null,
        };
      }

      const safeMeta = this.sanitizeMetadata(conn.metadata, conn.subdomain);

      return {
        provider,
        connected:
          conn.status === IntegrationStatus.ACTIVE ||
          conn.status === IntegrationStatus.SYNCING,
        status: conn.status,
        healthState: conn.healthState,
        lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
        lastErrorAt: conn.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: conn.lastErrorMessage ?? null,
        metadata: safeMeta,
        createdAt: conn.createdAt.toISOString(),
      };
    });
  }

  // ── Get single provider status ─────────────────────────────────────────────

  async getStatus(
    workspaceId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationStatusDto> {
    const all = await this.listAll(workspaceId);
    const found = all.find((s) => s.provider === provider);
    if (!found) throw new NotFoundException(`Integration ${provider} not found`);
    return found;
  }

  // ── Connect a provider ─────────────────────────────────────────────────────

  async connect(
    workspaceId: string,
    provider: IntegrationProvider,
    credentials: {
      accessToken: string;
      refreshToken?: string;
      subdomain?: string;
      metadata?: Record<string, unknown>;
    },
    createdBy?: string,
  ): Promise<IntegrationStatusDto> {
    if (!credentials.accessToken?.trim()) {
      throw new BadRequestException('accessToken is required');
    }

    await this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider } },
      create: {
        workspaceId,
        provider,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken ?? null,
        subdomain: credentials.subdomain ?? null,
        metadata: (credentials.metadata ?? {}) as object,
        status: IntegrationStatus.ACTIVE,
        healthState: IntegrationHealthState.OK,
        createdBy: createdBy ?? null,
      },
      update: {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken ?? null,
        subdomain: credentials.subdomain ?? null,
        metadata: (credentials.metadata ?? {}) as object,
        status: IntegrationStatus.ACTIVE,
        healthState: IntegrationHealthState.OK,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    this.logger.log(
      `Integration connected: workspace=${workspaceId} provider=${provider}`,
    );
    return this.getStatus(workspaceId, provider);
  }

  // ── Disconnect a provider ──────────────────────────────────────────────────

  async disconnect(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    await this.prisma.integrationConnection.deleteMany({
      where: { workspaceId, provider },
    });
    this.logger.log(
      `Integration disconnected: workspace=${workspaceId} provider=${provider}`,
    );
  }

  // ── Health state transitions ───────────────────────────────────────────────

  async markSyncing(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    await this.prisma.integrationConnection.updateMany({
      where: { workspaceId, provider },
      data: {
        healthState: IntegrationHealthState.SYNCING,
        status: IntegrationStatus.SYNCING,
      },
    });
  }

  async markHealthy(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    await this.prisma.integrationConnection.updateMany({
      where: { workspaceId, provider },
      data: {
        healthState: IntegrationHealthState.OK,
        status: IntegrationStatus.ACTIVE,
        lastSyncedAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
  }

  async markError(
    workspaceId: string,
    provider: IntegrationProvider,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.integrationConnection.updateMany({
      where: { workspaceId, provider },
      data: {
        healthState: IntegrationHealthState.ERROR,
        status: IntegrationStatus.ERROR,
        lastErrorAt: new Date(),
        lastErrorMessage: errorMessage.slice(0, 500),
      },
    });
    this.logger.warn(
      `Integration error: workspace=${workspaceId} provider=${provider} error=${errorMessage}`,
    );
  }

  // ── Get raw connection (internal use only — never expose to API) ───────────

  async getConnection(workspaceId: string, provider: IntegrationProvider) {
    const conn = await this.prisma.integrationConnection.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });
    if (!conn) {
      throw new NotFoundException(
        `No ${provider} integration found for workspace ${workspaceId}`,
      );
    }
    return conn;
  }

  // ── Legacy: get typed provider instance ───────────────────────────────────

  /** @deprecated Use getConnection() + provider-specific service directly. */
  async getProviderInstance(
    workspaceId: string,
    provider: IntegrationProvider,
  ): Promise<SupportProvider> {
    const connection = await this.getConnection(workspaceId, provider);
    switch (provider) {
      case IntegrationProvider.ZENDESK:
        return new ZendeskService(connection.accessToken, connection.subdomain ?? '');
      case IntegrationProvider.INTERCOM:
        return new IntercomService(connection.accessToken);
      default:
        throw new BadRequestException(
          `Provider ${String(provider)} not supported via SupportProvider interface.`,
        );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private sanitizeMetadata(
    metadata: unknown,
    subdomain?: string | null,
  ): Record<string, string> | null {
    const raw = (metadata ?? {}) as Record<string, unknown>;
    const safe: Record<string, string> = {};

    for (const [k, v] of Object.entries(raw)) {
      if (SECRET_KEY_PATTERN.test(k)) continue;
      if (typeof v === 'string') safe[k] = v;
      else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = String(v);
    }
    if (subdomain) safe['subdomain'] = subdomain;

    return Object.keys(safe).length > 0 ? safe : null;
  }
}
