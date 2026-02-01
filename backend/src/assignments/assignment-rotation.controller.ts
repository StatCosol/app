import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { AssignmentRotationService } from './assignment-rotation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/admin/assignments-rotation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AssignmentRotationController {
  constructor(private readonly rotation: AssignmentRotationService) {}

  @Post('run')
  async runRotation() {
    return this.rotation.run();
  }
}
