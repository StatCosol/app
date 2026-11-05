import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Workbook } from 'exceljs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { assertSafeFile, makeSafeUploadOptions } from '../common/safe-upload';
import { StatutoryAuditEntryService } from './statutory-audit-entry.service';
import {
  ConfigureAuditEntryDto,
  ReviewAuditEntryDocumentDto,
  SaveAuditEntryDto,
} from './dto/statutory-audit-entry.dto';

@Controller({ path: 'auditor/statutory-audit-entry', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class StatutoryAuditEntryController {
  constructor(private readonly entry: StatutoryAuditEntryService) {}
  @Get('catalogue') catalogue() {
    return this.entry.catalogue();
  }
  @Get('assignments') assignments(@CurrentUser() user: ReqUser) {
    return this.entry.assignments(user);
  }
  @Get(':id') read(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entry.read(user, id);
  }
  @Post(':id/scope') configure(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigureAuditEntryDto,
  ) {
    return this.entry.configure(user, id, dto);
  }
  @Put(':id/points/:itemId') save(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SaveAuditEntryDto,
  ) {
    return this.entry.save(user, id, itemId, dto);
  }
  @Put(':id/documents/:documentId/review') review(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewAuditEntryDocumentDto,
  ) {
    return this.entry.reviewDocument(user, id, documentId, dto);
  }
  @Get(':id/documents/:documentId') async document(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.entry.documentFile(user, id, documentId));
  }
  @Post(':id/points/:itemId/evidence')
  @UseInterceptors(
    FileInterceptor(
      'file',
      makeSafeUploadOptions({
        memory: true,
        maxMb: 5,
        allowedMimes: ['application/pdf', 'image/png', 'image/jpeg'],
      }),
    ),
  )
  upload(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file, true);
    return this.entry.upload(user, id, itemId, file);
  }
  @Get(':id/points/:itemId/evidence')
  async evidence(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId') itemId: string,
    @Res() res: Response,
  ) {
    const file = await this.entry.evidence(user, id, itemId);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
    );
    res.send(file.content);
  }
  @Get(':id/export')
  async export(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('ncOnly') ncOnly: string,
    @Res() res: Response,
  ) {
    const data = await this.entry.read(user, id);
    const wb = new Workbook();
    const ws = wb.addWorksheet('Audit entry');
    ws.addRow([
      'Audit',
      id,
      'Auditee',
      data.session?.auditee_name || '',
      'Mode',
      data.session?.audit_mode || '',
    ]);
    ws.addRow([
      'Scope',
      data.session?.categories.join('; ') || 'Not configured',
    ]);
    ws.addRow([
      'Category',
      'Serial',
      'Head',
      'Statute',
      'Legal provision',
      'Audit parameter',
      'Compliance description',
      'Relevant form',
      'Due date',
      'Compliance check',
      'Status',
      'Remarks',
      'Maximum marks',
      'Marks obtained',
      'Risk',
      'Auditor evidence',
      'Auditee document',
      'Document version',
      'Review status',
      'Review feedback',
    ]);
    for (const item of data.items) {
      const a = data.answers.find((a) => a.item_id === item.id);
      if (ncOnly === 'true' && (a?.status !== 'NON_COMPLIED' || a.stale))
        continue;
      const d = data.documents.find((d) => d.item_id === item.id);
      ws.addRow([
        item.category,
        item.serial,
        item.head,
        item.statute,
        item.legalProvision,
        item.auditParameter,
        item.description,
        item.relevantForm,
        item.dueDate,
        a?.answer || '',
        a?.stale ? 'REVIEW_REQUIRED' : a?.status || 'PENDING',
        a?.remarks || '',
        item.maxMarks,
        a?.stale
          ? null
          : a?.status === 'COMPLIED'
            ? item.maxMarks
            : a?.status === 'NON_COMPLIED'
              ? 0
              : null,
        item.riskType,
        data.evidence.find((e) => e.item_id === item.id)?.filename || '',
        d?.filename || '',
        d?.revision || '',
        d?.review_status || '',
        d?.review_remarks || '',
      ]);
    }
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: 'A3', to: 'T3' };
    ws.getRow(3).font = { bold: true };
    ws.columns.forEach((c) => {
      c.width = 30;
    });
    ws.getColumn(7).width = 75;
    ws.eachRow((row) => {
      row.alignment = { wrapText: true, vertical: 'top' };
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-${id}${ncOnly === 'true' ? '-NC' : ''}.xlsx"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }
}

function sendDocument(
  res: Response,
  file: { filename: string; mime_type: string; content: Buffer },
) {
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
  );
  res.send(file.content);
}

@Controller({ path: 'auditee/statutory-audit-entry', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK', 'CONTRACTOR')
export class AuditeeStatutoryAuditEntryController {
  constructor(private readonly entry: StatutoryAuditEntryService) {}
  @Get() list(@CurrentUser() user: ReqUser) {
    return this.entry.auditeeAssignments(user);
  }
  @Get(':id') read(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.entry.auditeeRead(user, id);
  }
  @Post(':id/points/:itemId/documents')
  @UseInterceptors(
    FileInterceptor('file', makeSafeUploadOptions({ memory: true, maxMb: 10 })),
  )
  upload(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file, true);
    return this.entry.auditeeUpload(user, id, itemId, file);
  }
  @Get(':id/documents/:documentId')
  async download(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    sendDocument(res, await this.entry.documentFile(user, id, documentId));
  }
}
