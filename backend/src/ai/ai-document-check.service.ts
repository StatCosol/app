import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  AiDocumentCheckEntity,
  DocCheckResult,
} from './entities/ai-document-check.entity';
import { AiRequestLogService } from './ai-request-log.service';
import { AiCoreService } from './ai-core.service';

interface DocumentRow {
  id: string;
  document_name: string;
  document_type: string;
  file_url: string | null;
  expiry_date: string | null;
  upload_date: string | null;
  client_id: string | null;
  branch_id: string | null;
  contractor_user_id: string | null;
  required_document_id: string | null;
  coverage_from: string | null;
  coverage_to: string | null;
}

interface CheckIssue {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
}

interface SuggestedFix {
  action: string;
  description: string;
}

export interface DocumentCheckOutput {
  aiRequestId: string;
  documentId: string;
  documentName: string;
  documentType: string;
  result: DocCheckResult;
  issues: CheckIssue[];
  suggestedFixes: SuggestedFix[];
  aiAnalysis?: string;
}

const DOC_CHECK_SYSTEM_PROMPT = `You are a document compliance validator for StatCo, a labour-law compliance SaaS.
Given document metadata and detected issues, provide:
1. A summary assessment of the document's compliance status.
2. Any additional issues you detect from the metadata.
3. Suggested remediation steps.

Reply in JSON: {
  "additionalIssues": [{ "code": "...", "severity": "HIGH|MEDIUM|LOW", "message": "..." }],
  "suggestedFixes": [{ "action": "...", "description": "..." }],
  "summary": "..."
}`;

@Injectable()
export class AiDocumentCheckService {
  private readonly logger = new Logger(AiDocumentCheckService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AiDocumentCheckEntity)
    private readonly docCheckRepo: Repository<AiDocumentCheckEntity>,
    private readonly requestLog: AiRequestLogService,
    private readonly aiCore: AiCoreService,
  ) {}

  /** Run validation on a contractor document */
  async checkDocument(
    documentId: string,
    createdBy?: string,
  ): Promise<DocumentCheckOutput> {
    // 1. Fetch document from DB
    const doc = await this.fetchDocument(documentId);
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    // 2. Log request
    const request = await this.requestLog.createRequest({
      module: 'DOCUMENT',
      entityType: 'contractor_document',
      entityId: documentId,
      payload: {
        documentId,
        documentName: doc.document_name,
        documentType: doc.document_type,
      },
      createdBy,
    });

    try {
      await this.requestLog.updateRequestStatus(request.id, 'RUNNING');

      // 3. Rule-based checks
      const issues = this.runRuleChecks(doc);

      // 4. Determine result from rules
      let result: DocCheckResult = 'PASS';
      if (issues.some((i) => i.severity === 'HIGH')) result = 'FAIL';
      else if (issues.some((i) => i.severity === 'MEDIUM')) result = 'WARN';

      // 5. AI enhancement
      let suggestedFixes: SuggestedFix[] = [];
      let aiAnalysis: string | undefined;

      try {
        const userPrompt = `Document: ${doc.document_name}
Type: ${doc.document_type}
Upload Date: ${doc.upload_date || 'N/A'}
Expiry Date: ${doc.expiry_date || 'N/A'}
Coverage: ${doc.coverage_from || 'N/A'} to ${doc.coverage_to || 'N/A'}
File URL: ${doc.file_url ? 'Uploaded' : 'Missing'}
Rule-based issues found: ${JSON.stringify(issues)}

Assess this document and provide additional issues and suggested fixes.`;

        const aiResult = await this.aiCore.complete(
          DOC_CHECK_SYSTEM_PROMPT,
          userPrompt,
        );
        if (aiResult) {
          const parsed = JSON.parse(aiResult.content);

          if (parsed.additionalIssues?.length) {
            issues.push(...parsed.additionalIssues);
            // Re-evaluate result
            if (issues.some((i) => i.severity === 'HIGH')) result = 'FAIL';
            else if (issues.some((i) => i.severity === 'MEDIUM'))
              result = 'WARN';
          }
          suggestedFixes = parsed.suggestedFixes || [];
          aiAnalysis = parsed.summary;
        } else {
          suggestedFixes = this.fallbackFixes(issues);
        }
      } catch (aiErr) {
        this.logger.warn(
          `AI enhancement failed, using rule-only results: ${aiErr}`,
        );
        suggestedFixes = this.fallbackFixes(issues);
      }

      // 6. Persist check result
      const checkEntity = this.docCheckRepo.create({
        documentId,
        clientId: doc.client_id || null,
        branchId: doc.branch_id || null,
        documentType: doc.document_type,
        documentName: doc.document_name,
        issues,
        result,
        suggestedFix: suggestedFixes,
        aiRequestId: request.id,
      });
      await this.docCheckRepo.save(checkEntity);

      // 7. Log response
      const output: DocumentCheckOutput = {
        aiRequestId: request.id,
        documentId,
        documentName: doc.document_name,
        documentType: doc.document_type,
        result,
        issues,
        suggestedFixes,
        aiAnalysis,
      };

      await this.requestLog.completeRequest(request.id, output, {
        confidence: result === 'PASS' ? 0.95 : result === 'WARN' ? 0.8 : 0.9,
        model: 'gpt-4o-mini',
      });

      return output;
    } catch (err: unknown) {
      await this.requestLog.failRequest(request.id, (err as Error).message);
      throw err;
    }
  }

  /** Fetch document row from contractor_documents */
  private async fetchDocument(documentId: string): Promise<DocumentRow | null> {
    const rows = await this.dataSource.query(
      `SELECT cd.id, cd.document_name, cd.document_type,
              cd.file_url, cd.expiry_date, cd.upload_date,
              cd.client_id, cd.branch_id, cd.contractor_user_id,
              cd.required_document_id, cd.coverage_from, cd.coverage_to
       FROM contractor_documents cd
       WHERE cd.id = $1
       LIMIT 1`,
      [documentId],
    );
    return rows[0] || null;
  }

  /** Rule-based document checks */
  private runRuleChecks(doc: DocumentRow): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const now = new Date();

    // Check: document expired
    if (doc.expiry_date) {
      const expiry = new Date(doc.expiry_date);
      if (expiry < now) {
        issues.push({
          code: 'DOC_EXPIRED',
          severity: 'HIGH',
          message: `Document expired on ${doc.expiry_date}`,
        });
      } else {
        // Warn if expiring within 30 days
        const daysUntilExpiry = Math.ceil(
          (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntilExpiry <= 30) {
          issues.push({
            code: 'DOC_EXPIRING_SOON',
            severity: 'MEDIUM',
            message: `Document expires in ${daysUntilExpiry} days (${doc.expiry_date})`,
          });
        }
      }
    } else {
      // No expiry date set
      issues.push({
        code: 'MISSING_EXPIRY',
        severity: 'MEDIUM',
        message: 'Document has no expiry date set',
      });
    }

    // Check: file not uploaded
    if (!doc.file_url) {
      issues.push({
        code: 'NO_FILE',
        severity: 'HIGH',
        message: 'Document file has not been uploaded',
      });
    }

    // Check: coverage gap (if coverage_from/coverage_to exist)
    if (doc.coverage_from && doc.coverage_to) {
      const from = new Date(doc.coverage_from);
      const to = new Date(doc.coverage_to);
      if (to < now) {
        issues.push({
          code: 'COVERAGE_LAPSED',
          severity: 'HIGH',
          message: `Coverage period ended on ${doc.coverage_to}`,
        });
      }
      if (from > to) {
        issues.push({
          code: 'INVALID_COVERAGE',
          severity: 'HIGH',
          message: 'Coverage start date is after end date',
        });
      }
    }

    // Check: late upload (uploaded after coverage start or more than 30 days after coverage_from)
    if (doc.upload_date && doc.coverage_from) {
      const upload = new Date(doc.upload_date);
      const coverageStart = new Date(doc.coverage_from);
      const daysDiff = Math.ceil(
        (upload.getTime() - coverageStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysDiff > 30) {
        issues.push({
          code: 'LATE_UPLOAD',
          severity: 'LOW',
          message: `Document uploaded ${daysDiff} days after coverage start`,
        });
      }
    }

    return issues;
  }

  /** Generate simple fixes when AI is unavailable */
  private fallbackFixes(issues: CheckIssue[]): SuggestedFix[] {
    return issues.map((issue) => {
      switch (issue.code) {
        case 'DOC_EXPIRED':
          return {
            action: 'RENEW',
            description:
              'Renew the expired document and upload the new version',
          };
        case 'DOC_EXPIRING_SOON':
          return {
            action: 'RENEW_SOON',
            description: 'Initiate renewal process before expiry',
          };
        case 'MISSING_EXPIRY':
          return {
            action: 'SET_EXPIRY',
            description: 'Set the expiry date on the document record',
          };
        case 'NO_FILE':
          return { action: 'UPLOAD', description: 'Upload the document file' };
        case 'COVERAGE_LAPSED':
          return {
            action: 'EXTEND_COVERAGE',
            description: 'Extend or renew coverage period',
          };
        case 'INVALID_COVERAGE':
          return {
            action: 'FIX_DATES',
            description: 'Correct the coverage dates',
          };
        case 'LATE_UPLOAD':
          return {
            action: 'NOTE',
            description:
              'Document was uploaded late; ensure timely uploads going forward',
          };
        default:
          return { action: 'REVIEW', description: issue.message };
      }
    });
  }

  /** List recent document checks */
  async listChecks(opts: {
    clientId?: string;
    branchId?: string;
    result?: string;
    limit?: number;
  }): Promise<AiDocumentCheckEntity[]> {
    const qb = this.docCheckRepo.createQueryBuilder('dc');
    if (opts.clientId)
      qb.andWhere('dc.clientId = :cid', { cid: opts.clientId });
    if (opts.branchId)
      qb.andWhere('dc.branchId = :bid', { bid: opts.branchId });
    if (opts.result) qb.andWhere('dc.result = :r', { r: opts.result });
    return qb
      .orderBy('dc.createdAt', 'DESC')
      .take(opts.limit || 50)
      .getMany();
  }
}
