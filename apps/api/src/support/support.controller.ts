import { Controller, Get, Query, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../workspace/guards/roles.guard";
import { Roles } from "../workspace/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { TicketService } from "./services/ticket.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("workspaces/:workspaceId/support")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.EDITOR, Role.VIEWER)
export class SupportController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly prisma: PrismaService
  ) {}

  @Get("tickets")
  findAllTickets(
    @Param("workspaceId") workspaceId: string,
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20"
  ) {
    return this.ticketService.findAll(workspaceId, parseInt(page), parseInt(limit));
  }

  @Get("clusters")
  findClusters(@Param("workspaceId") workspaceId: string) {
    return this.prisma.supportIssueCluster.findMany({ where: { workspaceId }, include: { theme: true } });
  }

  @Get("spikes")
  findSpikes(@Param("workspaceId") workspaceId: string) {
    return this.prisma.issueSpikeEvent.findMany({ where: { workspaceId }, include: { cluster: true } });
  }

  @Get("correlations")
  findCorrelations(@Param("workspaceId") workspaceId: string) {
    return this.prisma.supportIssueCluster.findMany({
      where: { workspaceId, themeId: { not: null } },
      include: { theme: true },
    });
  }

  @Get("customer-impact")
  async getCustomerImpact(@Param("workspaceId") workspaceId: string) {
    const clusters = await this.prisma.supportIssueCluster.findMany({ where: { workspaceId } });
    const impact = clusters.map(c => ({ clusterId: c.id, title: c.title, arrExposure: c.arrExposure }));
    return impact;
  }
}
