import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { TdsCalculatorService } from './services/tds-calculator.service';
import { TdsCalculateDto } from './dto/tds-calculate.dto';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/tds', version: '1' })
@Roles('PAYROLL', 'ADMIN', 'CLIENT')
export class TdsController {
  constructor(
    private readonly tds: TdsCalculatorService,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly access: AccessScopeService,
  ) {}

  /** Calculate TDS for a given regime */
  @ApiOperation({ summary: 'Calculate' })
  @Post('calculate')
  calculate(@Body() body: TdsCalculateDto) {
    return this.tds.calculate({
      annualGross: Number(body.annualGross),
      regime: body.regime ?? 'NEW',
      deduction80C: body.deduction80C ? Number(body.deduction80C) : undefined,
      deduction80D: body.deduction80D ? Number(body.deduction80D) : undefined,
      deduction24b: body.deduction24b ? Number(body.deduction24b) : undefined,
      hraExemption: body.hraExemption ? Number(body.hraExemption) : undefined,
      otherDeductions: body.otherDeductions
        ? Number(body.otherDeductions)
        : undefined,
      tdsAlreadyPaid: body.tdsAlreadyPaid
        ? Number(body.tdsAlreadyPaid)
        : undefined,
      remainingMonths: body.remainingMonths
        ? Number(body.remainingMonths)
        : undefined,
    });
  }

  /** Compare both regimes side-by-side */
  @ApiOperation({ summary: 'Compare' })
  @Post('compare')
  compare(@Body() body: TdsCalculateDto) {
    return this.tds.compareBothRegimes({
      annualGross: Number(body.annualGross),
      deduction80C: body.deduction80C ? Number(body.deduction80C) : undefined,
      deduction80D: body.deduction80D ? Number(body.deduction80D) : undefined,
      deduction24b: body.deduction24b ? Number(body.deduction24b) : undefined,
      hraExemption: body.hraExemption ? Number(body.hraExemption) : undefined,
      otherDeductions: body.otherDeductions
        ? Number(body.otherDeductions)
        : undefined,
      tdsAlreadyPaid: body.tdsAlreadyPaid
        ? Number(body.tdsAlreadyPaid)
        : undefined,
      remainingMonths: body.remainingMonths
        ? Number(body.remainingMonths)
        : undefined,
    });
  }

  /** List employees whose payslip will show TDS (annual gross > ₹12,75,000 under New Regime). */
  @ApiOperation({ summary: 'List employees with TDS on payslip' })
  @ApiQuery({ name: 'clientId', required: false })
  @Get('eligible-employees')
  async eligible(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
  ) {
    // The client filter was applied only when one was passed, so leaving it
    // off returned every company's employees with CTC and monthly gross — and
    // CLIENT is allowed here. The caller's scope now decides.
    const scope = await this.access.getScope(user);
    const where: any = { isActive: true };
    if (scope.level === 'all') {
      if (clientId) where.clientId = clientId;
    } else if (scope.level === 'clients') {
      const allowed = scope.clientIds ?? [];
      if (clientId && !allowed.includes(clientId)) return this.none();
      where.clientId = clientId ?? In(allowed.length ? allowed : ['']);
    } else {
      where.clientId = scope.clientId;
      if (scope.level === 'branches')
        where.branchId = In(scope.branchIds?.length ? scope.branchIds : ['']);
    }
    const emps = await this.empRepo.find({
      where,
      select: ['id', 'employeeCode', 'name', 'clientId', 'ctc', 'monthlyGross'],
    });

    const rows: any[] = [];
    for (const e of emps) {
      const ctc = Number(e.ctc) || 0;
      const mg = Number(e.monthlyGross) || 0;
      // Prefer monthly_gross × 12 (most reliably populated), fall back to CTC.
      const annualGross = mg > 0 ? mg * 12 : ctc > 0 ? ctc : 0;
      if (annualGross <= 0) continue;
      const r = this.tds.calculate({
        annualGross,
        regime: 'NEW',
        remainingMonths: 12,
      });
      if (r.monthlyTds > 0) {
        rows.push({
          employeeId: e.id,
          employeeCode: e.employeeCode,
          name: e.name,
          clientId: e.clientId,
          ctcAnnual: ctc || null,
          monthlyGross: mg || null,
          annualBasis: annualGross,
          monthlyTds: r.monthlyTds,
          annualTax: r.totalTaxLiability,
        });
      }
    }
    rows.sort((a, b) => b.monthlyTds - a.monthlyTds);
    return this.summary(emps.length, rows);
  }

  private none() {
    return this.summary(0, []);
  }

  private summary(scanned: number, rows: any[]) {
    return {
      rule: 'New Regime FY 2025-26: std deduction ₹75,000; full 87A rebate up to taxable ₹12,00,000',
      threshold: 'Annual gross > ₹12,75,000',
      totalEmployeesScanned: scanned,
      tdsEligibleCount: rows.length,
      employees: rows,
    };
  }
}
