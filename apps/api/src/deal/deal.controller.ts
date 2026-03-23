import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DealService } from './deal.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealDto } from './dto/query-deal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

@Controller('workspaces/:workspaceId/deals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealController {
  constructor(private readonly dealService: DealService) {}

  /**
   * GET /workspaces/:workspaceId/deals
   * Paginated deal list with customer + theme links.
   */
  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() query: QueryDealDto,
  ) {
    return this.dealService.findAll(workspaceId, query);
  }

  /**
   * GET /workspaces/:workspaceId/deals/:id
   */
  @Get(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.dealService.findOne(workspaceId, id);
  }

  /**
   * POST /workspaces/:workspaceId/deals
   * Create a deal. ADMIN / EDITOR only.
   */
  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDealDto,
  ) {
    return this.dealService.create(workspaceId, dto);
  }

  /**
   * PATCH /workspaces/:workspaceId/deals/:id
   */
  @Patch(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.dealService.update(workspaceId, id, dto);
  }

  /**
   * DELETE /workspaces/:workspaceId/deals/:id
   * ADMIN only.
   */
  @Delete(':id')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.dealService.remove(workspaceId, id);
  }

  /**
   * POST /workspaces/:workspaceId/deals/:id/themes/:themeId
   * Link a deal to a theme (creates DealThemeLink).
   */
  @Post(':id/themes/:themeId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  linkTheme(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('themeId') themeId: string,
  ) {
    return this.dealService.linkTheme(workspaceId, id, themeId);
  }

  /**
   * DELETE /workspaces/:workspaceId/deals/:id/themes/:themeId
   * Unlink a deal from a theme.
   */
  @Delete(':id/themes/:themeId')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkTheme(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('themeId') themeId: string,
  ) {
    return this.dealService.unlinkTheme(workspaceId, id, themeId);
  }
}
