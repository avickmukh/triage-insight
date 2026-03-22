import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/**
 * BillingModule
 *
 * Registers the BillingController and BillingService.
 * Imports WorkspaceModule to access the exported RolesGuard and PlanLimitService.
 *
 * Note: PlanLimitService is defined in billing/plan-limit.service.ts but
 * registered in WorkspaceModule (to avoid a circular dependency since
 * BillingModule already imports WorkspaceModule).
 */
@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
