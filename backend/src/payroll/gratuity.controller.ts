import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  GratuityCalculatorService,
  GratuityInput,
} from './services/gratuity-calculator.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/gratuity', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN', 'CLIENT')
export class GratuityController {
  constructor(private readonly gratuity: GratuityCalculatorService) {}

  @ApiOperation({ summary: 'Calculate' })
  @Post('calculate')
  @Roles('PAYROLL', 'ADMIN', 'CLIENT')
  calculate(@Body() dto: GratuityInput) {
    return this.gratuity.calculate(dto);
  }
}
