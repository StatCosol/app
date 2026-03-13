import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollService } from './payroll.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
    @Body() body: { clientId: string; payrollUserId: string },
    @Request() req: any,
  ) {
    return this.payroll.assignPayrollToClient({
      clientId: body.clientId,
      payrollUserId: body.payrollUserId,
      actorUserId: req.user?.userId ?? req.user?.id ?? null,
    });
  }

  @ApiOperation({ summary: 'Unassign' })
  @Delete(':clientId')
  unassign(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Request() req: any,
  ) {
    return this.payroll.unassignPayrollFromClient({
      clientId,
      actorUserId: req.user?.userId ?? req.user?.id ?? null,
    });
  }
}
