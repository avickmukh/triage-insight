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
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../workspace/guards/roles.guard';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceRole } from '@prisma/client';

@Controller('workspaces/:workspaceId/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /**
   * GET /workspaces/:workspaceId/customers/revenue-summary
   * Workspace-level revenue aggregation (total ARR, open deals).
   * All roles may read.
   */
  @Get('revenue-summary')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  getRevenueSummary(@Param('workspaceId') workspaceId: string) {
    return this.customerService.getRevenueSummary(workspaceId);
  }

  /**
   * GET /workspaces/:workspaceId/customers
   * Paginated, filterable customer list with _count.
   */
  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() query: QueryCustomerDto,
  ) {
    return this.customerService.findAll(workspaceId, query);
  }

  /**
   * GET /workspaces/:workspaceId/customers/:id
   * Full customer detail with revenue intelligence, linked feedback, deals, signals, roadmap items.
   */
  @Get(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.customerService.findOne(workspaceId, id);
  }

  /**
   * POST /workspaces/:workspaceId/customers
   * Create a new customer. ADMIN / EDITOR only.
   */
  @Post()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.create(workspaceId, dto);
  }

  /**
   * PATCH /workspaces/:workspaceId/customers/:id
   * Update customer fields. ADMIN / EDITOR only.
   */
  @Patch(':id')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.EDITOR)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(workspaceId, id, dto);
  }

  /**
   * DELETE /workspaces/:workspaceId/customers/:id
   * Remove customer. ADMIN only.
   */
  @Delete(':id')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.customerService.remove(workspaceId, id);
  }
}
