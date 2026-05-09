import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ExcelColumn {
  key: string;
  label: string;
  width?: number;
}

@Injectable()
export class ExcelExportService {
  async generate(
    rows: Record<string, unknown>[],
    columns: ExcelColumn[],
    sheetName = 'Export',
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'StatCompy';
    wb.created = new Date();

    const ws = wb.addWorksheet(sheetName);

    ws.columns = columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: c.width ?? 18,
    }));

    // Style the header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of rows) {
      const values: Record<string, unknown> = {};
      for (const col of columns) {
        values[col.key] = row[col.key] ?? '';
      }
      ws.addRow(values);
    }

    // Auto-filter on the header row
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
