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

@Controller('api/admin/payroll-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PayrollAssignmentsAdminController {
  constructor(private readonly payroll: PayrollService) {}

  @Get(':clientId')
  getCurrent(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.payroll.getPayrollAssignment(clientId);
  }

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
