import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorRequiredDocumentsService } from './contractor-required-documents.service';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../assignments/crm-assignment.guard';
import { BranchAccessService } from '../auth/branch-access.service';

/* ──────────────────────────── CRM endpoints ──────────────────────────── */

@Controller({ path: 'crm/contractor-required-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, CrmAssignmentGuard)
@Roles('CRM', 'ADMIN', 'CCO', 'CEO')
export class CrmContractorRequiredDocumentsController {
  constructor(private readonly svc: ContractorRequiredDocumentsService) {}

  /** GET /api/crm/contractor-required-documents?clientId=&contractorId=&branchId= */
  @Get()
  @ClientScoped('clientId')
  list(
    @Query('clientId') clientId: string,
    @Query('contractorId') contractorId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.svc.list(clientId, contractorId, branchId);
  }

  /** GET /api/crm/contractor-required-documents/by-client?clientId=&branchId= */
  @Get('by-client')
  @ClientScoped('clientId')
  listByClient(
    @Query('clientId') clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.svc.listByClient(clientId, branchId);
  }

  /** POST /api/crm/contractor-required-documents */
  @Post()
  @ClientScoped('clientId')
  add(
    @Body()
    dto: {
      clientId: string;
      contractorId: string;
      branchId?: string;
      docType: string;
    },
  ) {
    return this.svc.add({
      clientId: dto.clientId,
      contractorUserId: dto.contractorId,
      branchId: dto.branchId,
      docType: dto.docType,
    });
  }

  /** POST /api/crm/contractor-required-documents/bulk */
  @Post('bulk')
  @ClientScoped('clientId')
  addBulk(
    @Body()
    dto: {
      clientId: string;
      contractorId: string;
      docTypes: string[];
      branchId?: string;
    },
  ) {
    return this.svc.addBulk(
      dto.clientId,
      dto.contractorId,
      dto.docTypes,
      dto.branchId,
    );
  }

  /** PATCH /api/crm/contractor-required-documents/:id/toggle?clientId= */
  @Patch(':id/toggle')
  @ClientScoped('clientId')
  toggle(@Param('id') id: string, @Query('clientId') clientId: string) {
    return this.svc.toggle(id, clientId);
  }

  /** DELETE /api/crm/contractor-required-documents/:id?clientId= */
  @Delete(':id')
  @ClientScoped('clientId')
  remove(@Param('id') id: string, @Query('clientId') clientId: string) {
    return this.svc.remove(id, clientId);
  }
}

/* ──────────────────────────── CLIENT endpoints ──────────────────────────── */

@Controller({ path: 'client/contractor-required-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientContractorRequiredDocumentsController {
  constructor(
    private readonly svc: ContractorRequiredDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** GET /api/client/contractor-required-documents?contractorId=&branchId= */
  @Get()
  async list(
    @Req() req: any,
    @Query('contractorId') contractorId: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user.clientId;
    if (branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    return this.svc.list(clientId, contractorId, branchId);
  }

  /** GET /api/client/contractor-required-documents/all?branchId= */
  @Get('all')
  async listAll(@Req() req: any, @Query('branchId') branchId?: string) {
    const clientId = req.user.clientId;
    if (branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    return this.svc.listByClient(clientId, branchId);
  }

  /** POST – CLIENT can also add required doc types */
  @Post()
  async add(
    @Req() req: any,
    @Body() dto: { contractorId: string; branchId?: string; docType: string },
  ) {
    const clientId = req.user.clientId;
    if (dto.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, dto.branchId);
    return this.svc.add({
      clientId,
      contractorUserId: dto.contractorId,
      branchId: dto.branchId,
      docType: dto.docType,
    });
  }

  /** POST bulk */
  @Post('bulk')
  async addBulk(
    @Req() req: any,
    @Body()
    dto: { contractorId: string; docTypes: string[]; branchId?: string },
  ) {
    const clientId = req.user.clientId;
    if (dto.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, dto.branchId);
    return this.svc.addBulk(
      clientId,
      dto.contractorId,
      dto.docTypes,
      dto.branchId,
    );
  }

  /** PATCH toggle */
  @Patch(':id/toggle')
  toggle(@Req() req: any, @Param('id') id: string) {
    return this.svc.toggle(id, req.user.clientId);
  }

  /** DELETE */
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(id, req.user.clientId);
  }
}
