import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller({ path: 'assignments/rotation', version: '1' })
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AssignmentsRotationController {
  @Get()
  list() {
    return { status: 'OK', items: [] };
  }
}
