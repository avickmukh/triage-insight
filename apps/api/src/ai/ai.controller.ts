import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';
import { MergeService } from './services/merge.service';
import { MergeFeedbackDto } from './dto/merge-feedback.dto';

interface AuthenticatedRequest {
  user: { sub: string; email: string };
}

@Controller('workspaces/:workspaceId/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly mergeService: MergeService) {}

  @Post('feedback/merge')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  mergeFeedback(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() mergeFeedbackDto: MergeFeedbackDto,
  ) {
    return this.mergeService.mergeFeedback(
      workspaceId,
      req.user.sub,
      mergeFeedbackDto.targetId,
      mergeFeedbackDto.sourceIds,
    );
  }
}
