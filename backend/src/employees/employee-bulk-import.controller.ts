import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeeBulkImportService } from './employee-bulk-import.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/employees/bulk-import', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'ADMIN', 'CRM')
export class EmployeeBulkImportController {
  constructor(private readonly importSvc: EmployeeBulkImportService) {}

  @ApiOperation({ summary: 'Download Template' })
  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Employee Template');

    const headers = [
      'First Name',
      'Last Name',
      'Date of Birth',
      'Gender',
      'Father Name',
      'Phone',
      'Email',
      'Aadhaar',
      'PAN',
      'UAN',
      'ESIC',
      'PF Applicable',
      'ESI Applicable',
      'Bank Name',
      'Bank Account',
      'IFSC',
      'Designation',
      'Department',
      'Date of Joining',
      'State Code',
    ];

    ws.addRow(headers);

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };
    headerRow.alignment = { horizontal: 'center' };

    // Auto-fit column widths
    ws.columns = headers.map((h) => ({ width: Math.max(h.length + 4, 15) }));

    // Add a sample row
    ws.addRow([
      'John',
      'Doe',
      '1995-06-15',
      'Male',
      'Robert Doe',
      '9876543210',
      'john@example.com',
      '123456789012',
      'ABCDE1234F',
      '',
      '',
      'Yes',
      'Yes',
      'State Bank',
      '12345678901234',
      'SBIN0001234',
      'Engineer',
      'IT',
      '2025-01-15',
      'KA',
    ]);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=employee_import_template.xlsx',
    );
    await wb.xlsx.write(res);
    res.end();
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: path.join(process.cwd(), 'uploads', 'temp'),
        filename: (_req, file, cb) => {
          const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `import_${Date.now()}_${safeName}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls', '.csv'].includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only Excel (.xlsx, .xls) or CSV files are accepted',
            ),
            false,
          );
        }
      },
    }),
  )
  async importEmployees(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!file) throw new BadRequestException('File is required');

    return this.importSvc.importFromExcel(clientId, file.path);
  }
}
