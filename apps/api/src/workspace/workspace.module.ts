
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, RolesGuard],
  exports: [RolesGuard],
})
export class WorkspaceModule {}
