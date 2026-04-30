import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SalaryRevisionService } from './salary-revision.service';
import { CreateSalaryRevisionDto } from './dto/employees.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'employees/salary-revisions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryRevisionController {
  constructor(private readonly service: SalaryRevisionService) {}

  @ApiOperation({ summary: 'Create' })
  @Post()
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  create(@Body() dto: CreateSalaryRevisionDto, @CurrentUser() user: ReqUser) {
    dto.clientId = dto.clientId || user.clientId!;
    return this.service.create(dto, user.userId);
  }

  @ApiOperation({ summary: 'List' })
  @Get('employee/:employeeId')
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  list(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.listForEmployee(user.clientId!, employeeId);
  }

  @ApiOperation({ summary: 'Find One' })
  @Get(':id')
  @Roles('CLIENT', 'ADMIN', 'PAYROLL')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }
}
