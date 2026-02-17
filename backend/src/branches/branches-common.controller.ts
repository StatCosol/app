import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';

/**
 * Common Branches Controller
 * Provides branch listing endpoints accessible to multiple roles
 */
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesCommonController {
  constructor(
    private readonly service: BranchesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * GET /api/branches
   * List all branches (filtered by user role and assignments)
   *
   * Query params:
   * - clientId (optional): Filter by client
   * - status (optional): Filter by status (ACTIVE, INACTIVE)
   * - search (optional): Search by branch name or code
   * - limit (optional, default 100)
   * - offset (optional, default 0)
   */
  @Get()
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'CLIENT')
  async list(@Query() query: any, @Req() req: any) {
    const limit = parseInt(query.limit) || 100;
    const offset = parseInt(query.offset) || 0;
    const clientId = query.clientId;
    const status = query.status || 'ACTIVE';
    const search = query.search || '';

    // For CLIENT role, filter by their client_id
    const effectiveClientId =
      req.user.roleCode === 'CLIENT' ? req.user.clientId : clientId;

    if (effectiveClientId) {
      const branches = await this.service.findByClient(
        effectiveClientId,
        false,
      );
      return { items: branches, total: branches.length };
    }

    // For other roles, return all branches using raw SQL
    const sql = `
      SELECT 
        b.id,
        b.clientid,
        b.branchname,
        b.branchtype,
        b.statecode,
        b.city,
        b.pincode,
        b.headcount,
        b.status
      FROM client_branches b
      WHERE b.isdeleted = false
        ${status !== 'ALL' ? `AND b.status = $3` : ''}
        ${search ? `AND (b.branchname ILIKE $4)` : ''}
      ORDER BY b.branchname
      LIMIT $1 OFFSET $2
    `;

    const params: any[] = [limit, offset];
    if (status !== 'ALL') params.push(status);
    if (search) params.push(`%${search}%`);

    const branches = await this.dataSource.query(sql, params);
    return { items: branches, total: branches.length };
  }

  /**
   * GET /api/branches/:id
   * Get single branch details
   */
  @Get(':id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'CLIENT')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const branch = await this.service.findById(id, false);

    // For CLIENT role, verify they own this branch
    if (
      req.user.roleCode === 'CLIENT' &&
      branch.clientId !== req.user.clientId
    ) {
      throw new ForbiddenException('You do not have access to this branch');
    }

    return branch;
  }
}
