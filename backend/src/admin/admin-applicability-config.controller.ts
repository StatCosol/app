import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminApplicabilityConfigService } from './admin-applicability-config.service';
import {
  CreateComplianceItemDto,
  UpdateComplianceItemDto,
  CreatePackageDto,
  UpdatePackageDto,
  AddPackageItemDto,
  CreateRuleDto,
  UpdateRuleDto,
  AddPackageRuleDto,
} from './dto/admin-applicability-config.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import * as ExcelJS from 'exceljs';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/applicability-config', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminApplicabilityConfigController {
  constructor(private readonly service: AdminApplicabilityConfigService) {}

  // ── Compliance Items ──
  @Get('compliance-items')
  listComplianceItems() {
    return this.service.listComplianceItems();
  }

  @ApiOperation({ summary: 'Download Compliance Items Excel Template' })
  @Get('compliance-items/template/download')
  async downloadComplianceTemplate(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Compliance Items');

    sheet.columns = [
      { header: 'Code', key: 'code', width: 25 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'State Code', key: 'stateCode', width: 15 },
      { header: 'Frequency', key: 'frequency', width: 18 },
      { header: 'Applies To', key: 'appliesTo', width: 18 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    });

    sheet.addRow({
      code: 'PF_MONTHLY',
      name: 'PF Monthly Return',
      category: 'LABOUR_CODE',
      stateCode: '',
      frequency: 'MONTHLY',
      appliesTo: 'BOTH',
    });
    sheet.addRow({
      code: 'FACTORY_LICENSE',
      name: 'Factory License Renewal',
      category: 'LICENSE',
      stateCode: 'TS',
      frequency: 'ANNUAL',
      appliesTo: 'FACTORY',
    });
    sheet.addRow({
      code: 'ESI_HALF_YEARLY',
      name: 'ESI Half-Yearly Return',
      category: 'LABOUR_CODE',
      stateCode: '',
      frequency: 'HALF_YEARLY',
      appliesTo: 'BOTH',
    });

    const notes = workbook.addWorksheet('Instructions');
    notes.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Instructions', key: 'instructions', width: 70 },
    ];
    notes.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
    });
    notes.addRows([
      {
        field: 'Code',
        instructions:
          'Required. Unique code (e.g. PF_MONTHLY). Must not already exist.',
      },
      {
        field: 'Name',
        instructions: 'Required. Descriptive name of the compliance item.',
      },
      {
        field: 'Category',
        instructions:
          'One of: LABOUR_CODE, STATE_RULE, SAFETY, SPECIAL_ACT, LICENSE, RETURN. Defaults to LABOUR_CODE.',
      },
      {
        field: 'State Code',
        instructions:
          'Optional. 2-letter state code (e.g. MH, TS, KA). Leave blank for central/all-India.',
      },
      {
        field: 'Frequency',
        instructions:
          'One of: MONTHLY, QUARTERLY, HALF_YEARLY, ANNUAL, EVENT_BASED, ON_DEMAND. Defaults to MONTHLY.',
      },
      {
        field: 'Applies To',
        instructions: 'One of: BOTH, FACTORY, ESTABLISHMENT. Defaults to BOTH.',
      },
    ]);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=engine-compliance-items-template.xlsx',
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  @Post('compliance-items')
  createComplianceItem(@Body() dto: CreateComplianceItemDto) {
    return this.service.createComplianceItem(dto);
  }

  @ApiOperation({ summary: 'Bulk Upload Compliance Items from Excel' })
  @ApiConsumes('multipart/form-data')
  @Post('compliance-items/bulk-upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async bulkUploadComplianceItems(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      throw new BadRequestException('Only .xlsx or .xls files are accepted');
    }
    return this.service.bulkCreateComplianceItems(file.buffer);
  }

  @Put('compliance-items/:id')
  updateComplianceItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplianceItemDto,
  ) {
    return this.service.updateComplianceItem(id, dto);
  }

  @Delete('compliance-items/:id')
  deleteComplianceItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteComplianceItem(id);
  }

  // ── Packages ──
  @Get('packages')
  listPackages() {
    return this.service.listPackages();
  }

  @Post('packages')
  createPackage(@Body() dto: CreatePackageDto) {
    return this.service.createPackage(dto);
  }

  @Put('packages/:id')
  updatePackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.service.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  deletePackage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deletePackage(id);
  }

  // ── Package Compliance Items ──
  @Get('packages/:packageId/items')
  listPackageItems(@Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.service.listPackageItems(packageId);
  }

  @Post('packages/:packageId/items')
  addPackageItem(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: AddPackageItemDto,
  ) {
    return this.service.addPackageItem(packageId, dto);
  }

  @Post('packages/:packageId/items/bulk')
  bulkAddPackageItems(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: { complianceIds: string[] },
  ) {
    return this.service.bulkAddPackageItems(packageId, dto.complianceIds);
  }

  @Delete('packages/:packageId/items/:id')
  removePackageItem(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removePackageItem(packageId, id);
  }

  // ── Rules ──
  @Get('rules')
  listRules() {
    return this.service.listRules();
  }

  @Post('rules')
  createRule(@Body() dto: CreateRuleDto) {
    return this.service.createRule(dto);
  }

  @Put('rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.service.updateRule(id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRule(id);
  }

  // ── Package Rules ──
  @Get('packages/:packageId/rules')
  listPackageRules(@Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.service.listPackageRules(packageId);
  }

  @Post('packages/:packageId/rules')
  addPackageRule(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: AddPackageRuleDto,
  ) {
    return this.service.addPackageRule(packageId, dto);
  }

  @Post('packages/:packageId/rules/bulk')
  bulkAddPackageRules(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: { ruleIds: string[] },
  ) {
    return this.service.bulkAddPackageRules(packageId, dto.ruleIds);
  }

  @Delete('packages/:packageId/rules/:id')
  removePackageRule(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removePackageRule(packageId, id);
  }
}
