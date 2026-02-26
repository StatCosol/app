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
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { UsersService } from '../users/users.service';
import { EmployeesService } from './employees.service';
import * as bcrypt from 'bcryptjs';

// ── Client-facing Employee Controller ───────────────────────
@Controller({ path: 'client/employees', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientEmployeesController {
  constructor(
    private readonly svc: EmployeesService,
    private readonly branchAccess: BranchAccessService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const user = req.user;
    const clientId = user.clientId;
    if (!clientId) throw new Error('Client context required');

    // Branch user → forced branchId; master user → branchId from body
    const allowedBranches = await this.branchAccess.getUserBranchIds(user.userId);
    let branchId = body.branchId || null;
    if (allowedBranches.length > 0) {
      // Branch user: force to their first branch (or validate the supplied one)
      if (branchId && !allowedBranches.includes(branchId)) {
        throw new BadRequestException('You do not have access to this branch');
      }
      branchId = branchId || allowedBranches[0];
    }
    return this.svc.create(clientId, branchId, body);
  }

  @Get()
  async list(@Req() req: any, @Query() query: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');

    // Branch user → restrict to allowed branches only
    const allowed = await this.branchAccess.getAllowedBranchIds(req.user.userId, clientId);
    let branchId = query.branchId || undefined;
    if (allowed !== 'ALL') {
      // If branchId specified, verify it's allowed
      if (branchId && !allowed.includes(branchId)) {
        return { data: [], total: 0 };
      }
      // If no branchId, restrict to all allowed branches (use first for now; service supports single)
      if (!branchId) branchId = allowed.length === 1 ? allowed[0] : undefined;
    }

    return this.svc.list(clientId, {
      branchId,
      branchIds: allowed !== 'ALL' && !branchId ? allowed : undefined,
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
    const emp = await this.svc.findById(clientId, id);
    // Enforce branch access
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return emp;
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.update(clientId, id, body);
  }

  @Put(':id/deactivate')
  async deactivate(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.deactivate(clientId, id);
  }

  // ── ESS Login Provisioning ─────────────────────────────────
  @Post(':id/provision-ess')
  async provisionEss(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);

    if (!emp.email) throw new BadRequestException('Employee must have an email address');
    if (!emp.isActive) throw new BadRequestException('Cannot create ESS login for inactive employee');

    // Check if user already exists for this employee
    const existingUser = await this.usersService.findByEmail(emp.email);
    if (existingUser) throw new BadRequestException('A user account with this email already exists');

    // Get EMPLOYEE role
    const role = await this.usersService.findRoleByCode('EMPLOYEE');
    if (!role) throw new BadRequestException('EMPLOYEE role not found in database. Please run roles migration.');

    // Generate a password: use provided or default
    const rawPassword = body.password || this.generateDefaultPassword(emp);
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // Build user code
    const userCode = `ESS-${emp.employeeCode}`;

    // Create user record
    const user = await this.usersService.createEssUser({
      userCode,
      roleId: role.id,
      roleCode: 'EMPLOYEE',
      name: `${emp.firstName} ${emp.lastName || ''}`.trim(),
      email: emp.email.toLowerCase(),
      passwordHash,
      clientId,
      employeeId: emp.id,
    });

    return {
      message: 'ESS login created successfully',
      userId: user.id,
      email: emp.email.toLowerCase(),
      generatedPassword: body.password ? undefined : rawPassword,
    };
  }

  private generateDefaultPassword(emp: any): string {
    // Default: first 4 chars of first name (uppercase) + last 4 digits of phone/aadhaar + @123
    const prefix = (emp.firstName || 'USER').substring(0, 4).toUpperCase();
    const suffix = (emp.phone || emp.aadhaar || '0000').slice(-4);
    return `${prefix}${suffix}@123`;
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
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.createNomination(id, body);
  }

  @Get(':id/nominations')
  async listNominations(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
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
