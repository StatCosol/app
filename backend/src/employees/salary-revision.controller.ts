import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SalaryRevisionService } from './salary-revision.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'employees/salary-revisions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryRevisionController {
  constructor(private readonly service: SalaryRevisionService) {}

  @ApiOperation({ summary: 'Create' })
  @Post()
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user.userId);
  }

  @ApiOperation({ summary: 'List' })
  @Get('employee/:employeeId')
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  list(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Request() req: any,
  ) {
    return this.service.listForEmployee(req.user.clientId, employeeId);
  }

  @ApiOperation({ summary: 'Find One' })
  @Get(':id')
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }
}
