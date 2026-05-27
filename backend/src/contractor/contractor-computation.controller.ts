import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { makeSafeUploadOptions } from '../common/safe-upload';
import { ReqUser } from '../access/access-scope.service';
import { ContractorComputationService } from './contractor-computation.service';
import { ContractorWageSkill } from './entities/contractor-quotation-wage.entity';

const excelUploadOptions = makeSafeUploadOptions({
  memory: true,
  maxMb: 10,
  allowedMimes: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

type QuotationDto = {
  clientId: string;
  contractorUserId: string;
  branchId?: string | null;
  skillCategory: ContractorWageSkill;
  dailyWage: number;
  monthlyWage?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  source?: string | null;
  notes?: string | null;
};

@ApiTags('Contractor Computation')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/contractor-computation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM', 'CEO', 'CCO')
export class CrmContractorComputationController {
  constructor(private readonly svc: ContractorComputationService) {}

  @ApiOperation({ summary: 'List contractor quotation wages' })
  @Get('quotations')
  listQuotations(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listQuotations(user, q);
  }

  @ApiOperation({ summary: 'Create/update contractor quotation wage' })
  @Post('quotations')
  upsertQuotation(@CurrentUser() user: ReqUser, @Body() dto: QuotationDto) {
    return this.svc.upsertQuotation(user, dto);
  }

  @ApiOperation({ summary: 'Upload contractor quotation wages from Excel' })
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

  @ApiOperation({ summary: 'List contractor MCD computation uploads' })
  @Get('mcd-uploads')
  listUploads(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listUploads(user, q);
  }

  @ApiOperation({ summary: 'Get contractor MCD computation upload detail' })
  @Get('mcd-uploads/:id')
  getUpload(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.getUploadDetail(user, id);
  }
}

@ApiTags('Contractor Computation')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/computation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorComputationController {
  constructor(private readonly svc: ContractorComputationService) {}

  @ApiOperation({ summary: 'Upload MCD Excel for contractor computation' })
  @Post('mcd-upload')
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  uploadMcd(
    @CurrentUser() user: ReqUser,
    @Body() dto: { branchId?: string; periodMonth?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadMcdExcel(user, dto, file);
  }

  @ApiOperation({ summary: 'List own MCD computation uploads' })
  @Get('mcd-uploads')
  listUploads(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.listUploads(user, q);
  }

  @ApiOperation({ summary: 'Get own MCD computation upload detail' })
  @Get('mcd-uploads/:id')
  getUpload(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.getUploadDetail(user, id);
  }
}
