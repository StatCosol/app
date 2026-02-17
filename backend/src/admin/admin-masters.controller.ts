import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminMastersService } from './admin-masters.service';

@Controller({ path: 'admin/masters', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMastersController {
  constructor(private readonly service: AdminMastersService) {}

  // Compliance Masters CRUD
  @Get('compliances')
  listComplianceMasters() {
    return this.service.listComplianceMasters();
  }

  @Get('compliances/:id')
  getComplianceMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getComplianceMaster(id);
  }

  @Post('compliances')
  createComplianceMaster(@Body() dto: any) {
    return this.service.createComplianceMaster(dto);
  }

  @Put('compliances/:id')
  updateComplianceMaster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.updateComplianceMaster(id, dto);
  }

  @Delete('compliances/:id')
  deleteComplianceMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteComplianceMaster(id);
  }

  // Audit Observation Categories CRUD
  @Get('audit-categories')
  listAuditCategories() {
    return this.service.listAuditCategories();
  }

  @Post('audit-categories')
  createAuditCategory(@Body() dto: { name: string; description?: string }) {
    return this.service.createAuditCategory(dto);
  }

  @Put('audit-categories/:id')
  updateAuditCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.service.updateAuditCategory(id, dto);
  }

  @Delete('audit-categories/:id')
  deleteAuditCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAuditCategory(id);
  }
}
