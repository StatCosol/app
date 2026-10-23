import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';

export type AuditReportPdfObservation = {
  sequenceNumber: number | null;
  observation: string;
  clause: string | null;
  risk: string | null;
  status: string;
  recommendation: string | null;
  consequences?: string | null;
  complianceRequirements?: string | null;
  elaboration?: string | null;
  categoryName?: string | null;
  evidenceFilePaths?: string | string[] | null;
};

export type AuditReportPdfInput = {
  auditId: string;
  auditCode?: string | null;
  clientName?: string | null;
  branchName?: string | null;
  contractorName?: string | null;
  auditType?: string | null;
  periodCode?: string | null;
  version: 'INTERNAL' | 'CLIENT';
  stage: 'FINAL';
  documentKind?: 'FINAL' | 'PRELIMINARY' | 'OBSERVATIONS';
  updatedAt?: string | Date | null;
  finalizedAt?: string | Date | null;
  revision?: number | null;
  reportStatus?: string | null;
  approvedAt?: string | Date | null;
  publishedAt?: string | Date | null;
  executiveSummary: string;
  scope: string;
  methodology: string;
  findings: string;
  recommendations: string;
  observations: AuditReportPdfObservation[];
  fieldwork?: Array<{
    label: string;
    status: string;
    remarks: string;
    evidence: string;
  }>;
};

function formatDate(value?: string | Date | null): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 10);
}

const INK = '#193B35';
const TEXT = '#263B43';
const MUTED = '#5B6D72';
const LINE = '#D8E3DF';
const PAPER = '#F3F7F5';

function label(value?: string | null): string {
  return (
    value?.trim().replace(/_/g, ' ').replace(/\s+/g, ' ') || 'Not recorded'
  );
}

function reportDate(value?: string | Date | null): string {
  if (!value) return 'Not recorded';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function periodLabel(value?: string | null): string {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return label(value);
}

export function auditReportTypeLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    SAFETY: 'Safety audit',
    TRANSPORT: 'Transport audit',
    WAREHOUSE: 'Warehouse audit',
    E_MARKETING: 'E-marketing audit',
    OTHER: 'Other audit',
    CONTRACTOR: 'Contractor audit',
    FACTORY: 'Factory audit',
    SHOPS_ESTABLISHMENT: 'Shops & establishments audit',
    LABOUR_EMPLOYMENT: 'Labour law audit',
    FSSAI: 'FSSAI audit',
    HR: 'HR audit',
    PAYROLL: 'Payroll audit',
    GAP: 'Gap audit',
  };
  return labels[value || ''] || `${label(value)} audit`;
}

// Evidence stays behind the portal's existing authenticated access controls.
// Print file names only: never expose storage paths, signed URLs or local paths.
export function auditEvidenceNames(value?: string | string[] | null): string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const names = parsed
    .filter((v): v is string => typeof v === 'string')
    .map((v) => {
      const path = v.split(/[?#]/)[0].replace(/\\/g, '/');
      let name = path.slice(path.lastIndexOf('/') + 1);
      try {
        name = decodeURIComponent(name);
      } catch {
        /* Keep legacy filename. */
      }
      return name
        .split('')
        .filter(
          (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
        )
        .join('')
        .replace(/[\\/]/g, '_')
        .trim();
    })
    .filter((name) => name && name !== '.' && name !== '..');
  return [...new Set(names)];
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function heading(doc: PDFKit.PDFDocument, number: string, title: string): void {
  ensureSpace(doc, 64);
  const y = doc.y;
  doc
    .font('ReportBold')
    .fontSize(10)
    .fillColor(INK)
    .text(number, 44, y + 2, { width: 26 });
  doc.fontSize(13).text(title, 78, y, { width: 473 });
  doc
    .moveTo(78, doc.y + 7)
    .lineTo(551, doc.y + 7)
    .strokeColor(LINE)
    .lineWidth(0.7)
    .stroke();
  doc.y += 19;
  doc.x = 44;
}

function body(doc: PDFKit.PDFDocument, text: string): void {
  doc
    .font('ReportRegular')
    .fontSize(10.5)
    .fillColor(TEXT)
    .text(text?.trim() || 'Not recorded in this report.', 44, doc.y, {
      width: 507,
      lineGap: 3,
      paragraphGap: 6,
    });
  doc.y += 15;
}

function section(
  doc: PDFKit.PDFDocument,
  number: string,
  title: string,
  text: string,
): void {
  heading(doc, number, title);
  body(doc, text);
}

export async function generateAuditReportPdfBuffer(
  input: AuditReportPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: 72, bottom: 58, left: 44, right: 44 },
        info: {
          Title: `Audit report - ${input.auditCode || input.auditId}`,
          Author: 'StatCo Solutions',
          Subject: `${label(input.clientName)} / ${label(input.contractorName)}`,
        },
      });
      const chunks: Buffer[] = [];
      const fontDir = [
        resolvePath(__dirname, '../../../../assets/fonts'),
        resolvePath(__dirname, '../../../assets/fonts'),
      ].find((dir) => existsSync(resolvePath(dir, 'NotoSans-Regular.ttf')));
      if (!fontDir)
        throw new Error('Audit report fonts are missing from the deployment');
      doc.registerFont(
        'ReportRegular',
        resolvePath(fontDir, 'NotoSans-Regular.ttf'),
      );
      doc.registerFont('ReportBold', resolvePath(fontDir, 'NotoSans-Bold.ttf'));
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      let continuation = '';
      const pageContexts = new Map<number, string>();
      doc.on('pageAdded', () => {
        pageContexts.set(doc.bufferedPageRange().count - 1, continuation);
      });
      const reference = input.auditCode || input.auditId;
      const kind = input.documentKind || 'FINAL';
      const title =
        kind === 'PRELIMINARY'
          ? 'Preliminary Findings'
          : kind === 'OBSERVATIONS'
            ? 'Audit Observations'
            : 'Audit Report';
      const revision =
        input.revision == null ? 'Not recorded' : String(input.revision);
      const status =
        (
          {
            PUBLISHED: 'Published',
            APPROVED: 'Approved - awaiting publication',
            SUBMITTED: 'Submitted for CRM review',
            DRAFT: 'Draft - not for issue',
          } as Record<string, string>
        )[input.reportStatus || ''] || 'Finalized report';
      const audience =
        kind === 'PRELIMINARY'
          ? 'For corrective action'
          : kind === 'OBSERVATIONS'
            ? 'Working observation register'
            : input.version === 'CLIENT'
              ? 'Client report'
              : 'Internal report';
      doc.rect(0, 0, 595.28, 10).fill(INK);
      doc
        .font('ReportBold')
        .fontSize(11)
        .fillColor(INK)
        .text('STATCO SOLUTIONS', 44, 34, { width: 260, lineBreak: false });
      doc
        .font('ReportRegular')
        .fontSize(9)
        .fillColor(MUTED)
        .text(audience.toUpperCase(), 320, 35, {
          width: 231,
          align: 'right',
          lineBreak: false,
        });
      doc
        .font('ReportBold')
        .fontSize(28)
        .fillColor(INK)
        .text(title, 44, 70, { width: 507 });
      doc
        .font('ReportRegular')
        .fontSize(11)
        .fillColor(MUTED)
        .text(
          `${auditReportTypeLabel(input.auditType)}  |  ${periodLabel(input.periodCode)}`,
          44,
          doc.y + 7,
          { width: 507 },
        );
      doc.y += 22;
      // Measured rows allow long client, unit and contractor names to wrap safely.
      const cells: [string, string][] = [
        ['CLIENT', label(input.clientName)],
        ['BRANCH / UNIT', label(input.branchName)],
        [
          'CONTRACTOR / VENDOR',
          input.contractorName?.trim() ||
            (input.auditType === 'CONTRACTOR'
              ? 'Not recorded'
              : 'Not applicable'),
        ],
        ['AUDIT REFERENCE', reference],
        [
          kind === 'FINAL' ? 'REPORT REVISION' : 'ISSUE PURPOSE',
          kind === 'FINAL' ? revision : audience,
        ],
        [
          'STATUS',
          kind === 'FINAL'
            ? status
            : kind === 'PRELIMINARY'
              ? 'Preliminary - not a final report'
              : 'Working copy - not for publication',
        ],
      ];
      for (let i = 0; i < cells.length; i += 2) {
        const valueWidth = 226;
        doc.font('ReportBold').fontSize(10.5);
        const h =
          Math.max(
            ...cells
              .slice(i, i + 2)
              .map((c) =>
                doc.heightOfString(c[1], { width: valueWidth, lineGap: 2 }),
              ),
          ) + 40;
        ensureSpace(doc, h);
        const rowY = doc.y;
        doc.rect(44, rowY, 507, h).fill(PAPER);
        cells.slice(i, i + 2).forEach(([key, value], col) => {
          const x = 58 + col * 254;
          doc
            .font('ReportRegular')
            .fontSize(7.5)
            .fillColor(MUTED)
            .text(key, x, rowY + 11, { width: valueWidth });
          doc
            .font('ReportBold')
            .fontSize(10.5)
            .fillColor(TEXT)
            .text(value, x, rowY + 25, { width: valueWidth, lineGap: 2 });
        });
        doc
          .moveTo(44, rowY + h)
          .lineTo(551, rowY + h)
          .strokeColor('#FFFFFF')
          .lineWidth(2)
          .stroke();
        doc.x = 44;
        doc.y = rowY + h;
      }
      doc.y += 14;
      const dates =
        kind === 'FINAL' ? [`Finalized: ${reportDate(input.finalizedAt)}`] : [];
      if (kind === 'FINAL' && input.approvedAt)
        dates.push(`Approved: ${reportDate(input.approvedAt)}`);
      if (input.publishedAt)
        dates.push(`Published: ${reportDate(input.publishedAt)}`);
      if (kind !== 'FINAL' && !input.publishedAt)
        dates.push(`Generated: ${reportDate(input.updatedAt)}`);
      doc
        .font('ReportRegular')
        .fontSize(8)
        .fillColor(MUTED)
        .text(dates.join('   |   '), 44, doc.y, { width: 507, lineGap: 3 });
      doc.y += 24;
      if (kind === 'FINAL') {
        section(doc, '01', 'Executive summary', input.executiveSummary);
        section(doc, '02', 'Scope of review', input.scope);
        section(doc, '03', 'Methodology', input.methodology);
        section(doc, '04', 'Findings', input.findings);
        section(doc, '05', 'Recommendations', input.recommendations);
      } else {
        section(
          doc,
          '01',
          kind === 'PRELIMINARY'
            ? 'Corrective action instructions'
            : 'Review scope',
          input.executiveSummary,
        );
      }
      heading(
        doc,
        kind === 'FINAL' ? '06' : '02',
        kind === 'PRELIMINARY'
          ? 'Non-compliance register'
          : 'Observation register',
      );
      if (!input.observations.length) {
        body(doc, 'No observations were included in this report.');
      } else {
        doc
          .font('ReportRegular')
          .fontSize(9)
          .fillColor(MUTED)
          .text(
            `${input.observations.length} observation(s) included`,
            44,
            doc.y,
            { width: 507 },
          );
        doc.y += 17;
        input.observations.forEach((obs, idx) => {
          const observationRef =
            obs.sequenceNumber == null
              ? String(idx + 1).padStart(2, '0')
              : String(obs.sequenceNumber).padStart(2, '0');
          continuation = `Observation ${observationRef}`;
          ensureSpace(doc, 110);
          doc
            .font('ReportBold')
            .fontSize(11)
            .fillColor(INK)
            .text(`Observation ${observationRef}`, 44, doc.y, { width: 507 });
          doc.y += 5;
          doc
            .font('ReportRegular')
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(
              `Risk: ${label(obs.risk)}   |   Status: ${label(obs.status)}`,
              44,
              doc.y,
              { width: 507, lineGap: 2 },
            );
          if (obs.categoryName)
            doc.text(`Category: ${obs.categoryName}`, {
              width: 507,
              lineGap: 2,
            });
          if (obs.clause)
            doc.text(`Reference: ${obs.clause}`, { width: 507, lineGap: 2 });
          doc.y += 9;
          body(doc, obs.observation);
          for (const [name, content] of [
            ['Consequences', obs.consequences],
            ['Compliance requirements', obs.complianceRequirements],
            ['Supporting details', obs.elaboration],
          ]) {
            if (content?.trim()) {
              ensureSpace(doc, 75);
              doc
                .font('ReportBold')
                .fontSize(9)
                .fillColor(INK)
                .text(name!, 44, doc.y, { width: 507 });
              doc.y += 5;
              body(doc, content);
            }
          }
          if (obs.recommendation) {
            ensureSpace(doc, 75);
            doc
              .font('ReportBold')
              .fontSize(9)
              .fillColor(INK)
              .text('Recommended action', 44, doc.y, { width: 507 });
            doc.y += 5;
            body(doc, obs.recommendation);
          }
          const evidenceCount = auditEvidenceNames(
            obs.evidenceFilePaths,
          ).length;
          if (evidenceCount) {
            ensureSpace(doc, 32);
            doc
              .font('ReportRegular')
              .fontSize(9)
              .fillColor(MUTED)
              .text(
                `Evidence: ${evidenceCount} file(s) listed for Observation ${observationRef} in the attachment index.`,
                44,
                doc.y,
                { width: 507, lineGap: 2 },
              );
            doc.y += 12;
          }
          doc.y += 6;
        });
      }
      if (input.fieldwork?.length) {
        continuation = 'Audit evidence & site inspection';
        doc.addPage();
        heading(
          doc,
          kind === 'FINAL' ? '07' : '03',
          'Audit evidence & site inspection record',
        );
        input.fieldwork.forEach((point, index) => {
          continuation = `Audit point ${index + 1}`;
          ensureSpace(doc, 90);
          doc
            .font('ReportBold')
            .fontSize(11)
            .fillColor(INK)
            .text(`${index + 1}. ${point.label}`, 44, doc.y, { width: 507 });
          doc.y += 6;
          doc
            .font('ReportRegular')
            .fontSize(9)
            .fillColor(MUTED)
            .text(`Decision: ${point.status.replace(/_/g, ' ')}`, 44, doc.y, {
              width: 507,
            });
          doc.y += 9;
          body(doc, point.remarks);
          ensureSpace(doc, 55);
          doc
            .font('ReportBold')
            .fontSize(9)
            .fillColor(INK)
            .text('Supporting evidence', 44, doc.y, { width: 507 });
          doc.y += 5;
          body(doc, point.evidence);
        });
      }
      continuation = 'Attachment index';
      heading(
        doc,
        String(
          (kind === 'FINAL' ? 7 : 3) + (input.fieldwork?.length ? 1 : 0),
        ).padStart(2, '0'),
        'Attachment index',
      );
      body(
        doc,
        'This index lists evidence references recorded against the included observations. Files are retained separately in the audit workspace; this PDF does not embed them or grant additional access.',
      );
      let evidenceTotal = 0;
      input.observations.forEach((obs, idx) => {
        const names = auditEvidenceNames(obs.evidenceFilePaths);
        if (!names.length) return;
        const ref = String(obs.sequenceNumber ?? idx + 1).padStart(2, '0');
        continuation = `Attachment index / Observation ${ref}`;
        ensureSpace(doc, 55);
        doc
          .font('ReportBold')
          .fontSize(10)
          .fillColor(INK)
          .text(`Observation ${ref}`, 44, doc.y, { width: 507 });
        doc.y += 7;
        for (const name of names) {
          ensureSpace(doc, 32);
          body(doc, `E${String(++evidenceTotal).padStart(3, '0')}  |  ${name}`);
        }
      });
      if (!evidenceTotal)
        body(
          doc,
          'No evidence attachments are recorded against the observations included in this report.',
        );
      // Buffered page numbering never creates an extra page or overlaps body text.
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        if (i > 0) {
          doc
            .font('ReportBold')
            .fontSize(9)
            .fillColor(INK)
            .text('STATCO SOLUTIONS', 44, 29, { width: 220, lineBreak: false });
          doc
            .font('ReportRegular')
            .fontSize(8)
            .fillColor(MUTED)
            .text(`${title.toUpperCase()}  /  ${reference}`, 275, 29, {
              width: 276,
              align: 'right',
              lineBreak: false,
            });
          if (pageContexts.get(i))
            doc.fontSize(7).text(pageContexts.get(i)!, 44, 45, {
              width: 507,
              lineBreak: false,
            });
          doc
            .moveTo(44, 60)
            .lineTo(551, 60)
            .strokeColor(LINE)
            .lineWidth(0.7)
            .stroke();
        }
        const y = doc.page.height - 39;
        doc
          .moveTo(44, y - 9)
          .lineTo(551, y - 9)
          .strokeColor(LINE)
          .lineWidth(0.7)
          .stroke();
        doc.font('ReportRegular').fontSize(7).fillColor(MUTED);
        doc.text(
          `${audience}  |  ${reference}${kind === 'FINAL' ? `  |  Rev. ${revision}` : ''}`,
          44,
          y,
          { width: 430, lineBreak: false },
        );
        doc.text(`${i + 1} / ${range.count}`, 493, y, {
          width: 58,
          align: 'right',
          lineBreak: false,
        });
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// ─── Phase 4: Preliminary Findings Report ─────────────────────────────
export type PreliminaryNcRow = {
  documentName: string | null;
  remark: string | null;
  status: string;
  vendorWindowUntil: string | null;
  isRecurring: boolean;
  recurrenceCount: number | null;
};

export type PreliminaryReportPdfInput = {
  auditId: string;
  auditCode?: string | null;
  clientName?: string | null;
  branchName?: string | null;
  contractorName?: string | null;
  auditType?: string | null;
  periodCode?: string | null;
  publishedAt: string | Date | null;
  vendorWindowDays: number;
  vendorWindowUntil: string | null;
  ncs: PreliminaryNcRow[];
};

export async function generatePreliminaryReportPdfBuffer(
  input: PreliminaryReportPdfInput,
): Promise<Buffer> {
  return generateAuditReportPdfBuffer({
    ...input,
    documentKind: 'PRELIMINARY',
    version: 'INTERNAL',
    stage: 'FINAL',
    updatedAt: new Date(),
    executiveSummary: `Closure window: ${input.vendorWindowDays} day(s). Deadline: ${input.vendorWindowUntil || 'Not recorded'}. Submit corrected evidence against each finding through the audit correction workflow. Findings remain subject to reviewer verification and final audit approval.`,
    scope: '',
    methodology: '',
    findings: '',
    recommendations: '',
    observations: input.ncs.map((nc, idx) => ({
      sequenceNumber: idx + 1,
      observation: nc.remark || 'Finding not recorded.',
      clause: nc.documentName,
      risk: null,
      status: nc.status,
      recommendation: `Submit the corrective response by ${nc.vendorWindowUntil || input.vendorWindowUntil || 'the assigned deadline'}.`,
      elaboration: nc.isRecurring
        ? `Recurring finding: ${nc.recurrenceCount || 1} occurrence(s).`
        : null,
    })),
  });
}
