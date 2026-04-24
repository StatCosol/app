import { Workbook } from 'exceljs';

/**
 * Convert an array of JSON objects to an Excel buffer using exceljs.
 * Replaces the legacy `xlsx` package (SheetJS community edition).
 */
export async function jsonToExcelBuffer(
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName);

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((k) => ({ header: k, key: k, width: 20 }));
    for (const row of rows) {
      ws.addRow(row);
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
