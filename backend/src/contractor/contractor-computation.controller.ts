import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { makeSafeUploadOptions } from '../common/safe-upload';
import { ReqUser } from '../access/access-scope.service';
import { ContractorComputationService } from './contractor-computation.service';

const excelUploadOptions = makeSafeUploadOptions({
  memory: true,
  maxMb: 10,
  allowedMimes: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

@ApiTags('Contractor Computation')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/contractor-computation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM', 'CEO', 'CCO')
export class CrmContractorComputationController {
  constructor(private readonly svc: ContractorComputationService) {}

  @Get('quotations')
  listQuotations(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listQuotations(user, q);
  }

  @Get('mcd-computations')
  listComputations(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listComputations(user, q);
  }

  @Post('quotations/upload')
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  uploadQuotations(
    @CurrentUser() user: ReqUser,
    @Body()
    dto: {
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
      effectiveFrom?: string;
    },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadQuotationExcel(user, dto, file);
  }
}

@ApiTags('Contractor Computation')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/computation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorComputationController {
  constructor(private readonly svc: ContractorComputationService) {}

  @Get('mcd-computations')
  listComputations(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listComputationsForScope(user, q);
  }

  @Post('mcd/compute')
  computeMcd(@CurrentUser() user: ReqUser, @Body() body: any) {
    return this.svc.computeMcdRows(user, body);
  }

  @Post('attendance/upload')
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  uploadAttendance(
    @CurrentUser() user: ReqUser,
    @Body()
    dto: {
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
      periodMonth?: string;
      uploadId?: string;
    },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadAttendanceExcel(user, dto, file);
  }
}

@ApiTags('Contractor Computation')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/contractor-computation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH', 'BRANCH_DESK', 'AUDITOR', 'ADMIN', 'CRM', 'CEO', 'CCO')
export class ClientContractorComputationController {
  constructor(private readonly svc: ContractorComputationService) {}

  @Get('mcd-computations')
  listComputations(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listComputationsForScope(user, q);
  }
}
