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
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { UsersService } from '../users/users.service';
import { EmployeesService } from './employees.service';
import * as bcrypt from 'bcryptjs';
import {
  createDoc,
  toBuffer,
  header,
  addPageNumbers,
  sectionTitle,
  table,
} from '../common/utils/pdf-helpers';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ── Client-facing Employee Controller ───────────────────────
@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/employees', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientEmployeesController {
  constructor(
    private readonly svc: EmployeesService,
    private readonly branchAccess: BranchAccessService,
    private readonly usersService: UsersService,
  ) {}

  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const user = req.user;
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    // Branch user → forced branchId; master user → branchId from body
    const allowedBranches = await this.branchAccess.getUserBranchIds(
      user.userId,
    );
    let branchId = body.branchId || null;
    const isBranchUser = allowedBranches.length > 0;
    if (isBranchUser) {
      // Branch user: force to their first branch (or validate the supplied one)
      if (branchId && !allowedBranches.includes(branchId)) {
        throw new BadRequestException('You do not have access to this branch');
      }
      branchId = branchId || allowedBranches[0];
    }
    return this.svc.create(clientId, branchId, body, isBranchUser);
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Req() req: any, @Query() query: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    // Branch user → restrict to allowed branches only
    const allowed = await this.branchAccess.getAllowedBranchIds(
      req.user.userId,
      clientId,
    );
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
      isActive:
        query.isActive === 'true'
          ? true
          : query.isActive === 'false'
            ? false
            : undefined,
      approvalStatus: query.approvalStatus || undefined,
      search: query.search,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  @ApiOperation({ summary: 'Find One' })
  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    // Enforce branch access
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return emp;
  }

  @ApiOperation({ summary: 'Update' })
  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.update(clientId, id, body);
  }

  @ApiOperation({ summary: 'Deactivate' })
  @Put(':id/deactivate')
  async deactivate(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.deactivate(clientId, id);
  }

  @ApiOperation({ summary: 'Approve' })
  @Put(':id/approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    // Only master/client users (non-branch) can approve
    const allowed = await this.branchAccess.getUserBranchIds(req.user.userId);
    if (allowed.length > 0) {
      throw new BadRequestException(
        'Only client admin users can approve employees',
      );
    }
    return this.svc.approveEmployee(clientId, id);
  }

  @ApiOperation({ summary: 'Reject' })
  @Put(':id/reject')
  async reject(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    // Only master/client users (non-branch) can reject
    const allowed = await this.branchAccess.getUserBranchIds(req.user.userId);
    if (allowed.length > 0) {
      throw new BadRequestException(
        'Only client admin users can reject employees',
      );
    }
    return this.svc.rejectEmployee(clientId, id);
  }

  // ── ESS Login Provisioning ─────────────────────────────────
  @ApiOperation({ summary: 'Provision Ess' })
  @Post(':id/provision-ess')
  async provisionEss(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);

    if (!emp.email)
      throw new BadRequestException('Employee must have an email address');
    if (!emp.isActive)
      throw new BadRequestException(
        'Cannot create ESS login for inactive employee',
      );

    // Check if user already exists for this employee
    const existingUser = await this.usersService.findByEmail(emp.email);
    if (existingUser)
      throw new BadRequestException(
        'A user account with this email already exists',
      );

    // Get EMPLOYEE role
    const role = await this.usersService.findRoleByCode('EMPLOYEE');
    if (!role)
      throw new BadRequestException(
        'EMPLOYEE role not found in database. Please run roles migration.',
      );

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
  @ApiOperation({ summary: 'Create Nomination' })
  @Post(':id/nominations')
  async createNomination(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.createNomination(id, body);
  }

  @ApiOperation({ summary: 'List Nominations' })
  @Get(':id/nominations')
  async listNominations(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.listNominations(id);
  }

  // ── Form Generation ─────────────────────────────────
  @ApiOperation({ summary: 'Generate Form' })
  @Post(':id/forms/generate')
  async generateForm(
    @Req() req: any,
    @Param('id') id: string,
    @Query('type') formType: string,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);

    // Generate actual PDF using employee + nomination data
    const nominations = await this.svc.listNominations(id);
    const typeNominations = nominations.filter(
      (n: any) => n.nominationType === (formType || '').toUpperCase(),
    );

    const doc = createDoc();

    header(
      doc,
      `${(formType || 'General').toUpperCase()} Nomination Form`,
      `Employee: ${emp.firstName} ${emp.lastName || ''} (${emp.employeeCode})`,
    );

    // Employee details section
    sectionTitle(doc, 'Employee Details');
    const empDetails = [
      { label: 'Employee Code', value: emp.employeeCode },
      { label: 'Name', value: `${emp.firstName} ${emp.lastName || ''}`.trim() },
      { label: "Father's Name", value: emp.fatherName || '—' },
      { label: 'Date of Birth', value: emp.dateOfBirth || '—' },
      { label: 'Gender', value: emp.gender || '—' },
      { label: 'Date of Joining', value: emp.dateOfJoining || '—' },
      { label: 'Designation', value: emp.designation || '—' },
      { label: 'Department', value: emp.department || '—' },
      { label: 'PAN', value: emp.pan || '—' },
      { label: 'Aadhaar', value: emp.aadhaar || '—' },
      { label: 'UAN', value: emp.uan || '—' },
      { label: 'ESIC No.', value: emp.esic || '—' },
    ];

    table(
      doc,
      [
        { header: 'Field', key: 'label', width: 180 },
        { header: 'Value', key: 'value' },
      ],
      empDetails,
    );

    // Nomination details section
    if (typeNominations.length > 0) {
      sectionTitle(doc, `${(formType || '').toUpperCase()} Nominations`);
      for (const nom of typeNominations) {
        doc
          .fontSize(9)
          .fillColor('#1e293b')
          .text(
            `Declaration Date: ${nom.declarationDate || '—'}   |   Status: ${nom.status}`,
          )
          .moveDown(0.3);

        if (nom.members && nom.members.length > 0) {
          table(
            doc,
            [
              { header: 'Name', key: 'name', width: 140 },
              { header: 'Relation', key: 'relationship', width: 90 },
              { header: 'Date of Birth', key: 'dateOfBirth', width: 90 },
              { header: 'Share %', key: 'sharePct', width: 60, align: 'right' },
              { header: 'Address', key: 'address' },
            ],
            nom.members.map((m: any) => ({
              name: m.name || '—',
              relationship: m.relationship || '—',
              dateOfBirth: m.dateOfBirth || '—',
              sharePct: m.sharePct != null ? `${m.sharePct}%` : '—',
              address: m.address || '—',
            })),
          );
        }
        doc.moveDown(0.5);
      }
    } else {
      sectionTitle(doc, 'Nominations');
      doc
        .fontSize(9)
        .fillColor('#64748b')
        .text('No nominations found for this form type.')
        .moveDown(1);
    }

    // Signature block
    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor('#1e293b')
      .text('______________________________', { align: 'left' })
      .text('Employee Signature & Date', { align: 'left' })
      .moveDown(1)
      .text('______________________________', { align: 'right' })
      .text('Authorized Signatory', { align: 'right' });

    addPageNumbers(doc);
    const buffer = await toBuffer(doc);

    // Write PDF to disk
    const fileName = `${formType}_${emp.employeeCode}.pdf`;
    const dirPath = path.join(process.cwd(), 'uploads', 'forms', clientId);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, buffer);

    const form = await this.svc.saveGeneratedForm(
      id,
      formType,
      fileName,
      `uploads/forms/${clientId}/${fileName}`,
      buffer.length,
      req.user.userId,
    );
    return { message: 'Form generated successfully', form };
  }

  @ApiOperation({ summary: 'List Forms' })
  @Get(':id/forms')
  async listForms(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(req.user.userId, emp.branchId);
    return this.svc.listGeneratedForms(id);
  }
}
