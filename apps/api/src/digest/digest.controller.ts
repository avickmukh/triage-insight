import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { DigestService } from './digest.service';

@Controller('workspaces/:workspaceId/digest')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  @Post('generate')
  @Roles(WorkspaceRole.ADMIN)
  async generateDigest(@Param('workspaceId') workspaceId: string) {
    return this.digestService.generateDigest(workspaceId);
  }
}
