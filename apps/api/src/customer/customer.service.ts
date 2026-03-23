import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { Prisma } from '@prisma/client';

type CustomerSortField = 'createdAt' | 'updatedAt' | 'arrValue' | 'name';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(workspaceId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { workspaceId, ...dto },
    });
  }

  // ─── List (paginated, filterable) ─────────────────────────────────────────

  async findAll(workspaceId: string, query: QueryCustomerDto) {
    const {
      search,
      segment,
      accountPriority,
      lifecycleStage,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = query;

    const allowedSort: CustomerSortField[] = ['createdAt', 'updatedAt', 'arrValue', 'name'];
    const resolvedSort: CustomerSortField = allowedSort.includes(sortBy as CustomerSortField)
      ? (sortBy as CustomerSortField)
      : 'createdAt';

    const where: Prisma.CustomerWhereInput = {
      workspaceId,
      segment,
      accountPriority,
      lifecycleStage,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { feedbacks: true, deals: true, signals: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Single customer with full intelligence ────────────────────────────────

  async findOne(workspaceId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId },
      include: {
        _count: {
          select: { feedbacks: true, deals: true, signals: true },
        },
        feedbacks: {
          where: { mergedIntoId: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            sourceType: true,
            sentiment: true,
            impactScore: true,
            createdAt: true,
            submittedAt: true,
            themes: {
              select: {
                theme: { select: { id: true, title: true, status: true } },
              },
            },
          },
        },
        deals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            themeLinks: {
              include: {
                theme: { select: { id: true, title: true, status: true } },
              },
            },
          },
        },
        signals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            signalType: true,
            strength: true,
            createdAt: true,
            themeId: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Revenue intelligence summary
    const openDealValue = customer.deals
      .filter((d) => d.status === 'OPEN')
      .reduce((sum, d) => sum + d.annualValue, 0);

    const totalDealValue = customer.deals.reduce((sum, d) => sum + d.annualValue, 0);

    // Unique themes influenced by this customer's feedback
    const influencedThemeIds = new Set<string>();
    for (const fb of customer.feedbacks) {
      for (const tf of fb.themes) {
        influencedThemeIds.add(tf.theme.id);
      }
    }

    // Roadmap items linked to those themes
    const roadmapItems = influencedThemeIds.size > 0
      ? await this.prisma.roadmapItem.findMany({
          where: {
            workspaceId,
            themeId: { in: Array.from(influencedThemeIds) },
          },
          select: {
            id: true,
            title: true,
            status: true,
            priorityScore: true,
            confidenceScore: true,
            isPublic: true,
            targetQuarter: true,
            targetYear: true,
          },
        })
      : [];

    return {
      ...customer,
      revenueIntelligence: {
        arrValue: customer.arrValue ?? 0,
        openDealValue,
        totalDealValue,
        feedbackCount: customer._count.feedbacks,
        dealCount: customer._count.deals,
        signalCount: customer._count.signals,
        influencedThemeCount: influencedThemeIds.size,
        influencedRoadmapCount: roadmapItems.length,
      },
      influencedRoadmapItems: roadmapItems,
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(workspaceId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  // ─── Revenue summary for workspace ────────────────────────────────────────

  async getRevenueSummary(workspaceId: string) {
    const [customers, openDeals] = await this.prisma.$transaction([
      this.prisma.customer.aggregate({
        where: { workspaceId },
        _sum: { arrValue: true },
        _count: { id: true },
      }),
      this.prisma.deal.aggregate({
        where: { workspaceId, status: 'OPEN' },
        _sum: { annualValue: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalCustomers: customers._count.id,
      totalARR: customers._sum.arrValue ?? 0,
      openDealCount: openDeals._count.id,
      openDealValue: openDeals._sum.annualValue ?? 0,
    };
  }
}
