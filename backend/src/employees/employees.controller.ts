import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeesService } from './employees.service';

// ── Client-facing Employee Controller ───────────────────────
@Controller({ path: 'client/employees', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientEmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const user = req.user;
    const clientId = user.clientId;
    if (!clientId) throw new Error('Client context required');

    // Branch user → forced branchId from their profile
    const branchId = body.branchId || null;
    return this.svc.create(clientId, branchId, body);
  }

  @Get()
  async list(@Req() req: any, @Query() query: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.list(clientId, {
      branchId: query.branchId,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
      search: query.search,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.findById(clientId, id);
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.update(clientId, id, body);
  }

  @Put(':id/deactivate')
  async deactivate(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.deactivate(clientId, id);
  }

  // ── Nominations ──────────────────────────────────────────
  @Post(':id/nominations')
  async createNomination(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    // Verify employee belongs to client
    await this.svc.findById(clientId, id);
    return this.svc.createNomination(id, body);
  }

  @Get(':id/nominations')
  async listNominations(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    await this.svc.findById(clientId, id);
    return this.svc.listNominations(id);
  }

  // ── Form Generation Stub ─────────────────────────────────
  @Post(':id/forms/generate')
  async generateForm(
    @Req() req: any,
    @Param('id') id: string,
    @Query('type') formType: string,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    const emp = await this.svc.findById(clientId, id);

    // Stub: in a full implementation, this would generate a PDF file
    // using the employee data and nomination data
    const fileName = `${formType}_${emp.employeeCode}.pdf`;
    const filePath = `uploads/forms/${clientId}/${fileName}`;

    const form = await this.svc.saveGeneratedForm(
      id,
      formType,
      fileName,
      filePath,
      0,
      req.user.userId,
    );
    return { message: 'Form generation queued', form };
  }

  @Get(':id/forms')
  async listForms(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    await this.svc.findById(clientId, id);
    return this.svc.listGeneratedForms(id);
  }
}
