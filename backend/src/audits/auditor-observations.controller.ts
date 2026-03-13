import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditorObservationsService } from './auditor-observations.service';
import {
  AuditorAssignmentGuard,
  AuditorClientScoped,
} from '../assignments/auditor-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor/observations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
@Roles('AUDITOR')
export class AuditorObservationsController {
  constructor(private readonly service: AuditorObservationsService) {}

  @ApiOperation({ summary: 'List Categories' })
  @Get('categories')
  listCategories() {
    return this.service.listCategories();
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query('auditId') auditId?: string) {
    return this.service.listForAuditor(req.user, auditId);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(req.user, id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(
    @Req() req: any,
    @Body()
    dto: {
      auditId: string;
      categoryId?: string;
      observation: string;
      consequences?: string;
      complianceRequirements?: string;
      elaboration?: string;
      evidenceFilePaths?: string[];
    },
  ) {
    return this.service.create(req.user, dto);
  }

  @ApiOperation({ summary: 'Update' })
  @Put(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @ApiOperation({ summary: 'Delete' })
  @Delete(':id')
  delete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(req.user, id);
  }

  @ApiOperation({ summary: 'Verify Closure' })
  @Post(':id/verify')
  verify(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.service.verifyClosure(req.user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Reopen' })
  @Post(':id/reopen')
  reopen(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.service.reopen(req.user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Export To Pdf' })
  @Get('audit/:auditId/export')
  async exportToPdf(
    @Req() req: any,
    @Res() res: Response,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    const pdfBuffer = await this.service.exportPdf(req.user, auditId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="observations-${auditId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
