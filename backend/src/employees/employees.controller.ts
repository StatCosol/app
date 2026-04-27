import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { UsersService } from '../users/users.service';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateEmployeeNominationDto,
} from './dto/employees.dto';
import * as bcrypt from 'bcryptjs';
import {
  createDoc,
  toBuffer,
  header,
  addPageNumbers,
  sectionTitle,
  table,
} from '../common/utils/pdf-helpers';
import { ClientEntity } from '../clients/entities/client.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

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
    private readonly ds: DataSource,
  ) {}

  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(@CurrentUser() user: ReqUser, @Body() body: CreateEmployeeDto) {
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
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    // Branch user → restrict to allowed branches only
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
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

  @ApiOperation({ summary: 'Export employees to Excel' })
  @Get('export')
  async exportExcel(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      clientId,
    );
    let branchId = query.branchId || undefined;
    if (allowed !== 'ALL') {
      if (branchId && !allowed.includes(branchId))
        return res.json({ data: [] });
      if (!branchId) branchId = allowed.length === 1 ? allowed[0] : undefined;
    }

    const { data } = await this.svc.list(clientId, {
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
      limit: 10000,
      offset: 0,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Employees');

    const headers = [
      'Employee Code',
      'Name',
      'Date of Birth',
      'Gender',
      'Father Name',
      'Phone',
      'Email',
      'Aadhaar',
      'PAN',
      'UAN',
      'ESIC',
      'PF Applicable',
      'ESI Applicable',
      'Bank Name',
      'Bank Account',
      'IFSC',
      'Designation',
      'Department',
      'Date of Joining',
      'Date of Exit',
      'State Code',
      'Status',
      'Approval',
    ];
    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    headerRow.alignment = { horizontal: 'center' };
    ws.columns = headers.map((h) => ({ width: Math.max(h.length + 4, 15) }));

    for (const e of data) {
      ws.addRow([
        e.employeeCode,
        e.name,
        e.dateOfBirth || '',
        e.gender || '',
        e.fatherName || '',
        e.phone || '',
        e.email || '',
        e.aadhaar || '',
        e.pan || '',
        e.uan || '',
        e.esic || '',
        e.pfApplicable ? 'Yes' : 'No',
        e.esiApplicable ? 'Yes' : 'No',
        e.bankName || '',
        e.bankAccount || '',
        e.ifsc || '',
        e.designation || '',
        e.department || '',
        e.dateOfJoining || '',
        e.dateOfExit || '',
        e.stateCode || '',
        e.isActive ? 'Active' : 'Inactive',
        e.approvalStatus || '',
      ]);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=employees.xlsx');
    await wb.xlsx.write(res);
    res.end();
  }

  // ── Bulk Appointment Letters (ZIP) ────────────────────
  @ApiOperation({
    summary: 'Download appointment letters for all employees as ZIP',
  })
  @Get('appointment-letters-bulk')
  async appointmentLettersBulk(
    @CurrentUser() user: ReqUser,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      clientId,
    );
    const filters: any = { isActive: true, limit: 10000, offset: 0 };
    if (allowed !== 'ALL') {
      filters.branchIds = allowed;
    }

    const { data: employees } = await this.svc.list(clientId, filters);
    if (!employees.length)
      throw new NotFoundException('No active employees found');

    const client = await this.ds
      .getRepository(ClientEntity)
      .findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const companyName = client.clientName || 'The Company';
    const isDocx = format === 'docx';
    const ext = isDocx ? 'docx' : 'pdf';

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Appointment_Letters.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    for (const emp of employees) {
      const empName = emp.name || '___________________________';
      const designation = emp.designation || '[Designation]';
      const doj = emp.dateOfJoining || '__________';
      const fileName = `Appointment_Letter_${emp.employeeCode}.${ext}`;

      const clauses = this.getAppointmentClauses(doj);

      if (isDocx) {
        const buf = await this.generateAppointmentDocx(
          companyName,
          empName,
          designation,
          clauses,
        );
        archive.append(buf, { name: fileName });
      } else {
        const buf = await this.generateAppointmentPdf(
          companyName,
          empName,
          designation,
          clauses,
        );
        archive.append(buf, { name: fileName });
      }
    }

    await archive.finalize();
  }

  @ApiOperation({ summary: 'Find One' })
  @Get(':id')
  async findOne(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    // Enforce branch access
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return emp;
  }

  @ApiOperation({ summary: 'Update' })
  @Put(':id')
  async update(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return this.svc.update(clientId, id, body);
  }

  @ApiOperation({ summary: 'Deactivate' })
  @Put(':id/deactivate')
  async deactivate(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: { exitReason?: string; dateOfExit?: string },
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return this.svc.deactivate(clientId, id, body.exitReason, body.dateOfExit);
  }

  @ApiOperation({ summary: 'Hard-delete employee and all related records' })
  @Delete(':id')
  async hardDelete(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    await this.svc.hardDelete(clientId, id);
    return { deleted: true };
  }

  @ApiOperation({ summary: 'Approve' })
  @Put(':id/approve')
  async approve(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    // Only master/client users (non-branch) can approve
    const allowed = await this.branchAccess.getUserBranchIds(user.userId);
    if (allowed.length > 0) {
      throw new BadRequestException(
        'Only client admin users can approve employees',
      );
    }
    return this.svc.approveEmployee(clientId, id);
  }

  @ApiOperation({ summary: 'Reject' })
  @Put(':id/reject')
  async reject(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    // Only master/client users (non-branch) can reject
    const allowed = await this.branchAccess.getUserBranchIds(user.userId);
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
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);

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
    const essUser = await this.usersService.createEssUser({
      userCode,
      roleId: role.id,
      roleCode: 'EMPLOYEE',
      name: emp.name,
      email: emp.email.toLowerCase(),
      passwordHash,
      clientId,
      employeeId: emp.id,
    });

    return {
      message: 'ESS login created successfully',
      userId: essUser.id,
      email: emp.email.toLowerCase(),
      generatedPassword: body.password ? undefined : rawPassword,
    };
  }

  private generateDefaultPassword(emp: {
    name?: string;
    phone?: string | null;
    aadhaar?: string | null;
  }): string {
    // Default: first 4 chars of name (uppercase) + last 4 digits of phone/aadhaar + @123
    const prefix = (emp.name || 'USER').substring(0, 4).toUpperCase();
    const suffix = (emp.phone || emp.aadhaar || '0000').slice(-4);
    return `${prefix}${suffix}@123`;
  }

  // ── Nominations ──────────────────────────────────────────
  @ApiOperation({ summary: 'Create Nomination' })
  @Post(':id/nominations')
  async createNomination(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: CreateEmployeeNominationDto,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return this.svc.createNomination(id, body);
  }

  @ApiOperation({ summary: 'List Nominations' })
  @Get(':id/nominations')
  async listNominations(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return this.svc.listNominations(id);
  }

  // ── Form Generation ─────────────────────────────────
  @ApiOperation({ summary: 'Generate Form' })
  @Post(':id/forms/generate')
  async generateForm(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Query('type') formType: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);

    // Generate actual PDF using employee + nomination data
    const nominations = await this.svc.listNominations(id);
    const typeNominations = (
      nominations as Array<{
        nominationType?: string;
        declarationDate?: string | null;
        status?: string;
        members?: Array<{
          name?: string;
          relationship?: string;
          dateOfBirth?: string;
          sharePct?: number | null;
          address?: string;
        }>;
      }>
    ).filter((n) => n.nominationType === (formType || '').toUpperCase());

    const doc = createDoc();

    header(
      doc,
      `${(formType || 'General').toUpperCase()} Nomination Form`,
      `Employee: ${emp.name} (${emp.employeeCode})`,
    );

    // Employee details section
    sectionTitle(doc, 'Employee Details');
    const empDetails = [
      { label: 'Employee Code', value: emp.employeeCode },
      { label: 'Name', value: emp.name },
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
            nom.members.map((m) => ({
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
      user.userId,
      clientId,
      emp.branchId,
    );
    return { message: 'Form generated successfully', form };
  }

  @ApiOperation({ summary: 'List Forms' })
  @Get(':id/forms')
  async listForms(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId)
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    return this.svc.listGeneratedForms(id);
  }

  // ── Appointment Letter ─────────────────────────────────
  @ApiOperation({ summary: 'Generate Appointment Letter (PDF or Word)' })
  @Get(':id/appointment-letter')
  async appointmentLetter(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    const emp = await this.svc.findById(clientId, id);
    if (emp.branchId) {
      await this.branchAccess.assertBranchAccess(user.userId, emp.branchId);
    }

    const client = await this.ds.getRepository(ClientEntity).findOne({
      where: { id: clientId },
    });
    if (!client) throw new NotFoundException('Client not found');

    const companyName = client.clientName || 'The Company';
    const empName = emp.name || '___________________________';
    const designation = emp.designation || '[Designation]';
    const doj = emp.dateOfJoining || '__________';

    const clauses: { title: string; body: string }[] = [
      {
        title: '1. Date of Joining',
        body: `Your date of joining shall be ${doj}.`,
      },
      {
        title: '2. Place of Posting & Transferability',
        body: `You will be posted at the Company's unit/office. However, your services are transferable to any of the Company's units, branches, or client locations based on business requirements.`,
      },
      {
        title: '3. Nature of Employment',
        body: `Your employment is full-time and will be governed by the rules, policies, and procedures of the Company as amended from time to time.`,
      },
      {
        title: '4. Probation Period',
        body: `You will be on probation for a period of six (6) months from the date of joining. The Company reserves the right to extend the probation period or confirm your services based on performance.`,
      },
      {
        title: '5. Compensation & Benefits',
        body: `Your compensation shall be as mutually agreed and communicated separately. All statutory deductions such as PF, ESI, PT, etc., will be applicable as per law.`,
      },
      {
        title: '6. Working Hours & Shift',
        body: `You shall adhere to the working hours, shifts, and attendance policies of the Company. You may be required to work in rotational shifts, overtime, or extended hours depending on operational requirements.`,
      },
      {
        title: '7. Leave & Holidays',
        body: `You shall be entitled to leave and holidays as per Company policy and applicable labour laws.`,
      },
      {
        title: '8. Code of Conduct & Discipline',
        body: `You are required to maintain discipline, integrity, and follow all Company policies, including workplace behavior, ethics, and compliance standards.`,
      },
      {
        title: '9. Safety & Statutory Compliance',
        body: `You must strictly comply with all safety rules, use of PPE, and operational guidelines as per the Factories Act and applicable safety regulations.`,
      },
      {
        title: '10. Confidentiality & Non-Disclosure (NDA)',
        body: `You shall maintain strict confidentiality of all Company information, including but not limited to business data, client information, processes, and trade secrets. You shall not disclose any such information during or after your employment without prior written consent of the Company.`,
      },
      {
        title: '11. Non-Compete & Conflict of Interest',
        body: `During your employment, you shall not engage in any other business or employment that conflicts with the interests of the Company.`,
      },
      {
        title: '12. Termination of Employment',
        body: `Either party may terminate this employment by giving 30 (thirty) days' notice or salary in lieu thereof. The Company reserves the right to terminate employment without notice in case of misconduct or violation of Company policies.`,
      },
      {
        title: '13. Retirement / Separation',
        body: `Your retirement age and separation conditions shall be as per Company policy and applicable laws.`,
      },
      {
        title: '14. Documents Submission',
        body: `You are required to submit the following documents at the time of joining: Aadhaar Card, PAN Card, Educational Certificates, Bank Account Details, and Passport Size Photographs.`,
      },
      {
        title: '15. Governing Laws & Jurisdiction',
        body: `This appointment shall be governed by applicable labour laws including the Factories Act, PF Act, ESI Act, and other statutory provisions. Jurisdiction shall be as per the location of the Company establishment.`,
      },
    ];

    // ── Word (docx) format ──────────────────────────────────
    if (format === 'docx') {
      const { Document, Packer, Paragraph, TextRun, AlignmentType } =
        await import('docx');

      const SPACING_AFTER = 200;
      const LINE_SPACING = 300;

      const children: any[] = [];

      // Title
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'APPOINTMENT LETTER',
              bold: true,
              size: 28,
              color: '0a2656',
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Date
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `Date: ${new Date().toLocaleDateString('en-IN')}`,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // To
      children.push(
        new Paragraph({
          spacing: { after: 60, line: LINE_SPACING },
          children: [new TextRun({ text: 'To,', size: 22, font: 'Calibri' })],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `Mr./Ms. ${empName}`,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Subject
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `Subject: Appointment as ${designation}`,
              bold: true,
              underline: {},
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Dear
      children.push(
        new Paragraph({
          spacing: { after: 120, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `Dear Mr./Ms. ${empName},`,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Intro
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `We are pleased to appoint you as ${designation} with ${companyName} ("the Company") on the following terms and conditions:`,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Clauses
      for (const clause of clauses) {
        children.push(
          new Paragraph({
            spacing: { after: 60, line: LINE_SPACING },
            children: [
              new TextRun({
                text: clause.title,
                bold: true,
                size: 22,
                color: '0a2656',
                font: 'Calibri',
              }),
            ],
          }),
        );
        children.push(
          new Paragraph({
            spacing: { after: SPACING_AFTER, line: LINE_SPACING },
            children: [
              new TextRun({ text: clause.body, size: 22, font: 'Calibri' }),
            ],
          }),
        );
      }

      // Closing
      children.push(
        new Paragraph({
          spacing: { after: 120, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Kindly sign and return a copy of this letter as a token of your acceptance.',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER * 2, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'We welcome you to the organization and wish you a successful career with us.',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Company signature block
      children.push(
        new Paragraph({
          spacing: { after: 60, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `For ${companyName}`,
              bold: true,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: 80, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Authorized Signatory',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: 60, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Name: __________________',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER * 2, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Designation: _____________',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      // Employee acceptance
      children.push(
        new Paragraph({
          spacing: { after: 120, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Employee Acceptance',
              bold: true,
              size: 22,
              color: '0a2656',
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({
              text: `I, ${empName}, hereby accept the terms and conditions of this appointment.`,
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: 60, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Signature: __________________',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: 0, line: LINE_SPACING },
          children: [
            new TextRun({
              text: 'Date: ______________________',
              size: 22,
              font: 'Calibri',
            }),
          ],
        }),
      );

      const docxDoc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 1440, bottom: 720, left: 720, right: 720 },
              },
            },
            children,
          },
        ],
      });

      const docxBuffer = await Packer.toBuffer(docxDoc);
      const docxFileName = `Appointment_Letter_${emp.employeeCode}.docx`;
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${docxFileName}"`,
        'Content-Length': docxBuffer.length,
      });
      return res.end(docxBuffer);
    }

    // Space reserved for printed/company letterhead
    const LETTERHEAD_TOP = 100;

    const pageOptions = {
      margins: {
        top: 40 + LETTERHEAD_TOP,
        bottom: 40,
        left: 42,
        right: 42,
      },
    };

    const doc = createDoc(pageOptions);

    const TEXT_COLOR = '#1e293b';
    const HEADING_COLOR = '#0a2656';
    const BODY_FONT_SIZE = 10;
    const CLAUSE_TITLE_SIZE = 10;
    const TITLE_SIZE = 13;
    const LINE_GAP = 4;

    const ensureSpace = (requiredHeight: number) => {
      const available = doc.page.height - doc.page.margins.bottom - doc.y;
      if (available < requiredHeight) {
        doc.addPage(pageOptions);
      }
    };

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(TITLE_SIZE)
      .fillColor(HEADING_COLOR)
      .text('APPOINTMENT LETTER', { align: 'center' });

    doc.moveDown(0.8);

    // Date
    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, {
        align: 'left',
        lineGap: LINE_GAP,
      });

    doc.moveDown(0.5);

    // To
    doc.text('To,');
    doc.text(`Mr./Ms. ${empName}`);
    doc.moveDown(0.6);

    // Subject
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .text(`Subject: Appointment as ${designation}`, {
        underline: true,
        lineGap: LINE_GAP,
      });

    doc.font('Helvetica').moveDown(0.5);

    doc.text(`Dear Mr./Ms. ${empName},`, { lineGap: LINE_GAP });

    doc.moveDown(0.4);

    doc.text(
      `We are pleased to appoint you as ${designation} with ${companyName} ("the Company") on the following terms and conditions:`,
      { lineGap: LINE_GAP },
    );

    doc.moveDown(0.6);

    for (const clause of clauses) {
      ensureSpace(42);

      doc
        .font('Helvetica-Bold')
        .fontSize(CLAUSE_TITLE_SIZE)
        .fillColor(HEADING_COLOR)
        .text(clause.title, { lineGap: LINE_GAP });

      doc
        .font('Helvetica')
        .fontSize(BODY_FONT_SIZE)
        .fillColor(TEXT_COLOR)
        .text(clause.body, { lineGap: LINE_GAP });

      doc.moveDown(0.6);
    }

    ensureSpace(100);

    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(
        'Kindly sign and return a copy of this letter as a token of your acceptance.',
        { lineGap: LINE_GAP },
      );

    doc.text(
      'We welcome you to the organization and wish you a successful career with us.',
      { lineGap: LINE_GAP },
    );

    doc.moveDown(1.0);

    // Company signature block
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .text(`For ${companyName}`);

    doc.font('Helvetica').fontSize(BODY_FONT_SIZE).text('Authorized Signatory');

    doc.moveDown(0.4);
    doc.text('Name: __________________');
    doc.text('Designation: _____________');

    doc.moveDown(1.0);

    // Employee acceptance block
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(HEADING_COLOR)
      .text('Employee Acceptance');

    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(
        `I, ${empName}, hereby accept the terms and conditions of this appointment.`,
        { lineGap: LINE_GAP },
      );

    doc.moveDown(0.4);
    doc.text('Signature: __________________');
    doc.text('Date: ______________________');

    addPageNumbers(doc);
    const buffer = await toBuffer(doc);

    const fileName = `Appointment_Letter_${emp.employeeCode}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ── Private helpers for appointment letter generation ──

  private getAppointmentClauses(
    doj: string,
  ): { title: string; body: string }[] {
    return [
      {
        title: '1. Date of Joining',
        body: `Your date of joining shall be ${doj}.`,
      },
      {
        title: '2. Place of Posting & Transferability',
        body: `You will be posted at the Company's unit/office. However, your services are transferable to any of the Company's units, branches, or client locations based on business requirements.`,
      },
      {
        title: '3. Nature of Employment',
        body: `Your employment is full-time and will be governed by the rules, policies, and procedures of the Company as amended from time to time.`,
      },
      {
        title: '4. Probation Period',
        body: `You will be on probation for a period of six (6) months from the date of joining. The Company reserves the right to extend the probation period or confirm your services based on performance.`,
      },
      {
        title: '5. Compensation & Benefits',
        body: `Your compensation shall be as mutually agreed and communicated separately. All statutory deductions such as PF, ESI, PT, etc., will be applicable as per law.`,
      },
      {
        title: '6. Working Hours & Shift',
        body: `You shall adhere to the working hours, shifts, and attendance policies of the Company. You may be required to work in rotational shifts, overtime, or extended hours depending on operational requirements.`,
      },
      {
        title: '7. Leave & Holidays',
        body: `You shall be entitled to leave and holidays as per Company policy and applicable labour laws.`,
      },
      {
        title: '8. Code of Conduct & Discipline',
        body: `You are required to maintain discipline, integrity, and follow all Company policies, including workplace behavior, ethics, and compliance standards.`,
      },
      {
        title: '9. Safety & Statutory Compliance',
        body: `You must strictly comply with all safety rules, use of PPE, and operational guidelines as per the Factories Act and applicable safety regulations.`,
      },
      {
        title: '10. Confidentiality & Non-Disclosure (NDA)',
        body: `You shall maintain strict confidentiality of all Company information, including but not limited to business data, client information, processes, and trade secrets. You shall not disclose any such information during or after your employment without prior written consent of the Company.`,
      },
      {
        title: '11. Non-Compete & Conflict of Interest',
        body: `During your employment, you shall not engage in any other business or employment that conflicts with the interests of the Company.`,
      },
      {
        title: '12. Termination of Employment',
        body: `Either party may terminate this employment by giving 30 (thirty) days' notice or salary in lieu thereof. The Company reserves the right to terminate employment without notice in case of misconduct or violation of Company policies.`,
      },
      {
        title: '13. Retirement / Separation',
        body: `Your retirement age and separation conditions shall be as per Company policy and applicable laws.`,
      },
      {
        title: '14. Documents Submission',
        body: `You are required to submit the following documents at the time of joining: Aadhaar Card, PAN Card, Educational Certificates, Bank Account Details, and Passport Size Photographs.`,
      },
      {
        title: '15. Governing Laws & Jurisdiction',
        body: `This appointment shall be governed by applicable labour laws including the Factories Act, PF Act, ESI Act, and other statutory provisions. Jurisdiction shall be as per the location of the Company establishment.`,
      },
    ];
  }

  private async generateAppointmentPdf(
    companyName: string,
    empName: string,
    designation: string,
    clauses: { title: string; body: string }[],
  ): Promise<Buffer> {
    const LETTERHEAD_TOP = 100;
    const pageOptions = {
      margins: { top: 40 + LETTERHEAD_TOP, bottom: 40, left: 42, right: 42 },
    };
    const doc = createDoc(pageOptions);
    const TEXT_COLOR = '#1e293b';
    const HEADING_COLOR = '#0a2656';
    const BODY_FONT_SIZE = 10;
    const CLAUSE_TITLE_SIZE = 10;
    const TITLE_SIZE = 13;
    const LINE_GAP = 4;

    const ensureSpace = (h: number) => {
      if (doc.page.height - doc.page.margins.bottom - doc.y < h)
        doc.addPage(pageOptions);
    };

    doc
      .font('Helvetica-Bold')
      .fontSize(TITLE_SIZE)
      .fillColor(HEADING_COLOR)
      .text('APPOINTMENT LETTER', { align: 'center' });
    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, {
        align: 'left',
        lineGap: LINE_GAP,
      });
    doc.moveDown(0.5);
    doc.text('To,');
    doc.text(`Mr./Ms. ${empName}`);
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .text(`Subject: Appointment as ${designation}`, {
        underline: true,
        lineGap: LINE_GAP,
      });
    doc.font('Helvetica').moveDown(0.5);
    doc.text(`Dear Mr./Ms. ${empName},`, { lineGap: LINE_GAP });
    doc.moveDown(0.4);
    doc.text(
      `We are pleased to appoint you as ${designation} with ${companyName} ("the Company") on the following terms and conditions:`,
      { lineGap: LINE_GAP },
    );
    doc.moveDown(0.6);

    for (const clause of clauses) {
      ensureSpace(42);
      doc
        .font('Helvetica-Bold')
        .fontSize(CLAUSE_TITLE_SIZE)
        .fillColor(HEADING_COLOR)
        .text(clause.title, { lineGap: LINE_GAP });
      doc
        .font('Helvetica')
        .fontSize(BODY_FONT_SIZE)
        .fillColor(TEXT_COLOR)
        .text(clause.body, { lineGap: LINE_GAP });
      doc.moveDown(0.6);
    }

    ensureSpace(100);
    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(
        'Kindly sign and return a copy of this letter as a token of your acceptance.',
        { lineGap: LINE_GAP },
      )
      .text(
        'We welcome you to the organization and wish you a successful career with us.',
        { lineGap: LINE_GAP },
      );
    doc.moveDown(1.0);
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .text(`For ${companyName}`);
    doc.font('Helvetica').fontSize(BODY_FONT_SIZE).text('Authorized Signatory');
    doc.moveDown(0.4);
    doc.text('Name: __________________');
    doc.text('Designation: _____________');
    doc.moveDown(1.0);
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(HEADING_COLOR)
      .text('Employee Acceptance');
    doc
      .font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(TEXT_COLOR)
      .text(
        `I, ${empName}, hereby accept the terms and conditions of this appointment.`,
        { lineGap: LINE_GAP },
      );
    doc.moveDown(0.4);
    doc.text('Signature: __________________');
    doc.text('Date: ______________________');

    addPageNumbers(doc);
    return toBuffer(doc);
  }

  private async generateAppointmentDocx(
    companyName: string,
    empName: string,
    designation: string,
    clauses: { title: string; body: string }[],
  ): Promise<Buffer> {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } =
      await import('docx');
    const SPACING_AFTER = 200;
    const LINE_SPACING = 300;
    const children: any[] = [];

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'APPOINTMENT LETTER',
            bold: true,
            size: 28,
            color: '0a2656',
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `Date: ${new Date().toLocaleDateString('en-IN')}`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 60, line: LINE_SPACING },
        children: [new TextRun({ text: 'To,', size: 22, font: 'Calibri' })],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `Mr./Ms. ${empName}`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `Subject: Appointment as ${designation}`,
            bold: true,
            underline: {},
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 120, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `Dear Mr./Ms. ${empName},`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `We are pleased to appoint you as ${designation} with ${companyName} ("the Company") on the following terms and conditions:`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );

    for (const clause of clauses) {
      children.push(
        new Paragraph({
          spacing: { after: 60, line: LINE_SPACING },
          children: [
            new TextRun({
              text: clause.title,
              bold: true,
              size: 22,
              color: '0a2656',
              font: 'Calibri',
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          spacing: { after: SPACING_AFTER, line: LINE_SPACING },
          children: [
            new TextRun({ text: clause.body, size: 22, font: 'Calibri' }),
          ],
        }),
      );
    }

    children.push(
      new Paragraph({
        spacing: { after: 120, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Kindly sign and return a copy of this letter as a token of your acceptance.',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER * 2, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'We welcome you to the organization and wish you a successful career with us.',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 60, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `For ${companyName}`,
            bold: true,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 80, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Authorized Signatory',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 60, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Name: __________________',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER * 2, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Designation: _____________',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 120, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Employee Acceptance',
            bold: true,
            size: 22,
            color: '0a2656',
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: SPACING_AFTER, line: LINE_SPACING },
        children: [
          new TextRun({
            text: `I, ${empName}, hereby accept the terms and conditions of this appointment.`,
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 60, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Signature: __________________',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 0, line: LINE_SPACING },
        children: [
          new TextRun({
            text: 'Date: ______________________',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
    );

    const docxDoc = new Document({
      sections: [
        {
          properties: {
            page: { margin: { top: 1440, bottom: 720, left: 720, right: 720 } },
          },
          children,
        },
      ],
    });
    return Buffer.from(await Packer.toBuffer(docxDoc));
  }
}
