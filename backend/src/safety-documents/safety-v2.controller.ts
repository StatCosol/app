import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SafetyRequirementService } from './services/safety-requirement.service';
import { SafetyDocumentsService } from './safety-documents.service';
import { UploadSafetyDocumentDto } from './dto/upload-safety-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Safety Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch', version: ['1', VERSION_NEUTRAL] })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM', 'CLIENT', 'BRANCH')
export class SafetyV2Controller {
  constructor(
    private readonly safetySvc: SafetyRequirementService,
    private readonly safetyDocsSvc: SafetyDocumentsService,
  ) {}

  /** GET /api/v1/branch/:branchId/safety/required */
  @ApiOperation({ summary: 'Get Required' })
  @Get(':branchId/safety/required')
  getRequired(@Param('branchId') branchId: string) {
    return this.safetySvc.getRequired(branchId);
  }

  /** GET /api/v1/branch/:branchId/safety/status */
  @ApiOperation({ summary: 'Get Branch Safety Status' })
  @Get(':branchId/safety/status')
  getStatus(
    @Param('branchId') branchId: string,
    @Query('month') _month?: string,
  ) {
    // Month is accepted for compatibility with existing frontend calls.
    return this.safetySvc.getStatus(branchId);
  }

  /** POST /api/v1/branch/:branchId/safety/upload */
  @ApiOperation({ summary: 'Upload Safety Document (Compatibility Route)' })
  @Post(':branchId/safety/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @Param('branchId') branchId: string,
    @Body() body: any,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    const userId = req?.user?.userId || req?.user?.id;
    const clientId = req?.user?.clientId || null;
    if (!userId || !clientId) {
      throw new BadRequestException('Invalid auth context for upload');
    }

    const docMasterId = Number(body?.docMasterId || body?.masterDocumentId || 0);
    const master = await this.safetySvc.getMasterDocument(docMasterId);

    const dto: UploadSafetyDocumentDto = {
      branchId,
      documentType: String(
        body?.documentType || master?.document_name || `SAFETY_DOC_${docMasterId || 'GENERIC'}`,
      ),
      documentName: String(
        body?.documentName || master?.document_name || `Safety Document ${docMasterId || ''}`.trim(),
      ),
      remarks: body?.remarks ? String(body.remarks) : undefined,
      category: body?.category || master?.category || undefined,
      frequency: body?.frequency || master?.frequency || undefined,
      applicableTo: body?.applicableTo || master?.applicable_to || undefined,
      periodMonth: body?.periodMonth ? Number(body.periodMonth) : undefined,
      periodQuarter: body?.periodQuarter ? Number(body.periodQuarter) : undefined,
      periodYear: body?.periodYear ? Number(body.periodYear) : undefined,
      masterDocumentId: docMasterId > 0 ? docMasterId : undefined,
    };

    return this.safetyDocsSvc.upload(dto, file, String(userId), String(clientId));
  }
}
