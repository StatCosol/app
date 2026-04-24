import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollService } from './payroll.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

class AssignPayrollDto {
  @IsUUID() clientId: string;
  @IsUUID() payrollUserId: string;
}

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/payroll-assignments', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PayrollAssignmentsAdminController {
  constructor(private readonly payroll: PayrollService) {}

  @ApiOperation({ summary: 'Get Current' })
  @Get(':clientId')
  getCurrent(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.payroll.getPayrollAssignment(clientId);
  }

  @ApiOperation({ summary: 'Assign' })
  @Post()
  assign(
    @Body() body: AssignPayrollDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.payroll.assignPayrollToClient({
      clientId: body.clientId,
      payrollUserId: body.payrollUserId,
      actorUserId: user?.userId ?? user?.id ?? null,
    });
  }

  @ApiOperation({ summary: 'Unassign' })
  @Delete(':clientId')
  unassign(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.payroll.unassignPayrollFromClient({
      clientId,
      actorUserId: user?.userId ?? user?.id ?? null,
    });
  }
}
