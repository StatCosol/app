import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { TdsCalculatorService } from './services/tds-calculator.service';
import type { TdsResult } from './services/tds-calculator.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/tds', version: '1' })
@Roles('PAYROLL', 'ADMIN', 'CLIENT')
export class TdsController {
  constructor(private readonly tds: TdsCalculatorService) {}

  /** Calculate TDS for a given regime */
  @ApiOperation({ summary: 'Calculate' })
  @Post('calculate')
  calculate(@Body() body: any) {
    if (!body.annualGross || body.annualGross <= 0) {
      throw new BadRequestException(
        'annualGross is required and must be positive',
      );
    }
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
  compare(@Body() body: any) {
    if (!body.annualGross || body.annualGross <= 0) {
      throw new BadRequestException(
        'annualGross is required and must be positive',
      );
    }
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
}
