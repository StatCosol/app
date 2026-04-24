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
import { AdminMastersService } from './admin-masters.service';
import { CreateComplianceMasterDto } from './dto/create-compliance-master.dto';
import { UpdateComplianceMasterDto } from './dto/update-compliance-master.dto';
import { CreateAuditCategoryDto } from './dto/create-audit-category.dto';
import { UpdateAuditCategoryDto } from './dto/update-audit-category.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import * as ExcelJS from 'exceljs';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/masters', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMastersController {
  constructor(private readonly service: AdminMastersService) {}

  // Compliance Masters CRUD
  @ApiOperation({ summary: 'List Compliance Masters' })
  @Get('compliances')
  listComplianceMasters() {
    return this.service.listComplianceMasters();
  }

  @ApiOperation({ summary: 'Get Compliance Master' })
  @Get('compliances/:id')
  getComplianceMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getComplianceMaster(id);
  }

  @ApiOperation({ summary: 'Create Compliance Master' })
  @Post('compliances')
  createComplianceMaster(@Body() dto: CreateComplianceMasterDto) {
    return this.service.createComplianceMaster(dto);
  }

  @ApiOperation({ summary: 'Update Compliance Master' })
  @Put('compliances/:id')
  updateComplianceMaster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplianceMasterDto,
  ) {
    return this.service.updateComplianceMaster(id, dto);
  }

  @ApiOperation({ summary: 'Delete Compliance Master' })
  @Delete('compliances/:id')
  deleteComplianceMaster(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteComplianceMaster(id);
  }

  @ApiOperation({ summary: 'Download Compliance Masters Excel Template' })
  @Get('compliances/template/download')
  async downloadTemplate(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Compliance Masters');

    sheet.columns = [
      { header: 'Code', key: 'code', width: 22 },
      { header: 'Compliance Name', key: 'complianceName', width: 35 },
      { header: 'Law Name', key: 'lawName', width: 30 },
      { header: 'Law Family', key: 'lawFamily', width: 20 },
      { header: 'State Scope', key: 'stateScope', width: 15 },
      { header: 'Min Headcount', key: 'minHeadcount', width: 15 },
      { header: 'Max Headcount', key: 'maxHeadcount', width: 15 },
      { header: 'Frequency', key: 'frequency', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Description', key: 'description', width: 40 },
    ];

    // Style header row
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    });

    // Add sample rows
    sheet.addRow({
      code: 'PF_PAYMENT',
      complianceName: 'PF Monthly Return',
      lawName: 'Employees Provident Fund Act',
      lawFamily: 'LABOUR_CODE',
      stateScope: 'ALL',
      minHeadcount: 20,
      maxHeadcount: '',
      frequency: 'MONTHLY',
      status: 'Active',
      description: 'Monthly PF return filing',
    });
    sheet.addRow({
      code: 'FACTORY_LICENSE',
      complianceName: 'Factory License Renewal',
      lawName: 'Factories Act 1948',
      lawFamily: 'FACTORY_ACT',
      stateScope: 'TS,KA',
      minHeadcount: 10,
      maxHeadcount: 500,
      frequency: 'YEARLY',
      status: 'Active',
      description: 'Annual factory license renewal',
    });

    // Add a Notes sheet
    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Instructions', key: 'instructions', width: 60 },
    ];
    notesSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
    });
    notesSheet.addRows([
      {
        field: 'Code',
        instructions:
          'Optional but recommended. Stable workflow code such as PF_PAYMENT, ESI_PAYMENT, MCD_UPLOAD, PT_PAYMENT.',
      },
      {
        field: 'Compliance Name',
        instructions: 'Required. The name of the compliance item.',
      },
      {
        field: 'Law Name',
        instructions: 'Required. The governing law or act name.',
      },
      {
        field: 'Law Family',
        instructions:
          'Optional. E.g., FACTORY_ACT, SHOPS_ESTABLISHMENTS, LABOUR_CODE',
      },
      {
        field: 'State Scope',
        instructions:
          'Optional. Comma-separated state codes (e.g., TS,KA) or ALL for central.',
      },
      {
        field: 'Min Headcount',
        instructions: 'Optional. Minimum employee headcount for applicability.',
      },
      {
        field: 'Max Headcount',
        instructions: 'Optional. Maximum employee headcount for applicability.',
      },
      {
        field: 'Frequency',
        instructions:
          'Required. One of: MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY, EVENT',
      },
      {
        field: 'Status',
        instructions: 'Optional. Active or Inactive. Defaults to Active.',
      },
      {
        field: 'Description',
        instructions: 'Optional. Free-text description.',
      },
    ]);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=compliance-masters-template.xlsx',
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  @ApiOperation({ summary: 'Bulk Upload Compliance Masters from Excel' })
  @ApiConsumes('multipart/form-data')
  @Post('compliances/bulk-upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async bulkUploadCompliances(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      throw new BadRequestException('Only .xlsx or .xls files are accepted');
    }
    return this.service.bulkCreateComplianceMasters(file.buffer);
  }

  // Audit Observation Categories CRUD
  @ApiOperation({ summary: 'List Audit Categories' })
  @Get('audit-categories')
  listAuditCategories() {
    return this.service.listAuditCategories();
  }

  @ApiOperation({ summary: 'Create Audit Category' })
  @Post('audit-categories')
  createAuditCategory(@Body() dto: CreateAuditCategoryDto) {
    return this.service.createAuditCategory(dto);
  }

  @ApiOperation({ summary: 'Update Audit Category' })
  @Put('audit-categories/:id')
  updateAuditCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuditCategoryDto,
  ) {
    return this.service.updateAuditCategory(id, dto);
  }

  @ApiOperation({ summary: 'Delete Audit Category' })
  @Delete('audit-categories/:id')
  deleteAuditCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAuditCategory(id);
  }
}
