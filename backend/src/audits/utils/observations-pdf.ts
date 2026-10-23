import { generateAuditReportPdfBuffer } from './report-pdf';

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
  evidenceFilePaths?: string | string[] | null;
};

export type ObservationsPdfInput = {
  auditId: string;
  auditCode?: string | null;
  auditType?: string | null;
  periodCode?: string | null;
  clientName?: string | null;
  branchName?: string | null;
  contractorName?: string | null;
  rows: ObservationPdfRow[];
};

export async function generateObservationsPdfBuffer(
  input: ObservationsPdfInput,
): Promise<Buffer> {
  return generateAuditReportPdfBuffer({
    ...input,
    documentKind: 'OBSERVATIONS',
    version: 'INTERNAL',
    stage: 'FINAL',
    updatedAt: new Date(),
    executiveSummary:
      'Working observation register for the identified audit scope. This export includes current observations and recorded evidence references. It is not a CRM-approved published final report.',
    scope: '',
    methodology: '',
    findings: '',
    recommendations: '',
    observations: input.rows,
  });
}
