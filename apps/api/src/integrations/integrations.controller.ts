import { Controller, Post, Body, Param, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { Role, IntegrationProvider } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectZendeskDto } from "./dto/connect-zendesk.dto";
import { ConnectIntercomDto } from "./dto/connect-intercom.dto";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";

@Controller("workspaces/:workspaceId/integrations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("support-sync") private readonly syncQueue: Queue
  ) {}

  @Post("zendesk/connect")
  @Roles(Role.ADMIN)
  async connectZendesk(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ConnectZendeskDto
  ) {
    return this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ZENDESK } },
      update: { accessToken: dto.accessToken, subdomain: dto.subdomain },
      create: { workspaceId, provider: IntegrationProvider.ZENDESK, accessToken: dto.accessToken, subdomain: dto.subdomain },
    });
  }

  @Post("intercom/connect")
  @Roles(Role.ADMIN)
  async connectIntercom(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: ConnectIntercomDto
  ) {
    return this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.INTERCOM } },
      update: { accessToken: dto.accessToken },
      create: { workspaceId, provider: IntegrationProvider.INTERCOM, accessToken: dto.accessToken },
    });
  }

  @Post("sync")
  @Roles(Role.ADMIN, Role.EDITOR)
  async sync(@Param("workspaceId") workspaceId: string) {
    const connections = await this.prisma.integrationConnection.findMany({ where: { workspaceId } });
    for (const conn of connections) {
      await this.syncQueue.add({ workspaceId, provider: conn.provider, lastSyncedAt: conn.lastSyncedAt });
    }
    return { message: "Sync jobs started for all active integrations." };
  }
}
