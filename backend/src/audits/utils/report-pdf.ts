import PDFDocument from 'pdfkit';

export type AuditReportPdfObservation = {
  sequenceNumber: number | null;
  observation: string;
  clause: string | null;
  risk: string | null;
  status: string;
  recommendation: string | null;
};

export type AuditReportPdfInput = {
  auditId: string;
  auditCode?: string | null;
  clientName?: string | null;
  branchName?: string | null;
  periodCode?: string | null;
  version: 'INTERNAL' | 'CLIENT';
  stage: 'FINAL';
  updatedAt?: string | Date | null;
  finalizedAt?: string | Date | null;
  executiveSummary: string;
  scope: string;
  methodology: string;
  findings: string;
  recommendations: string;
  observations: AuditReportPdfObservation[];
};

function formatDate(value?: string | Date | null): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 10);
}

function section(doc: any, title: string, body: string): void {
  if (doc.y > 700) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text(title);
  doc.moveDown(0.15);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(body?.trim() || '-', {
      lineGap: 2,
    });
  doc.moveDown(0.4);
}

export async function generateAuditReportPdfBuffer(
  input: AuditReportPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.font('Helvetica-Bold').fontSize(18).text('Audit Report', {
        align: 'center',
      });
      doc.moveDown(0.4);

      doc.font('Helvetica').fontSize(10);
      doc.text(`Audit Code: ${input.auditCode || input.auditId}`);
      doc.text(`Audit ID: ${input.auditId}`);
      doc.text(`Client: ${input.clientName || '-'}`);
      doc.text(`Branch: ${input.branchName || '-'}`);
      doc.text(`Period: ${input.periodCode || '-'}`);
      doc.text(`Version: ${input.version}`);
      doc.text(`Stage: ${input.stage}`);
      doc.text(`Finalized At: ${formatDate(input.finalizedAt)}`);
      doc.text(`Last Updated: ${formatDate(input.updatedAt)}`);
      doc.moveDown(0.7);

      section(doc, 'Executive Summary', input.executiveSummary);
      section(doc, 'Scope', input.scope);
      section(doc, 'Methodology', input.methodology);
      section(doc, 'Findings', input.findings);
      section(doc, 'Recommendations', input.recommendations);

      if (doc.y > 690) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).text('Imported Observations');
      doc.moveDown(0.2);
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`Total: ${input.observations.length}`);
      doc.moveDown(0.3);

      if (!input.observations.length) {
        doc.font('Helvetica').fontSize(10).text('No observations imported.');
      } else {
        input.observations.forEach((obs, idx) => {
          if (doc.y > 700) doc.addPage();
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(`${idx + 1}. ${obs.observation || '-'}`);
          doc
            .font('Helvetica')
            .fontSize(9)
            .text(
              `Risk: ${obs.risk || 'LOW'} | Status: ${obs.status || 'OPEN'} | Clause: ${obs.clause || '-'}`,
            );
          if (obs.recommendation) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .text(`Recommendation: ${obs.recommendation}`);
          }
          doc.moveDown(0.3);
        });
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
  periodCode?: string | null;
  publishedAt: string | Date | null;
  vendorWindowDays: number;
  vendorWindowUntil: string | null;
  ncs: PreliminaryNcRow[];
};

export async function generatePreliminaryReportPdfBuffer(
  input: PreliminaryReportPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .text('Preliminary Findings Report', { align: 'center' });
      doc.moveDown(0.2);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666')
        .text('Issued for vendor / branch corrective action', {
          align: 'center',
        });
      doc.fillColor('#000');
      doc.moveDown(0.6);

      doc.font('Helvetica').fontSize(10);
      doc.text(`Audit Code: ${input.auditCode || input.auditId}`);
      doc.text(`Client: ${input.clientName || '-'}`);
      doc.text(`Branch: ${input.branchName || '-'}`);
      doc.text(`Period: ${input.periodCode || '-'}`);
      doc.text(`Preliminary Published: ${formatDate(input.publishedAt)}`);
      doc.text(
        `Closure Window: ${input.vendorWindowDays} day(s)  (Deadline: ${input.vendorWindowUntil || '-'})`,
      );
      doc.moveDown(0.6);

      doc.font('Helvetica-Bold').fontSize(11).text('Instructions');
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(
          'The findings below have been raised as Non-Compliances. Please re-upload corrected evidence against each item from your portal (Compliance Portal → Audit Non-Compliances) within the closure window. Items not corrected by the deadline will be escalated and may impact the final audit score.',
          { lineGap: 2 },
        );
      doc.moveDown(0.6);

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`Non-Compliances (${input.ncs.length})`);
      doc.moveDown(0.3);

      if (!input.ncs.length) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .text('No open non-compliances at the time of publication.');
      } else {
        input.ncs.forEach((nc, idx) => {
          if (doc.y > 720) doc.addPage();
          const tag = nc.isRecurring
            ? ` [RECURRING x${nc.recurrenceCount || 1}]`
            : '';
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(`${idx + 1}. ${nc.documentName || 'Document'}${tag}`);
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#444')
            .text(
              `Status: ${nc.status} | Deadline: ${nc.vendorWindowUntil || '-'}`,
            );
          doc.fillColor('#000');
          doc
            .font('Helvetica')
            .fontSize(9)
            .text(`Finding: ${nc.remark || '-'}`, { lineGap: 2 });
          doc.moveDown(0.4);
        });
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
