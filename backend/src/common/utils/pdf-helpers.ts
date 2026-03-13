import PDFDocument from 'pdfkit';

/* ──────────────────────────────────────────────────────────────
 * Shared PDF helpers — consistent branding / layout across all
 * generated reports.  All methods mutate `doc` in place and
 * return `void` (except `toBuffer` which collects the stream).
 * ────────────────────────────────────────────────────────────── */

const BRAND = '#0a2656';
const LIGHT = '#f0f4f8';
const TEXT = '#1e293b';
const MUTED = '#64748b';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const RED = '#dc2626';

/** Create a new A4 doc with standard margins */
export function createDoc(
  opts?: ConstructorParameters<typeof PDFDocument>[0],
): typeof PDFDocument.prototype {
  return new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Producer: 'StatComPy', Creator: 'StatComPy Reports' },
    ...opts,
  });
}

/** Convert a PDFDocument stream to a Buffer */
export function toBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on('data', (c: Uint8Array) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/* ──────── Header ──────── */

export function header(doc: any, title: string, subtitle?: string): void {
  doc.fontSize(18).fillColor(BRAND).text(title, { align: 'left' });
  if (subtitle) {
    doc.fontSize(9).fillColor(MUTED).text(subtitle, { align: 'left' });
  }
  doc.moveDown(0.5);
  divider(doc);
  doc.moveDown(0.5);
}

/* ──────── Footer (called once after all pages) ──────── */

export function addPageNumbers(doc: any): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 30;
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `Page ${i + 1} of ${pages.count}  •  Generated ${new Date().toISOString().slice(0, 10)}`,
        40,
        bottom,
        { align: 'center', width: doc.page.width - 80 },
      );
  }
}

/* ──────── Divider ──────── */

export function divider(doc: any): void {
  const y = doc.y;
  doc
    .moveTo(40, y)
    .lineTo(doc.page.width - 40, y)
    .strokeColor('#e2e8f0')
    .lineWidth(0.75)
    .stroke();
}

/* ──────── Section heading ──────── */

export function sectionTitle(doc: any, title: string): void {
  doc.fontSize(12).fillColor(BRAND).text(title).moveDown(0.3);
}

/* ──────── KPI row ──────── */

export function kpiRow(
  doc: any,
  items: { label: string; value: string | number }[],
): void {
  const startX = 40;
  const colWidth = (doc.page.width - 80) / items.length;

  items.forEach((item, i) => {
    const x = startX + colWidth * i;
    doc.fontSize(18).fillColor(BRAND).text(String(item.value), x, doc.y, {
      width: colWidth,
      align: 'center',
      continued: false,
    });
  });

  const labelY = doc.y;
  items.forEach((item, i) => {
    const x = startX + colWidth * i;
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(item.label, x, labelY, { width: colWidth, align: 'center' });
  });

  doc.moveDown(0.8);
}

/* ──────── Simple table ──────── */

export interface TableCol {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export function table(
  doc: any,
  columns: TableCol[],
  rows: Record<string, any>[],
): void {
  const startX = 40;
  const availableWidth = doc.page.width - 80;

  // Auto-calc widths if not provided
  const totalExplicit = columns.reduce((s, c) => s + (c.width || 0), 0);
  const autoCols = columns.filter((c) => !c.width).length;
  const autoWidth =
    autoCols > 0 ? (availableWidth - totalExplicit) / autoCols : 0;

  const widths = columns.map((c) => c.width || autoWidth);

  // Header row
  let x = startX;
  const headerY = doc.y;
  doc.fontSize(7).fillColor(MUTED);

  // Header background
  doc.rect(startX, headerY - 2, availableWidth, 16).fill(LIGHT);

  columns.forEach((col, i) => {
    doc
      .fillColor(MUTED)
      .fontSize(7)
      .text(col.header.toUpperCase(), x + 4, headerY + 2, {
        width: widths[i] - 8,
        align: col.align || 'left',
      });
    x += widths[i];
  });

  doc.y = headerY + 18;

  // Data rows
  rows.forEach((row, ri) => {
    // Page break check
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
    }

    x = startX;
    const rowY = doc.y;

    if (ri % 2 === 1) {
      doc.rect(startX, rowY - 1, availableWidth, 14).fill('#fafbfc');
    }

    columns.forEach((col, i) => {
      const val = row[col.key] ?? '—';
      doc
        .fillColor(TEXT)
        .fontSize(8)
        .text(String(val), x + 4, rowY + 1, {
          width: widths[i] - 8,
          align: col.align || 'left',
        });
      x += widths[i];
    });

    doc.y = rowY + 14;
  });

  doc.moveDown(0.5);
}

/* ──────── Risk badge text ──────── */

export function riskColor(level: string): string {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL':
      return RED;
    case 'HIGH':
      return AMBER;
    case 'MEDIUM':
      return '#eab308';
    default:
      return GREEN;
  }
}

/* ──────── Percentage color ──────── */

export function pctColor(pct: number): string {
  if (pct < 50) return RED;
  if (pct < 70) return AMBER;
  return GREEN;
}
