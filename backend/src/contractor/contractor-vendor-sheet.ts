import * as ExcelJS from 'exceljs';
import {
  FORMULA_VARIABLES,
  FormulaNode,
  formulaReferences,
  parseFormula,
} from './contractor-quotation-formula';
import {
  calculateRateCard,
  ContractorRateCard,
  RateComponent,
} from './contractor-rate-card';

/**
 * Reads a contractor's wage breakup exactly as the vendor sent it and turns
 * each quotation in it into a rate card.
 *
 * Vendors lay breakups out either with labels down a column and one column per
 * role (the usual form), or with labels across a header row and one row per
 * role. Their Excel formulas are translated line by line: a reference to
 * another line of the same quotation becomes that line's code, a reference to
 * a rate kept elsewhere (a "%" column) becomes the number itself.
 *
 * Which lines are paid, deducted or billed is read from the vendor's own
 * totals: whatever their Net Pay adds is an earning and whatever it subtracts
 * a deduction; whatever their Total CTC / chargeable rate adds besides
 * earnings is an employer cost or, when named as one, the vendor's fee.
 * Everything else is a working subtotal. The result is recalculated and
 * compared with every figure in the vendor's sheet before anyone imports it.
 */

type Category = RateComponent['category'];
export type WageSkill =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

export interface VendorSheetLine {
  /** Cell in the vendor's sheet, e.g. "C11". */
  cell: string;
  label: string;
  code: string;
  category: Category;
  method: 'FIXED' | 'FORMULA';
  value: number;
  formula?: string;
  prorate: boolean;
  billable?: boolean;
  /** The vendor's own figure for this line. */
  vendorValue: number | null;
  vendorFormula: string | null;
  note?: string;
}

export interface VendorSheetQuotation {
  /** Column letter (or row number) of this quotation in the vendor's sheet. */
  key: string;
  details: Array<{ label: string; value: string }>;
  skillCategory: WageSkill | '';
  designation: string;
  payDays: number;
  /** Read from a "w.e.f" heading, when the sheet has one. */
  effectiveFrom: string | null;
  /** Key of an earlier quotation for the same role and date. */
  duplicateOf?: string;
  components: VendorSheetLine[];
  excluded: Array<{ cell: string; label: string; reason: string }>;
  /** Things CRM should look at before importing. */
  warnings: string[];
  vendorTotals: {
    billing: { label: string; value: number | null } | null;
    netPay: { label: string; value: number | null } | null;
  };
  check: VendorSheetCheck;
}

export interface VendorSheetCheck {
  ok: boolean;
  error?: string;
  billingTotal?: number;
  netPay?: number;
  differences: Array<{
    code: string;
    label: string;
    vendor: number;
    system: number;
  }>;
}

interface Cell {
  row: number;
  col: number;
  address: string;
  text?: string;
  number?: number;
  formula?: string;
  result?: number | null;
}

const MAX_CELLS = 20000;
const AGGREGATE =
  /\b(total|sub\s*-?total|gross|ctc|deductions?|net|salary|remuneration|wages?\s+total)\b/i;
const FEE =
  /service\s*(charge|fee)|management|\bfee\b|profit|margin|overhead|commission/i;

function columnName(col: number) {
  let name = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function columnNumber(name: string) {
  return [...name.toUpperCase()].reduce(
    (n, ch) => n * 26 + ch.charCodeAt(0) - 64,
    0,
  );
}

function readCells(ws: ExcelJS.Worksheet) {
  const cells = new Map<string, Cell>();
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cells.size >= MAX_CELLS) return;
      const entry: Cell = { row: r, col: c, address: cell.address };
      const formula = cell.formula;
      const value = cell.value as unknown;
      if (formula) {
        entry.formula = formula;
        const result = (value as { result?: unknown })?.result;
        entry.result =
          typeof result === 'number' && Number.isFinite(result) ? result : null;
      } else if (typeof value === 'number') entry.number = value;
      else {
        const text = cell.text?.trim();
        if (!text) return;
        const numeric = Number(text.replace(/,/g, ''));
        if (/^-?[\d,]*\.?\d+$/.test(text) && Number.isFinite(numeric))
          entry.number = numeric;
        else entry.text = text.replace(/\s+/g, ' ');
      }
      cells.set(`${r}:${c}`, entry);
    });
  });
  return cells;
}

function slug(label: string) {
  const s = label
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
    .replace(/_+$/, '');
  return /^[A-Z]/.test(s) ? s : 'L_' + (s || 'LINE');
}

function guessSkill(texts: string[]): WageSkill | '' {
  const all = texts.join(' ').toLowerCase();
  if (/highly\s*-?\s*skilled/.test(all)) return 'HIGHLY_SKILLED';
  if (/semi\s*-?\s*skilled/.test(all)) return 'SEMI_SKILLED';
  if (/un\s*-?\s*skilled/.test(all)) return 'UNSKILLED';
  if (/\bskilled\b/.test(all)) return 'SKILLED';
  return '';
}

/** Standard code for a line whose category is known, or null. */
function standardCode(category: Category, label: string): string | null {
  const l = label.toLowerCase();
  if (category === 'EARNING') {
    if (/basic/.test(l)) return 'BASIC_DA';
    if (/dearness|\bvda\b|\bda\b/.test(l)) return 'DA';
    if (/bonus/.test(l)) return 'BONUS';
    if (/leave|encash/.test(l)) return 'LEAVE';
    if (/overtime|\bot\b/.test(l)) return 'OT';
  }
  if (category === 'DEDUCTION') {
    if (/\bpf\b|provident|\bepf\b/.test(l)) return 'PF_EMP';
    if (/\besic?\b/.test(l)) return 'ESI_EMP';
    if (/\bpt\b|professional/.test(l)) return 'PT';
    if (/\blwf\b|welfare/.test(l)) return 'LWF_EMP';
  }
  if (category === 'EMPLOYER_COST' && !/admin/.test(l)) {
    if (/\bpf\b|provident|\bepf\b/.test(l)) return 'PF_ER';
    if (/\besic?\b|medical/.test(l)) return 'ESI_ER';
    if (/\blwf\b|welfare/.test(l)) return 'LWF_ER';
  }
  return null;
}

export function listVendorSheets(workbook: ExcelJS.Workbook) {
  return workbook.worksheets.map((ws) => ws.name);
}

export function readVendorSheet(ws: ExcelJS.Worksheet) {
  const cells = readCells(ws);
  const at = (r: number, c: number) => cells.get(`${r}:${c}`);

  // Labels run down the column (or across the row) with the most distinct text.
  const distinct = (key: (x: Cell) => number) => {
    const sets = new Map<number, Set<string>>();
    for (const x of cells.values())
      if (x.text) {
        const set = sets.get(key(x)) ?? new Set<string>();
        set.add(x.text.toLowerCase());
        sets.set(key(x), set);
      }
    let best = 0,
      size = 0;
    for (const [k, set] of sets)
      if (set.size > size) {
        best = k;
        size = set.size;
      }
    return { index: best, size };
  };
  const byColumn = distinct((x) => x.col),
    byRow = distinct((x) => x.row);
  const vertical = byColumn.size >= byRow.size;
  const labelIndex = vertical ? byColumn.index : byRow.index;
  const lineOf = (x: Cell) => (vertical ? x.row : x.col);
  const quoteOf = (x: Cell) => (vertical ? x.col : x.row);

  const lines = new Map<number, string>();
  for (const x of cells.values())
    if (quoteOf(x) === labelIndex && x.text) lines.set(lineOf(x), x.text);
  if (!lines.size)
    return { orientation: vertical ? 'columns' : 'rows', quotations: [] };

  const counts = new Map<number, { formulas: number; numbers: number }>();
  for (const x of cells.values()) {
    const q = quoteOf(x);
    if (q === labelIndex || !lines.has(lineOf(x))) continue;
    if (!vertical && q < labelIndex) continue;
    const c = counts.get(q) ?? { formulas: 0, numbers: 0 };
    if (x.formula) c.formulas++;
    else if (x.number != null) c.numbers++;
    counts.set(q, c);
  }
  let quoteIndexes = [...counts]
    .filter(([, c]) => c.formulas >= 3)
    .map(([q]) => q);
  // A breakup typed as plain figures still lists one role per column.
  if (!quoteIndexes.length)
    quoteIndexes = [...counts]
      .filter(([, c]) => c.numbers >= 3)
      .map(([q]) => q);
  quoteIndexes.sort((a, b) => a - b);
  const quoteSet = new Set(quoteIndexes);

  // A line's label is the text nearest the figures on the label side; vendors
  // sometimes shift a section's labels a column over (group names beside).
  const first = quoteIndexes[0] ?? labelIndex + 1;
  const labels = new Map<number, { text: string; at: number }>();
  for (const x of cells.values()) {
    const q = quoteOf(x);
    if (
      !x.text ||
      q >= first ||
      quoteSet.has(q) ||
      !/[A-Za-z]{2,}/.test(x.text)
    )
      continue;
    const current = labels.get(lineOf(x));
    if (!current || q > current.at)
      labels.set(lineOf(x), { text: x.text, at: q });
  }
  const labelOf = new Map([...labels].map(([l, v]) => [l, v.text]));

  const quotations = quoteIndexes.map((q) =>
    readQuotation(q, vertical, labelOf, quoteSet, cells),
  );
  // Columns for the same role that differ only by a heading such as Gender
  // name it, so each keeps its own designation.
  const groups = new Map<string, VendorSheetQuotation[]>();
  for (const q of quotations) {
    const id = [q.skillCategory, q.designation, q.effectiveFrom].join('|');
    groups.set(id, [...(groups.get(id) ?? []), q]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const label = group[0].details.find(
      (d) =>
        d.label &&
        new Set(
          group.map(
            (q) => q.details.find((x) => x.label === d.label)?.value ?? '',
          ),
        ).size === group.length,
    )?.label;
    if (label)
      for (const q of group)
        q.designation =
          `${q.designation} - ${q.details.find((x) => x.label === label)!.value}`
            .toUpperCase()
            .slice(0, 120);
  }
  // The same role quoted twice from the same date would collide on import.
  const seen = new Map<string, string>();
  for (const q of quotations) {
    const id = [q.skillCategory, q.designation, q.effectiveFrom].join('|');
    if (seen.has(id)) q.duplicateOf = seen.get(id);
    else seen.set(id, q.key);
  }
  return { orientation: vertical ? 'columns' : 'rows', quotations };
}

/** "w.e.f 01.06.26", "w.e.f Apr-26", "wef 1/6/2026" -> 2026-06-01. */
export function effectiveDateFrom(texts: string[]): string | null {
  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  for (const text of texts) {
    const m = /w\.?\s*e\.?\s*f\.?\s*[:-]?\s*(.+)$/i.exec(text);
    if (!m) continue;
    const s = m[1].trim();
    const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
    const iso = (y: number, mo: number, d: number) => {
      const date = new Date(Date.UTC(y, mo - 1, d));
      return date.getUTCMonth() === mo - 1 && y >= 2000 && y < 2100
        ? date.toISOString().slice(0, 10)
        : null;
    };
    let p = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/.exec(s);
    if (p) {
      const v = iso(year(p[3]), Number(p[2]), Number(p[1]));
      if (v) return v;
    }
    p = /^(\d{1,2})?[\s-]*([A-Za-z]{3,9})[\s'.,-]*(\d{2,4})\b/.exec(s);
    if (p) {
      const mo = months.indexOf(p[2].slice(0, 3).toLowerCase()) + 1;
      if (mo) {
        const v = iso(year(p[3]), mo, Number(p[1] || 1));
        if (v) return v;
      }
    }
  }
  return null;
}

interface Draft {
  line: number;
  cell: string;
  label: string;
  vendorValue: number | null;
  vendorFormula: string | null;
  /** Formula over placeholders __L<line>__, or null for a fixed figure. */
  formula: string | null;
  refs: Set<number>;
  foreign: boolean;
  note?: string;
  tree?: FormulaNode;
}

function readQuotation(
  q: number,
  vertical: boolean,
  labels: Map<number, string>,
  quoteSet: Set<number>,
  cells: Map<string, Cell>,
): VendorSheetQuotation {
  const key = vertical ? columnName(q) : String(q);
  const details: Array<{ label: string; value: string }> = [];
  const drafts = new Map<number, Draft>();
  // Every figure in this role's column (or row) is a line, labelled or not,
  // so no formula ever reads a cached number in place of a live one.
  const own = [...cells.values()]
    .filter((x) => (vertical ? x.col === q : x.row === q))
    .sort((a, b) => (vertical ? a.row - b.row : a.col - b.col));
  for (const x of own) {
    const line = vertical ? x.row : x.col;
    const label =
      labels.get(line) ??
      (vertical ? `Row ${line}` : `Column ${columnName(line)}`);
    if (x.text) {
      if (x.text.length <= 80)
        details.push({ label: labels.get(line) ?? '', value: x.text });
      continue;
    }
    drafts.set(line, {
      line,
      cell: x.address,
      label,
      vendorValue: x.formula ? (x.result ?? null) : (x.number ?? null),
      vendorFormula: x.formula ? '=' + x.formula : null,
      formula: null,
      refs: new Set(),
      foreign: false,
    });
  }

  const resolve = (row: number, col: number): string | null => {
    const line = vertical ? row : col,
      quote = vertical ? col : row;
    const x = cells.get(`${row}:${col}`);
    if (quote === q) {
      if (drafts.has(line)) return `__L${line}__`;
      return x ? null : '0';
    }
    if (quoteSet.has(quote) && x && !x.text) throw new ForeignReference();
    if (!x) return '0';
    if (x.number != null) return String(x.number);
    if (x.formula && x.result != null) return String(x.result);
    return null;
  };

  for (const d of drafts.values()) {
    if (!d.vendorFormula) continue;
    try {
      d.formula = translate(d.vendorFormula.slice(1), resolve);
      d.tree = parseFormula(d.formula);
      for (const name of formulaReferences(d.tree).direct) {
        const m = /^__L(\d+)__$/.exec(name);
        if (m) d.refs.add(Number(m[1]));
      }
    } catch (e) {
      d.formula = null;
      d.tree = undefined;
      d.refs.clear();
      if (e instanceof ForeignReference) {
        d.foreign = true;
        d.note =
          "Uses a figure from another role's column; the vendor's amount is kept as a fixed figure.";
      } else
        d.note =
          "This formula could not be read; the vendor's amount is kept as a fixed figure.";
    }
  }

  // Order lines so each formula follows what it uses (vendors often refer
  // down the sheet, e.g. PF on a derived wage worked out further below).
  const order: number[] = [];
  const state = new Map<number, 1 | 2>();
  const visit = (line: number) => {
    const d = drafts.get(line)!;
    if (state.get(line) === 2) return;
    if (state.get(line) === 1) throw new CircularReference(line);
    state.set(line, 1);
    for (const ref of d.refs) visit(ref);
    state.set(line, 2);
    order.push(line);
  };
  for (const line of [...drafts.keys()].sort((a, b) => a - b)) {
    try {
      visit(line);
    } catch (e) {
      if (!(e instanceof CircularReference)) throw e;
      for (const [l, s] of state) if (s === 1) state.delete(l);
      const d = drafts.get(e.line)!;
      d.formula = null;
      d.refs.clear();
      d.note = 'Circular formula; the vendor amount is kept as a fixed figure.';
      visit(line);
    }
  }

  // A line that calculates with another role's figures (a billing summary
  // multiplying rates by headcount) taints whatever is built on it. A plain
  // copy of the next column's amount ("=C19" for the same uniform) does not.
  const tainted = new Set<number>();
  for (const line of order) {
    const d = drafts.get(line)!;
    if (
      (d.foreign &&
        !/^=\s*\+?\s*\$?[A-Za-z]{1,3}\$?\d+\s*$/.test(d.vendorFormula ?? '')) ||
      [...d.refs].some((r) => tainted.has(r))
    )
      tainted.add(line);
  }

  // Read the vendor's own totals.
  const valued = order
    .map((l) => drafts.get(l)!)
    .filter((d) => !tainted.has(d.line));
  const expand = (line: number, sign: number, into: Map<number, number>) => {
    const d = drafts.get(line);
    if (!d) return;
    const terms = d.tree ? additiveTerms(d.tree) : null;
    const aggregate =
      terms &&
      (terms.length > 1 || AGGREGATE.test(d.label)) &&
      terms.every((t) => t.line != null || t.zero);
    if (!aggregate) {
      into.set(line, (into.get(line) ?? 0) + sign);
      return;
    }
    for (const t of terms)
      if (t.line != null) expand(t.line, sign * t.sign, into);
  };
  const leaves = (line: number) => {
    const into = new Map<number, number>();
    expand(line, 1, into);
    return into.size;
  };
  const net =
    valued
      .filter((d) =>
        /\bnet\s*(pay|in\s*hand|salary|wages?)|\bnetpay\b|take\s*home/i.test(
          d.label,
        ),
      )
      .sort((a, b) => b.line - a.line)[0] ?? null;
  // The billing total is the widest of the vendor's totals: "Total" that adds
  // the service charge to "Total CTC" wins over it, and a deductions "Total"
  // loses to the full rate.
  const bill =
    valued
      .filter((d) =>
        /ctc|chargeable|billing\s*rate|bill\s*rate|^total$|grand\s*total|rate\s*per\s*month|total\s*cost\s*to/i.test(
          d.label,
        ),
      )
      .map((d) => ({ d, n: leaves(d.line) }))
      .sort(
        (a, b) => b.n - a.n || (b.d.vendorValue ?? 0) - (a.d.vendorValue ?? 0),
      )[0]?.d ?? null;
  const gross = net
    ? null
    : (valued
        .filter((d) => /gross/i.test(d.label))
        .sort((a, b) => b.line - a.line)[0] ?? null);
  const netTerms = new Map<number, number>(),
    billTerms = new Map<number, number>();
  if (net) expand(net.line, 1, netTerms);
  else if (gross) expand(gross.line, 1, netTerms);
  if (bill) expand(bill.line, 1, billTerms);

  const category = new Map<number, Category>();
  for (const d of drafts.values()) {
    const n = netTerms.get(d.line) ?? 0,
      b = billTerms.get(d.line) ?? 0;
    category.set(
      d.line,
      n > 0
        ? 'EARNING'
        : n < 0
          ? 'DEDUCTION'
          : b > 0
            ? FEE.test(d.label)
              ? 'BILLING_FEE'
              : 'EMPLOYER_COST'
            : 'SUBTOTAL',
    );
  }

  // Lines that only point at another role's column and feed nothing here.
  const needed = new Set<number>();
  const need = (line: number) => {
    if (needed.has(line)) return;
    needed.add(line);
    for (const r of drafts.get(line)!.refs) need(r);
  };
  for (const d of drafts.values())
    if (category.get(d.line) !== 'SUBTOTAL' || !tainted.has(d.line))
      need(d.line);
  const excluded: VendorSheetQuotation['excluded'] = [];
  for (const d of drafts.values())
    if (!needed.has(d.line)) {
      excluded.push({
        cell: d.cell,
        label: d.label,
        reason: "Uses another role's column and is not part of this quotation",
      });
      drafts.delete(d.line);
    }

  // Codes: standard ones first (earnings before costs), then from labels.
  const codes = new Map<number, string>();
  const used = new Set<string>(FORMULA_VARIABLES as readonly string[]);
  const rank: Category[] = [
    'EARNING',
    'DEDUCTION',
    'EMPLOYER_COST',
    'BILLING_FEE',
    'SUBTOTAL',
  ];
  const ordered = [...drafts.values()].sort(
    (a, b) =>
      rank.indexOf(category.get(a.line)!) -
        rank.indexOf(category.get(b.line)!) || a.line - b.line,
  );
  for (const d of ordered) {
    const std = standardCode(category.get(d.line)!, d.label);
    if (std && !used.has(std)) {
      codes.set(d.line, std);
      used.add(std);
    }
  }
  const warnings: string[] = [];
  if (![...codes.values()].includes('BASIC_DA')) {
    // Payroll needs a Basic + DA earning. When no Basic line feeds the
    // vendor's pay (a gross typed in as a figure), use the largest earning.
    const largest = ordered
      .filter((d) => category.get(d.line) === 'EARNING' && !codes.has(d.line))
      .sort((a, b) => (b.vendorValue ?? 0) - (a.vendorValue ?? 0))[0];
    if (largest) {
      codes.set(largest.line, 'BASIC_DA');
      used.add('BASIC_DA');
      warnings.push(
        `No Basic line feeds the vendor's pay total, so "${largest.label}" is treated as Basic + DA. Check the vendor sheet.`,
      );
    }
  }
  // Payroll reads these codes by name, so a label may not claim one by
  // spelling ("Basic + DA" billed as a cost is not the paid Basic + DA).
  for (const code of [
    'BASIC_DA',
    'DA',
    'BONUS',
    'LEAVE',
    'OT',
    'PF_EMP',
    'ESI_EMP',
    'PT',
    'LWF_EMP',
    'PF_ER',
    'ESI_ER',
    'LWF_ER',
  ])
    used.add(code);
  for (const d of ordered) {
    if (codes.has(d.line)) continue;
    let code = slug(d.label);
    for (let i = 2; used.has(code); i++)
      code = `${slug(d.label).slice(0, 27)}_${i}`;
    codes.set(d.line, code);
    used.add(code);
  }

  // Monthly figures paid by attendance are prorated; lines built on earned
  // amounts already are.
  const varies = new Set<number>();
  const components: VendorSheetLine[] = [];
  for (const line of order) {
    const d = drafts.get(line);
    if (!d) continue;
    const cat = category.get(line)!;
    const fixed = d.formula == null;
    const prorate =
      cat === 'EARNING' && [...d.refs].every((r) => !varies.has(r));
    if (prorate || [...d.refs].some((r) => varies.has(r))) varies.add(line);
    const formula = fixed
      ? undefined
      : d.formula!.replace(/__L(\d+)__/g, (_, l) => codes.get(Number(l))!);
    components.push({
      cell: d.cell,
      label: d.label.slice(0, 120),
      code: codes.get(line)!,
      category: cat,
      method: fixed ? 'FIXED' : 'FORMULA',
      value: fixed ? Math.max(0, d.vendorValue ?? 0) : 0,
      ...(formula ? { formula } : {}),
      prorate,
      ...(cat === 'EARNING' && bill && !((billTerms.get(line) ?? 0) > 0)
        ? { billable: false }
        : {}),
      vendorValue: d.vendorValue,
      vendorFormula: d.vendorFormula,
      ...(d.note ? { note: d.note } : {}),
    });
  }

  const texts = details.map((x) => `${x.label} ${x.value}`);
  const designation =
    details.find((x) =>
      /designation|category\s*name|job\s*title|department|sub\s*components|post|role|position/i.test(
        x.label,
      ),
    )?.value ??
    details.find((x) => !x.label)?.value ??
    '';
  const payLine = components.find(
    (c) =>
      /pay\s*days|salary\s*days|working\s*days|days\s*in\s*(a\s*)?month/i.test(
        c.label,
      ) &&
      c.vendorValue != null &&
      c.vendorValue >= 20 &&
      c.vendorValue <= 31,
  );
  // Headings ("08 hrs / 26 days") are short; commercial notes are long.
  const days = /\b(2[0-9]|3[01])\s*days\b/i;
  const dayText = texts
    .filter((t) => days.test(t))
    .sort((a, b) => a.length - b.length)
    .map((t) => days.exec(t)!)[0];
  const payDays = payLine
    ? Math.round(payLine.vendorValue!)
    : dayText
      ? Number(dayText[1])
      : 26;

  if (!net)
    warnings.push(
      'No Net Pay line: the quotation has no employee deductions, so PF/ESI for workers must be checked.',
    );
  if (!bill)
    warnings.push(
      'No Total CTC or chargeable rate found: billed costs could not be told apart from working figures.',
    );
  const quotation: VendorSheetQuotation = {
    key,
    details: details.slice(0, 12),
    skillCategory: guessSkill(texts),
    designation: designation.toUpperCase().slice(0, 120),
    payDays,
    effectiveFrom: effectiveDateFrom(details.map((x) => x.value)),
    components,
    excluded,
    warnings,
    vendorTotals: {
      billing: bill ? { label: bill.label, value: bill.vendorValue } : null,
      netPay: net ? { label: net.label, value: net.vendorValue } : null,
    },
    check: { ok: false, differences: [] },
  };
  quotation.check = checkVendorQuotation(
    quotation.components,
    payDays,
    quotation.vendorTotals,
  );
  return quotation;
}

class ForeignReference extends Error {}
class CircularReference extends Error {
  constructor(readonly line: number) {
    super('circular');
  }
}

/** Terms of a pure sum/difference of lines, or null for anything else. */
function additiveTerms(
  tree: FormulaNode,
): Array<{ line?: number; sign: number; zero?: boolean }> | null {
  const out: Array<{ line?: number; sign: number; zero?: boolean }> = [];
  const walk = (n: FormulaNode, sign: number): boolean => {
    if (n.t === 'ref') {
      const m = /^__L(\d+)__$/.exec(n.name);
      if (!m) return false;
      out.push({ line: Number(m[1]), sign });
      return true;
    }
    if (n.t === 'num') {
      if (n.v !== 0) return false;
      out.push({ sign, zero: true });
      return true;
    }
    if (n.t === 'neg') return walk(n.a, -sign);
    if (n.t === 'bin' && (n.op === '+' || n.op === '-'))
      return walk(n.a, sign) && walk(n.b, n.op === '-' ? -sign : sign);
    if (n.t === 'call' && n.fn === 'SUM')
      return n.args.every((a) => walk(a, sign));
    return false;
  };
  return walk(tree, 1) ? out : null;
}

/**
 * Rewrites an Excel formula into the quotation formula language: cell and
 * range references go through `resolve` (a line placeholder or a number),
 * TRUE/FALSE become 1/0, and anything else Excel-specific is refused.
 */
export function translate(
  formula: string,
  resolve: (row: number, col: number) => string | null,
): string {
  let out = '';
  let i = 0;
  const ref = /^\$?([A-Za-z]{1,3})\$?(\d+)/;
  while (i < formula.length) {
    const rest = formula.slice(i);
    const ch = formula[i];
    if (ch === '"' || ch === '!' || ch === '[' || ch === '{' || ch === "'")
      throw new Error('Unsupported Excel syntax');
    const a = ref.exec(rest);
    if (a && !/^[A-Za-z0-9_(.]/.test(rest.slice(a[0].length))) {
      let length = a[0].length;
      const from = { col: columnNumber(a[1]), row: Number(a[2]) };
      let to = from;
      const range = rest.slice(length).startsWith(':')
        ? ref.exec(rest.slice(length + 1))
        : null;
      if (range) {
        to = { col: columnNumber(range[1]), row: Number(range[2]) };
        length += 1 + range[0].length;
      }
      const parts: string[] = [];
      const [r1, r2] = [Math.min(from.row, to.row), Math.max(from.row, to.row)];
      const [c1, c2] = [Math.min(from.col, to.col), Math.max(from.col, to.col)];
      if ((r2 - r1 + 1) * (c2 - c1 + 1) > 400)
        throw new Error('Range too large');
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
          const v = resolve(r, c);
          if (v == null) throw new Error('Reference to text');
          parts.push(v);
        }
      out += range ? parts.join(', ') : parts[0];
      i += length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (word) {
      const upper = word[0].toUpperCase();
      out += upper === 'TRUE' ? '1' : upper === 'FALSE' ? '0' : upper;
      i += word[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out.trim();
}

/** Recalculates a quotation for a full month and compares it with the vendor. */
export function checkVendorQuotation(
  components: Array<
    Pick<
      VendorSheetLine,
      | 'code'
      | 'label'
      | 'category'
      | 'method'
      | 'value'
      | 'formula'
      | 'prorate'
      | 'billable'
      | 'vendorValue'
    >
  >,
  payDays: number,
  vendorTotals: VendorSheetQuotation['vendorTotals'],
): VendorSheetCheck {
  const card: ContractorRateCard = {
    divisor: payDays,
    rounding: 'PAISE',
    components: components.map((c) => ({
      code: c.code,
      label: c.label || c.code,
      category: c.category,
      method: c.method,
      value: c.value,
      ...(c.formula ? { formula: c.formula } : {}),
      prorate: c.prorate,
      ...(c.billable === false ? { billable: false } : {}),
    })),
  };
  let result: ReturnType<typeof calculateRateCard>;
  try {
    result = calculateRateCard(card, payDays);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not calculate',
      differences: [],
    };
  }
  const close = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const differences = components
    .filter(
      (c) =>
        c.vendorValue != null &&
        !close(result.amounts[c.code] ?? 0, c.vendorValue),
    )
    .map((c) => ({
      code: c.code,
      label: c.label,
      vendor: Math.round(c.vendorValue! * 100) / 100,
      system: result.amounts[c.code] ?? 0,
    }));
  const billing = vendorTotals.billing?.value,
    net = vendorTotals.netPay?.value;
  return {
    ok:
      !differences.length &&
      (billing == null || close(result.billingTotal, billing)) &&
      (net == null || close(result.netPay, net)),
    billingTotal: result.billingTotal,
    netPay: result.netPay,
    differences,
  };
}
