import { Injectable } from '@nestjs/common';
import {
  CompliancePctService,
  BranchPctRow,
  PctSummary,
} from '../common/services/compliance-pct.service';
import {
  createDoc,
  toBuffer,
  header,
  addPageNumbers,
  sectionTitle,
  kpiRow,
  table,
  divider,
  TableCol,
} from '../common/utils/pdf-helpers';

type DtssTaskRow = {
  status: string;
  dueDate: string | Date | null;
  branchName?: string | null;
  returnType?: string | null;
  lawType?: string | null;
  [key: string]: unknown;
};

@Injectable()
export class PdfReportService {
  constructor(private readonly pctSvc: CompliancePctService) {}

  /* ═══════════════════════════════════════════════════════════
   *  1. Compliance Summary PDF  —  per-client, all branches
   * ═══════════════════════════════════════════════════════════ */

  async complianceSummary(
    clientId: string,
    month?: string,
    clientName?: string,
  ): Promise<Buffer> {
    const [overall, branches] = await Promise.all([
      this.pctSvc.clientOverallPct(clientId, month),
      this.pctSvc.clientBranchesPct(clientId, month),
    ]);

    const doc = createDoc();

    header(
      doc,
      'Compliance Summary Report',
      `${clientName || 'Client'} — ${month || 'All Time'}`,
    );

    // KPI row
    kpiRow(doc, [
      { label: 'Overall Compliance', value: `${overall.compliancePct}%` },
      { label: 'Total Tasks', value: overall.total },
      { label: 'Compliant', value: overall.compliant },
      { label: 'Pending', value: overall.pending },
      { label: 'Overdue', value: overall.overdue },
    ]);

    divider(doc);
    doc.moveDown(0.5);

    // Branch table
    sectionTitle(doc, 'Branch-wise Compliance');

    const cols: TableCol[] = [
      { header: 'Branch', key: 'branchName', width: 140 },
      { header: 'State', key: 'stateCode', width: 50 },
      { header: 'Total', key: 'total', width: 50, align: 'center' },
      { header: 'Approved', key: 'approved', width: 60, align: 'center' },
      { header: 'Pending', key: 'pending', width: 55, align: 'center' },
      { header: 'Overdue', key: 'overdue', width: 55, align: 'center' },
      { header: '%', key: 'pct', width: 50, align: 'center' },
      { header: 'Risk', key: 'riskLevel', width: 55, align: 'center' },
    ];

    const rows = branches.map((b) => ({
      ...b,
      pct: `${b.compliancePct}%`,
    }));

    table(doc, cols, rows);

    addPageNumbers(doc);
    return toBuffer(doc);
  }

  /* ═══════════════════════════════════════════════════════════
   *  2. CEO Dashboard PDF  —  cross-client overview
   * ═══════════════════════════════════════════════════════════ */

  async ceoDashboard(
    clients: { id: string; name: string }[],
    month?: string,
  ): Promise<Buffer> {
    const doc = createDoc();

    header(doc, 'CEO Dashboard Report', `Period: ${month || 'All Time'}`);

    // Gather summary for each client
    const summaries: {
      name: string;
      pct: PctSummary;
      branches: BranchPctRow[];
    }[] = [];
    for (const c of clients) {
      const [pct, branches] = await Promise.all([
        this.pctSvc.clientOverallPct(c.id, month),
        this.pctSvc.lowestBranches(c.id, month, 3),
      ]);
      summaries.push({ name: c.name, pct, branches });
    }

    // Overview table
    sectionTitle(doc, 'Client Overview');

    const overviewCols: TableCol[] = [
      { header: 'Client', key: 'name', width: 160 },
      { header: 'Compliance %', key: 'pct', width: 80, align: 'center' },
      { header: 'Total', key: 'total', width: 60, align: 'center' },
      { header: 'Compliant', key: 'compliant', width: 70, align: 'center' },
      { header: 'Overdue', key: 'overdue', width: 60, align: 'center' },
    ];

    const overviewRows = summaries.map((s) => ({
      name: s.name,
      pct: `${s.pct.compliancePct}%`,
      total: s.pct.total,
      compliant: s.pct.compliant,
      overdue: s.pct.overdue,
    }));

    table(doc, overviewCols, overviewRows);

    // Lowest-risk branches per client
    for (const s of summaries) {
      if (!s.branches.length) continue;
      if (doc.y > doc.page.height - 120) doc.addPage();

      sectionTitle(doc, `Lowest Branches — ${s.name}`);

      const branchCols: TableCol[] = [
        { header: 'Branch', key: 'branchName', width: 160 },
        { header: 'State', key: 'stateCode', width: 60 },
        { header: '%', key: 'pct', width: 60, align: 'center' },
        { header: 'Risk', key: 'riskLevel', width: 70, align: 'center' },
      ];

      table(
        doc,
        branchCols,
        s.branches.map((b) => ({ ...b, pct: `${b.compliancePct}%` })),
      );
    }

    addPageNumbers(doc);
    return toBuffer(doc);
  }

  /* ═══════════════════════════════════════════════════════════
   *  3. Risk Heatmap PDF  —  branch risk matrix
   * ═══════════════════════════════════════════════════════════ */

  async riskHeatmap(
    clientId: string,
    month?: string,
    clientName?: string,
  ): Promise<Buffer> {
    const branches = await this.pctSvc.clientBranchesPct(clientId, month);
    const doc = createDoc({ layout: 'landscape' });

    header(
      doc,
      'Risk Heatmap',
      `${clientName || 'Client'} — ${month || 'All Time'}`,
    );

    // Bucket branches by risk
    const critical = branches.filter((b) => b.riskLevel === 'CRITICAL');
    const high = branches.filter((b) => b.riskLevel === 'HIGH');
    const medium = branches.filter((b) => b.riskLevel === 'MEDIUM');
    const low = branches.filter((b) => b.riskLevel === 'LOW');

    kpiRow(doc, [
      { label: 'Critical', value: critical.length },
      { label: 'High', value: high.length },
      { label: 'Medium', value: medium.length },
      { label: 'Low', value: low.length },
      { label: 'Total Branches', value: branches.length },
    ]);

    divider(doc);
    doc.moveDown(0.5);

    // Full risk table
    sectionTitle(doc, 'Branch Risk Details');

    const cols: TableCol[] = [
      { header: 'Branch', key: 'branchName', width: 180 },
      { header: 'State', key: 'stateCode', width: 60 },
      { header: 'Compliance %', key: 'pct', width: 80, align: 'center' },
      { header: 'Overdue', key: 'overdue', width: 60, align: 'center' },
      { header: 'Risk', key: 'riskLevel', width: 80, align: 'center' },
    ];

    const sorted = [...critical, ...high, ...medium, ...low].map((b) => ({
      ...b,
      pct: `${b.compliancePct}%`,
    }));

    table(doc, cols, sorted);

    addPageNumbers(doc);
    return toBuffer(doc);
  }

  /* ═══════════════════════════════════════════════════════════
   *  4. DTSS (Due-Task Submission Status) Report PDF
   * ═══════════════════════════════════════════════════════════ */

  async dtssReport(
    _clientId: string,
    month: string,
    tasks: DtssTaskRow[],
    clientName?: string,
  ): Promise<Buffer> {
    const doc = createDoc();

    header(
      doc,
      'DTSS Report — Due Task Submission Status',
      `${clientName || 'Client'} — ${month}`,
    );

    // Summary KPIs
    const total = tasks.length;
    const submitted = tasks.filter((t) =>
      ['APPROVED', 'SUBMITTED'].includes(t.status),
    ).length;
    const pending = tasks.filter((t) => t.status === 'PENDING').length;
    const overdue = tasks.filter(
      (t) =>
        t.status === 'OVERDUE' ||
        (t.dueDate &&
          new Date(t.dueDate) < new Date() &&
          !['APPROVED', 'SUBMITTED'].includes(t.status)),
    ).length;
    const pct = total > 0 ? Math.round((submitted / total) * 1000) / 10 : 0;

    kpiRow(doc, [
      { label: 'Total Tasks', value: total },
      { label: 'Submitted', value: submitted },
      { label: 'Pending', value: pending },
      { label: 'Overdue', value: overdue },
      { label: 'Completion %', value: `${pct}%` },
    ]);

    divider(doc);
    doc.moveDown(0.5);

    // Task table
    sectionTitle(doc, 'Task Details');

    const cols: TableCol[] = [
      { header: 'Task', key: 'title', width: 140 },
      { header: 'Branch', key: 'branchName', width: 100 },
      { header: 'Law', key: 'lawName', width: 80 },
      { header: 'Frequency', key: 'frequency', width: 60 },
      { header: 'Due Date', key: 'dueDate', width: 70, align: 'center' },
      { header: 'Status', key: 'status', width: 65, align: 'center' },
    ];

    const rows = tasks.map((t) => ({
      title: t.title || t.taskName || '—',
      branchName: t.branchName || t.branch_name || '—',
      lawName: t.lawName || t.law_name || '—',
      frequency: t.frequency || '—',
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '—',
      status: t.status || '—',
    }));

    table(doc, cols, rows);

    addPageNumbers(doc);
    return toBuffer(doc);
  }
}
