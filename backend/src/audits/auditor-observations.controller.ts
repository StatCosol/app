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
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditorObservationsService } from './auditor-observations.service';

@Controller({ path: 'auditor/observations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorObservationsController {
  constructor(private readonly service: AuditorObservationsService) {}

  @Get('categories')
  listCategories() {
    return this.service.listCategories();
  }

  @Get()
  list(@Req() req: any, @Query('auditId') auditId?: string) {
    return this.service.listForAuditor(req.user, auditId);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(req.user, id);
  }

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

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(req.user, id);
  }

  @Get('audit/:auditId/export')
  exportToPdf(
    @Req() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    // TODO: Implement PDF/PPT export
    return this.service.listForAuditor(req.user, auditId);
  }
}
