import { DocumentRow, normalizeHeader } from './document-comparison';

export interface OcrPage {
  page: number;
  text: string;
  tsv: string;
  confidence: number;
}

// Only explicit, single-line column headers are used. Never guess a missing digit.
export function ocrRows(pages: OcrPage[]): DocumentRow[] {
  const fields = new Set([
    'employeeCode',
    'uan',
    'esic',
    'daysWorked',
    'grossWage',
    'pfWage',
    'esiWage',
    'pfDeduction',
    'esiDeduction',
    'netSalary',
    'totalEarnings',
    'overtimeHours',
  ]);
  const rows: DocumentRow[] = [];
  for (const page of pages) {
    const words = page.tsv
      .split('\n')
      .slice(1)
      .map((line) => {
        const c = line.split('\t');
        return {
          level: Number(c[0]),
          x: Number(c[6]),
          y: Number(c[7]),
          w: Number(c[8]),
          h: Number(c[9]),
          text: c.slice(11).join('\t').trim(),
        };
      })
      .filter(
        (w) =>
          w.level === 5 &&
          w.text &&
          [w.x, w.y, w.w, w.h].every(Number.isFinite),
      );
    // OCR line IDs can differ between columns: group by visual vertical position.
    const lines: (typeof words)[] = [];
    for (const word of words.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const line = lines.find(
        (l) =>
          Math.abs(l[0].y - word.y) <=
          Math.max(4, Math.min(l[0].h, word.h) / 2),
      );
      if (line) line.push(word);
      else lines.push([word]);
    }
    let columns: { field: string; x: number }[] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const headers: typeof columns = [];
      for (let i = 0; i < line.length; i++) {
        for (let n = Math.min(3, line.length - i); n > 0; n--) {
          const field = normalizeHeader(
            line
              .slice(i, i + n)
              .map((w) => w.text)
              .join(' '),
          );
          if (fields.has(field)) {
            headers.push({ field, x: line[i].x });
            i += n - 1;
            break;
          }
        }
      }
      if (
        headers.some((c) =>
          ['employeeCode', 'uan', 'esic'].includes(c.field),
        ) &&
        headers.length >= 2
      ) {
        // Duplicate headers make column ownership ambiguous.
        columns =
          new Set(headers.map((c) => c.field)).size === headers.length
            ? headers
            : [];
        continue;
      }
      if (!columns.length) continue;
      const row: DocumentRow = { _page: String(page.page) };
      for (const word of line) {
        const col = [...columns].reverse().find((c) => word.x >= c.x - 12);
        if (col)
          row[col.field] = [row[col.field], word.text]
            .filter(Boolean)
            .join(' ');
      }
      if (row.employeeCode || row.uan || row.esic) rows.push(row);
      if (rows.length > 1000) throw new Error('OCR row limit exceeded');
    }
  }
  return rows;
}
