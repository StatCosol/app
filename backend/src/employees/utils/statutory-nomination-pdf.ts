/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Statutory Nomination PDF renderers.
 *
 * Layouts follow the official statutory formats:
 *  - GRATUITY → Form 'F' (Payment of Gratuity (Central) Rules, Sub-rule (1) of Rule 6)
 *  - PF       → Form 2 (Revised) — EPF Scheme 1952, Para 33 & 61(1) and EPS 1995, Para 18
 *  - ESI / INSURANCE / SALARY → Generic statutory-style nomination layout
 *
 * The renderers paint directly onto the PDFKit document using absolute
 * positioning so the printed form mirrors the official template (no DB
 * cell shading, banded rows, etc.).
 */

import {
  addPageNumbers,
  createDoc,
  toBuffer,
} from '../../common/utils/pdf-helpers';

const TEXT = '#111111';
const MUTED = '#444444';
const LINE = '#000000';

export interface NomineeRow {
  name?: string;
  memberName?: string;
  relationship?: string;
  dateOfBirth?: string;
  age?: string | number;
  sharePct?: number | null;
  address?: string;
  isMinor?: boolean;
  guardianName?: string;
  guardianRelationship?: string;
  guardianAddress?: string;
}

export interface NominationRecord {
  nominationType?: string;
  declarationDate?: string | null;
  status?: string;
  witnessName?: string | null;
  witnessAddress?: string | null;
  members?: NomineeRow[];
}

export interface EmployeeForForm {
  name?: string;
  employeeCode?: string;
  fatherName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  dateOfJoining?: string | null;
  designation?: string | null;
  department?: string | null;
  uan?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
}

/* ───────────────────────── helpers ───────────────────────── */

function dottedLine(
  doc: any,
  x: number,
  y: number,
  width: number,
  label?: string,
): void {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(0.5)
    .strokeColor(LINE)
    .dash(1, { space: 2 })
    .stroke()
    .undash();
  if (label) {
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(label, x, y + 2, { width });
  }
}

function fieldLine(
  doc: any,
  label: string,
  value: string | undefined | null,
  width = 480,
): void {
  const startY = doc.y;
  doc.fontSize(10).fillColor(TEXT).text(label, { continued: false });
  const v = (value ?? '').toString();
  const lineY = doc.y;
  if (v) {
    doc.fontSize(10).fillColor(TEXT).text(v, doc.page.margins.left, lineY, {
      width,
    });
  } else {
    dottedLine(
      doc,
      doc.page.margins.left,
      lineY + 8,
      width - doc.page.margins.left,
    );
    doc.moveDown(0.6);
  }
  void startY;
}

function pageBreakIfNeeded(doc: any, needed = 80): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawNomineeTable(
  doc: any,
  cols: { header: string; width: number; key: keyof NomineeRow | 'sno' }[],
  rows: NomineeRow[],
  minRows = 3,
): void {
  const startX = doc.page.margins.left;
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  const headerH = 28;
  const rowH = 26;

  pageBreakIfNeeded(doc, headerH + Math.max(rows.length, minRows) * rowH + 20);
  const top = doc.y;

  // Header
  doc.rect(startX, top, totalWidth, headerH).strokeColor(LINE).lineWidth(0.7).stroke();
  let cx = startX;
  cols.forEach((c) => {
    doc
      .fontSize(8)
      .fillColor(TEXT)
      .text(c.header, cx + 3, top + 4, {
        width: c.width - 6,
        align: 'center',
      });
    if (cx > startX) {
      doc
        .moveTo(cx, top)
        .lineTo(cx, top + headerH)
        .stroke();
    }
    cx += c.width;
  });
  // Final right border
  doc.moveTo(startX + totalWidth, top).lineTo(startX + totalWidth, top + headerH).stroke();

  // Column-number row beneath header (e.g., (1)(2)(3))
  const numY = top + headerH - 12;
  cx = startX;
  cols.forEach((c, i) => {
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(`(${i + 1})`, cx, numY, { width: c.width, align: 'center' });
    cx += c.width;
  });

  // Body rows
  const bodyTop = top + headerH;
  const totalRows = Math.max(rows.length, minRows);
  for (let r = 0; r < totalRows; r++) {
    const rowY = bodyTop + r * rowH;
    doc.rect(startX, rowY, totalWidth, rowH).stroke();
    cx = startX;
    cols.forEach((c, ci) => {
      if (ci > 0) {
        doc.moveTo(cx, rowY).lineTo(cx, rowY + rowH).stroke();
      }
      const row = rows[r];
      let val = '';
      if (row) {
        if (c.key === 'sno') val = `${r + 1}.`;
        else {
          const v = row[c.key as keyof NomineeRow];
          if (c.key === 'sharePct' && v != null) val = `${v}%`;
          else if (c.key === 'name')
            val = row.memberName || row.name || '';
          else val = v == null ? '' : String(v);
        }
      } else {
        if (c.key === 'sno') val = `${r + 1}.`;
      }
      doc
        .fontSize(8)
        .fillColor(TEXT)
        .text(val, cx + 3, rowY + 8, {
          width: c.width - 6,
          align: c.key === 'sno' ? 'center' : 'left',
        });
      cx += c.width;
    });
  }

  doc.y = bodyTop + totalRows * rowH + 8;
}

function signatureBlock(doc: any): void {
  pageBreakIfNeeded(doc, 70);
  doc.moveDown(1.2);
  const y = doc.y;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.fontSize(10).fillColor(TEXT).text('Place: ____________________', left, y);
  doc.text('Signature/Thumb-impression of the Employee', right - 240, y, {
    width: 240,
    align: 'right',
  });
  doc.moveDown(1);
  doc.text('Date:  ____________________', left, doc.y);
  doc.moveDown(1.2);
}

function witnessBlock(
  doc: any,
  witnessName?: string | null,
  witnessAddress?: string | null,
): void {
  pageBreakIfNeeded(doc, 110);
  doc.moveDown(0.8);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Declaration by Witnesses', { underline: true })
    .moveDown(0.3);

  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text('Nomination signed/thumb-impressed before me.')
    .moveDown(0.3);

  doc.fontSize(9).fillColor(TEXT);
  doc.text('Name in full and full address of witnesses', {
    continued: true,
    width: 280,
  });
  doc.text('             Signature of Witnesses');

  const w1 = witnessName ? `1. ${witnessName}${witnessAddress ? ', ' + witnessAddress : ''}` : '1.';
  doc.moveDown(0.5).text(w1);
  dottedLine(doc, doc.page.margins.left, doc.y + 4, 480);
  doc.moveDown(0.8);
  doc.text('2.');
  dottedLine(doc, doc.page.margins.left, doc.y + 4, 480);
  doc.moveDown(0.8);

  doc.text('Place: ____________________');
  doc.text('Date:  ____________________');
}

function employerCertificate(doc: any): void {
  pageBreakIfNeeded(doc, 110);
  doc.moveDown(0.8);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Certificate by the Employer', { underline: true })
    .moveDown(0.3);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      'Certified that the particulars of the above nomination have been verified and recorded in this establishment.',
    )
    .moveDown(0.6);

  doc.text("Employer's Reference No., if any: ____________________");
  doc.moveDown(0.5);
  doc.text('Signature of the employer / Officer authorised: ____________________');
  doc.moveDown(0.4);
  doc.text('Designation: ____________________');
  doc.moveDown(0.4);
  doc.text('Date: ____________________');
  doc.moveDown(0.4);
  doc.text('Name and address of the establishment or rubber stamp thereof:');
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
  doc.moveDown(1);
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
  doc.moveDown(1);
}

/* ───────────────────────── GRATUITY — Form F ───────────────────────── */

export function renderGratuityFormF(
  doc: any,
  emp: EmployeeForForm,
  nominations: NominationRecord[],
): void {
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Payment of Gratuity (Central) Rules', { align: 'center' });
  doc
    .fontSize(14)
    .fillColor(TEXT)
    .text("FORM 'F'", { align: 'center' })
    .fontSize(9)
    .fillColor(MUTED)
    .text('[See sub-rule (1) of Rule 6]', { align: 'center' });
  doc
    .moveDown(0.4)
    .fontSize(13)
    .fillColor(TEXT)
    .text('Nomination', { align: 'center', underline: true })
    .moveDown(0.8);

  doc.fontSize(10).fillColor(TEXT).text('To,');
  doc
    .fontSize(8)
    .fillColor(MUTED)
    .text('(Give here name or description of the establishment with full address)');
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
  doc.moveDown(1);
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
  doc.moveDown(1.2);

  const empName = emp.name ?? '';
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      `I, Shri/Shrimati/Kumari ${empName ? '__' + empName + '__' : '____________________________'}, whose particulars are given in the statement below, hereby nominate the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s).`,
      { align: 'justify' },
    )
    .moveDown(0.4);

  doc.text(
    '2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (h) of Section 2 of the Payment of Gratuity Act, 1972.',
    { align: 'justify' },
  );
  doc.moveDown(0.3);
  doc.text(
    '3. I hereby declare that I have no family within the meaning of clause (h) of Section 2 of the said Act.',
    { align: 'justify' },
  );
  doc.moveDown(0.3);
  doc.text(
    '4. (a) My father/mother/parents is/are not dependent on me.',
    { align: 'justify' },
  );
  doc.text(
    "    (b) My husband's father/mother/parents is/are not dependent on my husband.",
    { align: 'justify' },
  );
  doc.moveDown(0.3);
  doc.text(
    '5. I have excluded my husband from my family by a notice dated the ____________ to the controlling authority in terms of the proviso to clause (h) of Section 2 of the said Act.',
    { align: 'justify' },
  );
  doc.moveDown(0.3);
  doc.text(
    '6. Nomination made herein invalidates my previous nomination.',
    { align: 'justify' },
  );
  doc.moveDown(0.6);

  // Nominees table
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Nominee(s)', { align: 'center', underline: true })
    .moveDown(0.4);

  const members = (nominations[0]?.members ?? []) as NomineeRow[];
  drawNomineeTable(
    doc,
    [
      { header: 'S.No.', width: 38, key: 'sno' },
      { header: 'Name in full with full address of nominee(s)', width: 220, key: 'name' },
      { header: 'Relationship with the employee', width: 90, key: 'relationship' },
      { header: 'Age of nominee', width: 60, key: 'age' },
      { header: 'Proportion by which the gratuity will be shared', width: 107, key: 'sharePct' },
    ],
    members,
    3,
  );

  // Statement
  pageBreakIfNeeded(doc, 200);
  doc.moveDown(0.6);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Statement', { align: 'center', underline: true })
    .moveDown(0.4);

  const stmt: { label: string; value?: string | null }[] = [
    { label: '1. Name of employee in full', value: emp.name },
    { label: '2. Sex', value: emp.gender },
    { label: '3. Religion', value: '' },
    { label: '4. Whether unmarried/married/widow/widower', value: '' },
    { label: '5. Department/Branch/Section where employed', value: emp.department },
    { label: '6. Post held with Ticket No. or Serial No., if any', value: `${emp.designation || ''}${emp.employeeCode ? ' (' + emp.employeeCode + ')' : ''}` },
    { label: '7. Date of appointment', value: emp.dateOfJoining },
  ];
  stmt.forEach((row) => {
    pageBreakIfNeeded(doc, 22);
    doc
      .fontSize(10)
      .fillColor(TEXT)
      .text(row.label, { continued: true })
      .text('  ' + (row.value || '________________________________'));
    doc.moveDown(0.2);
  });
  doc.moveDown(0.3);
  doc.text('Permanent address:');
  ['Village', 'Thana', 'Sub-division', 'Post Office', 'District', 'State'].forEach(
    (lbl) => {
      pageBreakIfNeeded(doc, 22);
      doc.text(`    ${lbl}: ________________________________`);
    },
  );

  signatureBlock(doc);
  witnessBlock(
    doc,
    nominations[0]?.witnessName ?? null,
    nominations[0]?.witnessAddress ?? null,
  );
  employerCertificate(doc);

  // Acknowledgement
  pageBreakIfNeeded(doc, 80);
  doc.moveDown(0.6);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Acknowledgement by the Employee', { underline: true })
    .moveDown(0.3);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      "Received the duplicate copy of nomination in Form 'F' filed by me and duly certified by the employer.",
    )
    .moveDown(0.6);
  doc.text('Date: ____________________');
  doc.text('Signature of the Employee: ____________________');
  doc.moveDown(0.4);
  doc.fontSize(8).fillColor(MUTED).text('Note.—Strike out the words/paragraphs not applicable.');
}

/* ───────────────────────── PF — Form 2 (Revised) ───────────────────────── */

export function renderEpfForm2(
  doc: any,
  emp: EmployeeForForm,
  nominations: NominationRecord[],
): void {
  doc
    .fontSize(13)
    .fillColor(TEXT)
    .text('FORM 2 (Revised)', { align: 'center' })
    .fontSize(10)
    .fillColor(MUTED)
    .text('[See Paragraph 33 and 61(1) of the Employees\' Provident Funds Scheme, 1952 and', {
      align: 'center',
    })
    .text('Paragraph 18 of the Employees\' Pension Scheme, 1995]', { align: 'center' });
  doc
    .moveDown(0.4)
    .fontSize(12)
    .fillColor(TEXT)
    .text('Nomination and Declaration Form for Unexempted/Exempted Establishments', {
      align: 'center',
      underline: true,
    })
    .moveDown(0.2)
    .fontSize(10)
    .text('Declaration by a person taking up employment in an establishment', {
      align: 'center',
    })
    .text('in which the Employees\' Provident Funds Scheme, 1952 and the', {
      align: 'center',
    })
    .text('Employees\' Pension Scheme, 1995 are in force.', { align: 'center' })
    .moveDown(0.6);

  const lbl = (l: string, v?: string | null) => {
    pageBreakIfNeeded(doc, 22);
    doc
      .fontSize(10)
      .fillColor(TEXT)
      .text(l, { continued: true })
      .text('  ' + (v || '________________________________'));
    doc.moveDown(0.15);
  };

  lbl('1. Name (in Block Letters):', emp.name?.toUpperCase());
  lbl("2. Father's Name / Husband's Name:", emp.fatherName);
  lbl('3. Date of Birth:', emp.dateOfBirth);
  lbl('4. Gender:', emp.gender);
  lbl('5. Marital Status:', '');
  lbl('6. Account No. (UAN):', emp.uan);
  lbl('7. PAN:', emp.pan);
  lbl('8. Aadhaar:', emp.aadhaar);
  lbl('9. Date of Joining:', emp.dateOfJoining);
  lbl('10. Designation / Department:', `${emp.designation || ''}${emp.department ? ' / ' + emp.department : ''}`);
  doc.moveDown(0.6);

  // Part A — EPF Nomination
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('PART A (EPF) — NOMINATION', { underline: true })
    .moveDown(0.3);

  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      'I hereby nominate the person(s) / cancel the nomination made by me previously and nominate the person(s) mentioned below to receive the amount standing to my credit in the Employees\' Provident Fund, in the event of my death.',
      { align: 'justify' },
    )
    .moveDown(0.4);

  const pfNoms = nominations[0]?.members ?? [];
  drawNomineeTable(
    doc,
    [
      { header: 'S.No.', width: 38, key: 'sno' },
      { header: 'Name of nominee in full', width: 130, key: 'name' },
      { header: 'Address', width: 120, key: 'address' },
      { header: 'Relationship', width: 70, key: 'relationship' },
      { header: 'Date of Birth', width: 70, key: 'dateOfBirth' },
      { header: 'Total amount or share of accumulation in P.F. to be paid', width: 87, key: 'sharePct' },
    ],
    pfNoms,
    3,
  );

  // Guardian for minors
  pageBreakIfNeeded(doc, 60);
  doc.moveDown(0.4);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      'If nominee is a minor, name & relationship and address of the guardian who may receive the said amount during the minority of the nominee:',
      { align: 'justify' },
    )
    .moveDown(0.3);

  const minors = pfNoms.filter((m) => m.isMinor);
  if (minors.length) {
    minors.forEach((m, i) => {
      pageBreakIfNeeded(doc, 24);
      doc.fontSize(10).fillColor(TEXT).text(
        `${i + 1}. Minor: ${m.memberName || m.name || '—'}  |  Guardian: ${m.guardianName || '—'}${m.guardianRelationship ? ' (' + m.guardianRelationship + ')' : ''}${m.guardianAddress ? ' — ' + m.guardianAddress : ''}`,
      );
    });
  } else {
    doc.fontSize(10).fillColor(MUTED).text('Not applicable (no minor nominees).');
  }

  doc.moveDown(0.6);
  doc
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      '* Certified that I have no family as defined in para 2(g) of the Employees\' Provident Funds Scheme, 1952 and should I acquire a family hereafter the above nomination should be deemed as cancelled.',
      { align: 'justify' },
    )
    .moveDown(0.2)
    .text(
      '** Certified that my father/mother is/are dependent upon me.',
      { align: 'justify' },
    )
    .moveDown(0.2)
    .fontSize(8)
    .text('(* Strike out whichever is not applicable.)');

  // Part B — EPS family particulars
  pageBreakIfNeeded(doc, 200);
  doc.moveDown(0.8);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('PART B (EPS) — FAMILY PARTICULARS', { underline: true })
    .moveDown(0.3);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      'I hereby furnish below particulars of the members of my family who would be eligible to receive Widow/Children Pension in the event of my death.',
      { align: 'justify' },
    )
    .moveDown(0.4);

  drawNomineeTable(
    doc,
    [
      { header: 'S.No.', width: 38, key: 'sno' },
      { header: 'Name of family member', width: 160, key: 'name' },
      { header: 'Address', width: 150, key: 'address' },
      { header: 'Date of Birth', width: 80, key: 'dateOfBirth' },
      { header: 'Relationship', width: 87, key: 'relationship' },
    ],
    pfNoms,
    3,
  );

  doc.moveDown(0.6);
  doc
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      '*Certified that I have no family, as defined in para 2(vii) of the Employees\' Pension Scheme, 1995 and should I acquire a family hereafter, I shall furnish particulars thereon in the above form.',
      { align: 'justify' },
    );

  signatureBlock(doc);

  // Certificate by employer
  pageBreakIfNeeded(doc, 110);
  doc.moveDown(0.4);
  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Certificate by Employer', { underline: true })
    .moveDown(0.3);
  doc
    .fontSize(10)
    .fillColor(TEXT)
    .text(
      'Certified that the above declaration & nomination has been signed/thumb-impressed before me by Shri/Smt./Kum. ____________________________ employed in my establishment after he/she has read the entries/the entries have been read over to him/her by me and got confirmed by him/her.',
      { align: 'justify' },
    )
    .moveDown(0.6);

  doc.text('Place: ____________________');
  doc.text('Date:  ____________________');
  doc.moveDown(0.4);
  doc.text('Signature of the Employer / Authorised Officer: ____________________');
  doc.text('Designation: ____________________');
  doc.text('Name & address of the Factory / Establishment or Rubber Stamp thereof:');
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
  doc.moveDown(1);
  dottedLine(doc, doc.page.margins.left, doc.y + 6, 480);
}

/* ───────────────────────── Generic statutory layout ───────────────────────── */

export function renderGenericNomination(
  doc: any,
  emp: EmployeeForForm,
  nominations: NominationRecord[],
  formType: string,
): void {
  doc
    .fontSize(14)
    .fillColor(TEXT)
    .text(`${formType} Nomination Form`, { align: 'center', underline: true })
    .moveDown(0.6);

  const lbl = (l: string, v?: string | null) => {
    doc
      .fontSize(10)
      .fillColor(TEXT)
      .text(l, { continued: true })
      .text('  ' + (v || '________________________________'));
    doc.moveDown(0.2);
  };

  lbl('1. Name of Employee:', emp.name);
  lbl('2. Employee Code:', emp.employeeCode);
  lbl("3. Father's / Husband's Name:", emp.fatherName);
  lbl('4. Date of Birth:', emp.dateOfBirth);
  lbl('5. Gender:', emp.gender);
  lbl('6. Date of Joining:', emp.dateOfJoining);
  lbl('7. Designation / Department:', `${emp.designation || ''}${emp.department ? ' / ' + emp.department : ''}`);
  doc.moveDown(0.4);

  doc
    .fontSize(11)
    .fillColor(TEXT)
    .text('Nominee(s)', { underline: true })
    .moveDown(0.3);

  const members = nominations[0]?.members ?? [];
  drawNomineeTable(
    doc,
    [
      { header: 'S.No.', width: 38, key: 'sno' },
      { header: 'Name', width: 150, key: 'name' },
      { header: 'Relationship', width: 90, key: 'relationship' },
      { header: 'Date of Birth', width: 80, key: 'dateOfBirth' },
      { header: 'Address', width: 120, key: 'address' },
      { header: 'Share %', width: 37, key: 'sharePct' },
    ],
    members,
    3,
  );

  signatureBlock(doc);
  witnessBlock(
    doc,
    nominations[0]?.witnessName ?? null,
    nominations[0]?.witnessAddress ?? null,
  );
  employerCertificate(doc);
}

/* ───────────────────────── Public entry point ───────────────────────── */

export async function buildNominationPdf(
  formType: string,
  emp: EmployeeForForm,
  nominations: NominationRecord[],
): Promise<Buffer> {
  const doc = createDoc({
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  const upper = formType.toUpperCase();
  if (upper === 'GRATUITY') {
    renderGratuityFormF(doc, emp, nominations);
  } else if (upper === 'PF') {
    renderEpfForm2(doc, emp, nominations);
  } else {
    renderGenericNomination(doc, emp, nominations, upper);
  }

  addPageNumbers(doc);
  return toBuffer(doc);
}
