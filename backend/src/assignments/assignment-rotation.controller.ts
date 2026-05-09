import { Controller, Post, UseGuards } from '@nestjs/common';
import { AssignmentRotationService } from './assignment-rotation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Assignments')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/assignments-rotation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AssignmentRotationController {
  constructor(private readonly rotation: AssignmentRotationService) {}

  @ApiOperation({ summary: 'Run Rotation' })
  @Post('run')
  async runRotation() {
    return this.rotation.run();
  }
}
