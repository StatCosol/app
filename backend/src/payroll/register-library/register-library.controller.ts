import {
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
  ) {}

  @Get('jurisdictions')
  jurisdictions() {
    return this.library.jurisdictions();
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
