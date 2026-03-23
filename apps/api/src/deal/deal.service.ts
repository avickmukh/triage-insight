import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealDto } from './dto/query-deal.dto';
import { Prisma } from '@prisma/client';
import {
  CUSTOMER_REVENUE_SIGNAL_QUEUE,
  type CustomerRevenueSignalJobPayload,
} from '../customer/processors/customer-revenue-signal.processor';

type DealSortField = 'createdAt' | 'updatedAt' | 'annualValue';

const DEAL_INCLUDE = {
  customer: {
    select: {
      id: true,
      name: true,
      companyName: true,
      segment: true,
      arrValue: true,
      accountPriority: true,
      lifecycleStage: true,
    },
  },
  themeLinks: {
    include: {
      theme: { select: { id: true, title: true, status: true } },
    },
  },
} as const;

@Injectable()
export class DealService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CUSTOMER_REVENUE_SIGNAL_QUEUE)
    private readonly revenueSignalQueue: Queue<CustomerRevenueSignalJobPayload>,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(workspaceId: string, dto: CreateDealDto) {
    const { themeIds, ...dealData } = dto;

    // Verify customer belongs to workspace
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, workspaceId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found in this workspace.`);
    }

    const deal = await this.prisma.deal.create({
      data: {
        workspaceId,
        ...dealData,
        ...(themeIds && themeIds.length > 0 && {
          themeLinks: {
            create: themeIds.map((themeId) => ({ themeId })),
          },
        }),
      },
      include: DEAL_INCLUDE,
    });

    // Enqueue revenue recomputation for each linked theme
    if (themeIds && themeIds.length > 0) {
      for (const themeId of themeIds) {
        await this.revenueSignalQueue
          .add(
            { type: 'RECOMPUTE_THEME_REVENUE', workspaceId, themeId },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, delay: 2000 },
          )
          .catch(() => { /* non-critical */ });
      }
    }

    return deal;
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAll(workspaceId: string, query: QueryDealDto) {
    const {
      search,
      stage,
      status,
      customerId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = query;

    const allowedSort: DealSortField[] = ['createdAt', 'updatedAt', 'annualValue'];
    const resolvedSort: DealSortField = allowedSort.includes(sortBy as DealSortField)
      ? (sortBy as DealSortField)
      : 'createdAt';

    const where: Prisma.DealWhereInput = {
      workspaceId,
      stage,
      status,
      customerId,
      ...(search && {
        title: { contains: search, mode: 'insensitive' },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: DEAL_INCLUDE,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Single deal ───────────────────────────────────────────────────────────

  async findOne(workspaceId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, workspaceId },
      include: DEAL_INCLUDE,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(workspaceId: string, id: string, dto: UpdateDealDto) {
    const existing = await this.findOne(workspaceId, id);

    const { themeIds, ...dealData } = dto;

    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        ...dealData,
        ...(themeIds !== undefined && {
          themeLinks: {
            deleteMany: {},
            create: themeIds.map((themeId) => ({ themeId })),
          },
        }),
      },
      include: DEAL_INCLUDE,
    });

    // Recompute revenue for affected themes when value/stage/status changes
    const valueChanged =
      dto.annualValue !== undefined ||
      dto.stage !== undefined ||
      dto.status !== undefined ||
      dto.influenceWeight !== undefined;

    if (valueChanged) {
      // Collect theme IDs from both old and new links
      const affectedThemeIds = new Set<string>([
        ...existing.themeLinks.map((tl) => tl.theme.id),
        ...(themeIds ?? []),
      ]);
      for (const themeId of affectedThemeIds) {
        await this.revenueSignalQueue
          .add(
            { type: 'RECOMPUTE_THEME_REVENUE', workspaceId, themeId },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, delay: 2000 },
          )
          .catch(() => { /* non-critical */ });
      }
    }

    return deal;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(workspaceId: string, id: string) {
    const deal = await this.findOne(workspaceId, id);
    await this.prisma.deal.delete({ where: { id } });

    // Recompute revenue for previously linked themes
    for (const tl of deal.themeLinks) {
      await this.revenueSignalQueue
        .add(
          { type: 'RECOMPUTE_THEME_REVENUE', workspaceId, themeId: tl.theme.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, delay: 2000 },
        )
        .catch(() => { /* non-critical */ });
    }

    return { success: true };
  }

  // ─── Link / unlink theme ───────────────────────────────────────────────────

  async linkTheme(workspaceId: string, dealId: string, themeId: string) {
    await this.findOne(workspaceId, dealId);

    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException(`Theme ${themeId} not found`);

    await this.prisma.dealThemeLink.upsert({
      where: { dealId_themeId: { dealId, themeId } },
      create: { dealId, themeId },
      update: {},
    });

    // Recompute revenue influence for the newly linked theme
    await this.revenueSignalQueue
      .add(
        { type: 'RECOMPUTE_THEME_REVENUE', workspaceId, themeId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, delay: 1000 },
      )
      .catch(() => { /* non-critical */ });

    return { success: true };
  }

  async unlinkTheme(workspaceId: string, dealId: string, themeId: string) {
    await this.findOne(workspaceId, dealId);

    const existing = await this.prisma.dealThemeLink.findUnique({
      where: { dealId_themeId: { dealId, themeId } },
    });
    if (!existing) throw new BadRequestException('Deal is not linked to this theme');

    await this.prisma.dealThemeLink.delete({
      where: { dealId_themeId: { dealId, themeId } },
    });

    // Recompute revenue influence for the unlinked theme
    await this.revenueSignalQueue
      .add(
        { type: 'RECOMPUTE_THEME_REVENUE', workspaceId, themeId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, delay: 1000 },
      )
      .catch(() => { /* non-critical */ });

    return { success: true };
  }

  // ─── Deals by theme (revenue influence) ───────────────────────────────────

  async findByTheme(workspaceId: string, themeId: string) {
    const theme = await this.prisma.theme.findFirst({ where: { id: themeId, workspaceId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const links = await this.prisma.dealThemeLink.findMany({
      where: { themeId },
      include: {
        deal: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                companyName: true,
                segment: true,
                arrValue: true,
                accountPriority: true,
              },
            },
          },
        },
      },
    });

    const deals = links.map((l) => l.deal);
    const totalInfluence = deals.reduce((sum, d) => sum + d.annualValue, 0);
    const openInfluence = deals
      .filter((d) => d.status === 'OPEN')
      .reduce((sum, d) => sum + d.annualValue, 0);

    // Top requesting customers (from feedback linked to this theme)
    const feedbackLinks = await this.prisma.themeFeedback.findMany({
      where: { themeId },
      select: {
        feedback: {
          select: {
            customerId: true,
            customer: {
              select: {
                id: true,
                name: true,
                companyName: true,
                arrValue: true,
                accountPriority: true,
                lifecycleStage: true,
                churnRisk: true,
              },
            },
          },
        },
      },
    });

    // Aggregate by customer: count feedback + sum ARR
    const customerMap = new Map<
      string,
      {
        id: string;
        name: string;
        companyName: string | null;
        arrValue: number;
        accountPriority: string;
        lifecycleStage: string;
        churnRisk: number | null;
        feedbackCount: number;
      }
    >();

    for (const fl of feedbackLinks) {
      const c = fl.feedback.customer;
      if (!c || !fl.feedback.customerId) continue;
      const existing = customerMap.get(fl.feedback.customerId);
      if (existing) {
        existing.feedbackCount += 1;
      } else {
        customerMap.set(fl.feedback.customerId, {
          id: c.id,
          name: c.name,
          companyName: c.companyName,
          arrValue: c.arrValue ?? 0,
          accountPriority: c.accountPriority,
          lifecycleStage: c.lifecycleStage,
          churnRisk: c.churnRisk,
          feedbackCount: 1,
        });
      }
    }

    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.arrValue - a.arrValue || b.feedbackCount - a.feedbackCount)
      .slice(0, 10);

    return {
      deals,
      totalInfluence,
      openInfluence,
      dealCount: deals.length,
      topCustomers,
      totalCustomerARR: topCustomers.reduce((sum, c) => sum + c.arrValue, 0),
    };
  }
}
