import {
  statutoryLeaveCalculation,
  StatutoryLeaveInput,
} from './statutory-leave-calculator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RegisterEvidenceService } from './register-evidence.service';
import { RegisterLibraryService } from './register-library.service';
import { RegisterBuilderService } from './register-builder.service';
import {
  definition,
  RegisterInput,
  registerWorkbook,
} from './register-workbook';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

/** Legal references are role-readable; preparation routes enforce branch and Act scope. */
@Controller({ path: 'payroll/register-library', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'ADMIN',
  'PAYROLL',
  'CRM',
  'CLIENT',
  'BRANCH_DESK',
  'AUDITOR',
  'CONTRACTOR',
  'CCO',
)
export class RegisterLibraryController {
  constructor(
    private readonly library: RegisterLibraryService,
    private readonly builder: RegisterBuilderService,
    private readonly evidence: RegisterEvidenceService,
  ) {}

  @Get('jurisdictions')
  jurisdictions() {
    return this.library.jurisdictions();
  }

  @Get('branch-context')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  branchContext(
    @Query('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.builder.branchContext(branchId, user);
  }

  @Get()
  list(@Query('jurisdiction') jurisdiction = '', @Query('q') query = '') {
    return this.library.list(jurisdiction, query);
  }

  @Get(':id/source')
  source(@Param('id') id: string, @Res() res: Response) {
    const source = this.library.getSource(id);
    return res.download(source.filePath, source.fileName);
  }

  @Get(':id/definition')
  definition(@Param('id') id: string) {
    return definition(id);
  }

  @Get(':id/template')
  async template(@Param('id') id: string, @Res() res: Response) {
    const buffer = await registerWorkbook(id);
    res.type(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.attachment(id + '-blank.xlsx');
    return res.send(buffer);
  }

  @Get(':id/contractors')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  contractors(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.builder.contractors(
      id,
      branchId,
      Number(year),
      Number(month),
      user,
    );
  }

  @Get(':id/prefill')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  prefill(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Query('runId') runId: string,
    @Query('contractorId') contractorId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.builder.prefill(
      id,
      branchId,
      runId,
      Number(year),
      Number(month),
      user,
      contractorId,
    );
  }

  @Get(':id/eligibility')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  async eligibility(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ) {
    const context = await this.builder.context(
      id,
      branchId,
      Number(year),
      Number(month),
      user,
    );
    return {
      eligible: true,
      branchName: context.branch.branchName,
      usage: context.layout.payrollPrefill
        ? 'PAYROLL'
        : context.layout.baseFormNumber === 'IX'
          ? 'ATTENDANCE'
          : context.layout.baseFormNumber === 'EVENT'
            ? 'INCIDENT_RECORD'
            : context.layout.baseFormNumber === 'LEAVE'
              ? 'LEAVE_RECORD'
              : 'EMPLOYEE_MASTER',
    };
  }

  @Get(':id/reuse')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  reuseOptions(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('contractorId') contractorId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.reuseOptions(
      id,
      branchId,
      Number(year),
      Number(month),
      user,
      contractorId,
    );
  }
  @Post(':id/reuse')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  requestReuse(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.requestReuse(id, body, user);
  }
  @Post(':id/reuse/:linkId/approve')
  @Roles('ADMIN', 'PAYROLL')
  approveReuse(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.approveReuse(id, linkId, user);
  }
  @Get(':id/operational-sources')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  sourceList(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.sourceList(
      id,
      branchId,
      Number(year),
      Number(month),
      user,
    );
  }
  @Post(':id/operational-sources')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  saveSource(
    @Param('id') id: string,
    @Body() body: RegisterInput,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.saveSource(id, body, user);
  }
  @Post(':id/operational-sources/:sourceId/approve')
  @Roles('ADMIN', 'PAYROLL')
  approveSource(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.evidence.approveSource(id, sourceId, user);
  }

  @Post(':id/leave-calculation')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  async calculateLeave(
    @Param('id') id: string,
    @Body()
    body: {
      branchId: string;
      month: number;
      year: number;
      ledger: StatutoryLeaveInput;
    },
    @CurrentUser() user: ReqUser,
  ) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException(
        'Enter the branch, period and leave totals',
      );
    const ctx = await this.builder.context(
      id,
      body.branchId,
      body.year,
      body.month,
      user,
    );
    if (
      ctx.form.sourceId !== 'osh' ||
      ctx.layout.baseFormNumber !== 'LEAVE' ||
      body.ledger?.year !== body.year
    )
      throw new BadRequestException(
        'Use this calculation only for the selected Central OSH annual leave record and year',
      );
    return statutoryLeaveCalculation(body.ledger);
  }

  @Post(':id/generate')
  @Roles('ADMIN', 'PAYROLL', 'CRM')
  async generate(
    @Param('id') id: string,
    @Body() body: RegisterInput,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const result = await this.builder.generate(id, body, user);
    res.type(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.attachment(id + '-' + body.year + '-' + body.month + '.xlsx');
    res.setHeader('X-Register-Record-Id', result.recordId);
    return res.send(result.buffer);
  }
}
