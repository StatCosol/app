import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PunchReviewService } from './punch-review.service';

export type FederatedReviewQueue =
  | 'MOBILE_BORDERLINE'
  | 'FACEDESK_VERIFICATION';

export interface FederatedReviewItem {
  queue: FederatedReviewQueue;
  itemId: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  displayName: string | null;
  displayCode: string | null;
  branchId: string | null;
  punchTime: string;
  status: string;
  issueLabel: string;
  portalPath: '/client/mobile-attendance' | '/client/facedesk';
}

export interface FederatedReviewSummary {
  mobileBorderlinePending: number;
  facedeskVerificationPending: number;
  totalPending: number;
}

export interface FederatedReviewResult {
  summary: FederatedReviewSummary;
  items: FederatedReviewItem[];
}

@Injectable()
export class AttendanceReviewFederationService {
  constructor(
    private readonly punchReview: PunchReviewService,
    private readonly dataSource: DataSource,
  ) {}

  async listFederated(
    clientId: string,
    opts: {
      includeMobile: boolean;
      includeFacedesk: boolean;
      branchIds?: string[] | null;
      mobileStatus?: string;
      facedeskStatus?: string;
      limit?: number;
    },
  ): Promise<FederatedReviewResult> {
    if (opts.branchIds?.length === 0) {
      return {
        summary: {
          mobileBorderlinePending: 0,
          facedeskVerificationPending: 0,
          totalPending: 0,
        },
        items: [],
      };
    }

    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const mobileStatus = opts.mobileStatus ?? 'REVIEW_PENDING';
    const facedeskStatus = opts.facedeskStatus ?? 'PENDING';

    const [mobileRows, facedeskRows, mobileCount, facedeskCount] =
      await Promise.all([
        opts.includeMobile
          ? this.punchReview.listReviewPunches(clientId, {
              status: mobileStatus,
              branchIds: opts.branchIds ?? undefined,
              limit,
            })
          : Promise.resolve([]),
        opts.includeFacedesk
          ? this.listFacedeskReviewRows(
              clientId,
              facedeskStatus,
              opts.branchIds ?? null,
              limit,
            )
          : Promise.resolve([]),
        opts.includeMobile
          ? this.countMobileReview(clientId, mobileStatus, opts.branchIds ?? null)
          : Promise.resolve(0),
        opts.includeFacedesk
          ? this.countFacedeskReview(
              clientId,
              facedeskStatus,
              opts.branchIds ?? null,
            )
          : Promise.resolve(0),
      ]);

    const items: FederatedReviewItem[] = [
      ...this.mapMobileRows(mobileRows as Record<string, unknown>[]),
      ...this.mapFacedeskRows(facedeskRows),
    ].sort(
      (a, b) =>
        new Date(b.punchTime).getTime() - new Date(a.punchTime).getTime(),
    );

    return {
      summary: {
        mobileBorderlinePending: mobileCount,
        facedeskVerificationPending: facedeskCount,
        totalPending: mobileCount + facedeskCount,
      },
      items: items.slice(0, limit),
    };
  }

  private mapMobileRows(
    rows: Record<string, unknown>[],
  ): FederatedReviewItem[] {
    return rows.map((row) => ({
      queue: 'MOBILE_BORDERLINE' as const,
      itemId: String(row.id),
      subjectType:
        String(row.subjectType || 'EMPLOYEE').toUpperCase() === 'CONTRACTOR'
          ? 'CONTRACTOR'
          : 'EMPLOYEE',
      displayName: (row.subjectName as string | null) ?? null,
      displayCode: (row.subjectCode as string | null) ?? null,
      branchId: (row.branchId as string | null) ?? null,
      punchTime: new Date(row.punchTime as string | Date).toISOString(),
      status: String(row.decision ?? 'REVIEW_PENDING'),
      issueLabel: 'Borderline 1:N face match',
      portalPath: '/client/mobile-attendance' as const,
    }));
  }

  private mapFacedeskRows(
    rows: Record<string, unknown>[],
  ): FederatedReviewItem[] {
    return rows.map((row) => ({
      queue: 'FACEDESK_VERIFICATION' as const,
      itemId: String(row.reviewId),
      subjectType:
        String(row.subjectType || 'EMPLOYEE').toUpperCase() === 'CONTRACTOR'
          ? 'CONTRACTOR'
          : 'EMPLOYEE',
      displayName: (row.employeeName as string | null) ?? null,
      displayCode: (row.employeeCode as string | null) ?? null,
      branchId: (row.branchId as string | null) ?? null,
      punchTime: new Date(row.punchTime as string | Date).toISOString(),
      status: String(row.status ?? 'PENDING'),
      issueLabel: String(row.issueType ?? 'PIN / face mismatch'),
      portalPath: '/client/facedesk' as const,
    }));
  }

  private async listFacedeskReviewRows(
    clientId: string,
    status: string,
    branchIds: string[] | null,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    if (branchIds?.length === 0) return [];
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND rq.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(limit);
    return this.dataSource.query(
      `SELECT rq.review_id AS "reviewId",
              CASE WHEN rq.contractor_punch_id IS NULL THEN 'EMPLOYEE' ELSE 'CONTRACTOR' END
                AS "subjectType",
              COALESCE(e.name, ce.name) AS "employeeName",
              e.employee_code AS "employeeCode",
              COALESCE(a.punch_time, cp.punch_time) AS "punchTime",
              rq.branch_id AS "branchId",
              rq.issue_type AS "issueType",
              rq.status AS "status"
         FROM facedesk_attendance_review_queue rq
         LEFT JOIN employees e ON e.id = rq.employee_id
         LEFT JOIN facedesk_attendance_logs a ON a.attendance_id = rq.attendance_id
         LEFT JOIN contractor_biometric_punches cp ON cp.id = rq.contractor_punch_id
         LEFT JOIN contractor_employees ce ON ce.id = cp.contractor_employee_id
        WHERE rq.client_id = $1 AND rq.status = $2 ${branchFilter}
        ORDER BY COALESCE(a.punch_time, cp.punch_time) DESC NULLS LAST
        LIMIT $${params.length}`,
      params,
    );
  }

  private async countMobileReview(
    clientId: string,
    status: string,
    branchIds: string[] | null,
  ): Promise<number> {
    if (branchIds?.length === 0) return 0;
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND branch_id = ANY($${params.length}::uuid[])`;
    }
    const [row] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT (
         (SELECT COUNT(*)::int FROM mobile_attendance_punches
           WHERE client_id = $1 AND decision = $2 ${branchFilter})
       + (SELECT COUNT(*)::int FROM contractor_biometric_punches
           WHERE client_id = $1 AND decision = $2 ${branchFilter})
       )::text AS n`,
      params,
    );
    return Number(row?.n ?? 0);
  }

  private async countFacedeskReview(
    clientId: string,
    status: string,
    branchIds: string[] | null,
  ): Promise<number> {
    if (branchIds?.length === 0) return 0;
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND branch_id = ANY($${params.length}::uuid[])`;
    }
    const [row] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT COUNT(*)::text AS n
         FROM facedesk_attendance_review_queue
        WHERE client_id = $1 AND status = $2 ${branchFilter}`,
      params,
    );
    return Number(row?.n ?? 0);
  }
}
