import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { PayrollReconciliationService } from './payroll-reconciliation.service';

@ApiTags('Payroll reconciliation')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/runs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollReconciliationController {
  constructor(private readonly service: PayrollReconciliationService) {}
  @Post(':runId/reconcile-register')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  compare(
    @CurrentUser() user: ReqUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.compare(user, runId, file);
  }
}
