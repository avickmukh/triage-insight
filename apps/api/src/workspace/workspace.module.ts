
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from './guards/roles.guard';
import { PlanLimitService } from '../billing/plan-limit.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, RolesGuard, PlanLimitService],
  exports: [RolesGuard, PlanLimitService],
})
export class WorkspaceModule {}
