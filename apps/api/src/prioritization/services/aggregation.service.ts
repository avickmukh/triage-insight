import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ThemeData {
  themeId: string;
  requestFrequency: number;
  uniqueCustomerCount: number;
  arrValue: number;
  accountPriorityValue: number;
  dealInfluenceValue: number;
}

@Injectable()
export class AggregationService {
  constructor(private readonly prisma: PrismaService) {}

  async getThemeData(workspaceId: string, themeId: string): Promise<ThemeData> {
    // In a real app, this would query a denormalized table or a data warehouse.
    // For this example, we'll simulate with a simplified query.
    const feedback = await this.prisma.feedback.findMany({
      where: {
        workspaceId,
        themes: { some: { themeId } },
        status: { not: 'MERGED' },
      },
      select: {
        customerId: true,
      },
    });

    const uniqueCustomers = [...new Set(feedback.map((f) => f.customerId).filter(Boolean))];

    // These values would come from a CRM integration (e.g., Salesforce)
    const arrValue = uniqueCustomers.length * 1000; // Fake ARR
    const accountPriorityValue = uniqueCustomers.length * 5; // Fake priority score
    const dealInfluenceValue = feedback.length * 500; // Fake deal value

    return {
      themeId,
      requestFrequency: feedback.length,
      uniqueCustomerCount: uniqueCustomers.length,
      arrValue,
      accountPriorityValue,
      dealInfluenceValue,
    };
  }
}
