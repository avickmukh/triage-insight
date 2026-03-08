import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { IntegrationProvider } from "@prisma/client";
import { ZendeskService } from "../providers/zendesk.service";
import { IntercomService } from "../providers/intercom.service";
import { SupportProvider } from "../providers/provider.interface";

@Injectable()
export class IntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  async getProviderInstance(workspaceId: string, provider: IntegrationProvider): Promise<SupportProvider> {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });

    if (!connection) {
      throw new NotFoundException(`Integration for ${provider} not found in this workspace.`);
    }

    switch (provider) {
      case IntegrationProvider.ZENDESK:
        return new ZendeskService(connection.accessToken, connection.subdomain ?? "");
      case IntegrationProvider.INTERCOM:
        return new IntercomService(connection.accessToken);
      default:
        throw new Error(`Provider ${String(provider)} not supported.`);
    }
  }
}
