import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditorObservationsService } from './auditor-observations.service';
import { UpdateObservationDto } from './dto/update-observation.dto';
import { AuditorAssignmentGuard } from '../assignments/auditor-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CacheControl } from '../common/decorators/cache-control.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor/observations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
@Roles('AUDITOR')
export class AuditorObservationsController {
  constructor(private readonly service: AuditorObservationsService) {}

  @ApiOperation({ summary: 'List Categories' })
  @Get('categories')
  @CacheControl(600)
  listCategories() {
    return this.service.listCategories();
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query('auditId') auditId?: string) {
    return this.service.listForAuditor(user, auditId);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(user, id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(
    @CurrentUser() user: ReqUser,
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
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Update' })
  @Put(':id')
  update(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObservationDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete' })
  @Delete(':id')
  delete(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, id);
  }

  @ApiOperation({ summary: 'Verify Closure' })
  @Post(':id/verify')
  verify(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.service.verifyClosure(user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Reopen' })
  @Post(':id/reopen')
  reopen(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.service.reopen(user, id, dto?.remarks);
  }

  @ApiOperation({ summary: 'Export To Pdf' })
  @Get('audit/:auditId/export')
  async exportToPdf(
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    const pdfBuffer = await this.service.exportPdf(user, auditId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="observations-${auditId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
