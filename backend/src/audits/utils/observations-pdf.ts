import PDFDocument from 'pdfkit';

export type ObservationPdfRow = {
  sequenceNumber: number | null;
  observation: string;
  consequences: string | null;
  complianceRequirements: string | null;
  clause: string | null;
  elaboration: string | null;
  recommendation: string | null;
  risk: string | null;
  status: string;
  categoryName: string | null;
};

export type ObservationsPdfInput = {
  auditId: string;
  clientName?: string | null;
  rows: ObservationPdfRow[];
};

export async function generateObservationsPdfBuffer(
  input: ObservationsPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });

      const chunks: Buffer[] = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Title
      doc.fontSize(18).text('Audit Observations Report', { align: 'center' });
      doc.moveDown(0.5);

      // Header info
      doc.fontSize(10);
      doc.text(`Audit ID: ${input.auditId}`);
      if (input.clientName) doc.text(`Client: ${input.clientName}`);
      doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`);
      doc.text(`Total Observations: ${input.rows.length}`);
      doc.moveDown(1);

      // Separator line
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      if (input.rows.length === 0) {
        doc.fontSize(12).text('No observations recorded for this audit.', {
          align: 'center',
        });
      }

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const num = row.sequenceNumber ?? i + 1;

        // Check if we need a new page (leave room for at least 150pt)
        if (doc.y > 680) doc.addPage();

        // Observation header
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(`#${num}. ${row.categoryName ?? 'Uncategorized'}`, {
            continued: false,
          });

        // Risk & Status badges
        doc.fontSize(9).font('Helvetica');
        const badges: string[] = [];
        if (row.risk) badges.push(`Risk: ${row.risk}`);
        badges.push(`Status: ${row.status}`);
        doc.text(badges.join('  |  '));
        doc.moveDown(0.3);

        // Observation text
        doc.fontSize(10).font('Helvetica-Bold').text('Observation:');
        doc.font('Helvetica').text(row.observation || '—');
        doc.moveDown(0.2);

        // Consequences
        if (row.consequences) {
          doc.font('Helvetica-Bold').text('Consequences:');
          doc.font('Helvetica').text(row.consequences);
          doc.moveDown(0.2);
        }

        // Compliance Requirements
        if (row.complianceRequirements) {
          doc.font('Helvetica-Bold').text('Compliance Requirements:');
          doc.font('Helvetica').text(row.complianceRequirements);
          doc.moveDown(0.2);
        }

        // Clause
        if (row.clause) {
          doc.font('Helvetica-Bold').text('Clause / Section:');
          doc.font('Helvetica').text(row.clause);
          doc.moveDown(0.2);
        }

        // Elaboration
        if (row.elaboration) {
          doc.font('Helvetica-Bold').text('Elaboration:');
          doc.font('Helvetica').text(row.elaboration);
          doc.moveDown(0.2);
        }

        // Recommendation
        if (row.recommendation) {
          doc.font('Helvetica-Bold').text('Recommendation:');
          doc.font('Helvetica').text(row.recommendation);
          doc.moveDown(0.2);
        }

        // Separator
        doc.moveDown(0.3);
        doc
          .moveTo(40, doc.y)
          .lineTo(555, doc.y)
          .strokeColor('#cccccc')
          .stroke();
        doc.strokeColor('#000000');
        doc.moveDown(0.5);
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
