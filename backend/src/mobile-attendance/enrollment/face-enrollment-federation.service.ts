import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type FaceDeskEnrollmentStatus =
  | 'PENDING'
  | 'ENROLLED'
  | 'BLOCKED'
  | 'DEACTIVATED';

export type FederatedEnrollmentOverallStatus =
  | 'FULLY_ENROLLED'
  | 'PARTIAL'
  | 'PENDING'
  | 'DEACTIVATED';

export interface FederatedEnrollmentMobileState {
  isEnrolled: boolean;
  isActive: boolean;
  embeddingModel: string | null;
  enrolledAt: string | null;
  portalPath: '/client/mobile-attendance?tab=status';
}

export interface FederatedEnrollmentFaceDeskState {
  enrollmentStatus: FaceDeskEnrollmentStatus;
  enrolledAt: string | null;
  portalPath: '/client/facedesk?tab=pending';
}

export interface FederatedEnrollmentItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  mobile: FederatedEnrollmentMobileState | null;
  facedesk: FederatedEnrollmentFaceDeskState | null;
  overallStatus: FederatedEnrollmentOverallStatus;
}

export interface FederatedEnrollmentSummary {
  totalEmployees: number;
  mobileEnrolledActive: number;
  facedeskEnrolled: number;
  bothEnrolled: number;
  pendingEither: number;
}

export interface FederatedEnrollmentResult {
  summary: FederatedEnrollmentSummary;
  items: FederatedEnrollmentItem[];
  hasMore?: boolean;
}

@Injectable()
export class FaceEnrollmentFederationService {
  constructor(private readonly dataSource: DataSource) {}

  async listFederated(
    clientId: string,
    opts: {
      includeMobile: boolean;
      includeFacedesk: boolean;
      branchIds?: string[] | null;
      limit?: number;
      offset?: number;
    },
  ): Promise<FederatedEnrollmentResult> {
    if (opts.branchIds?.length === 0) {
      return this.emptyResult();
    }

    const branchIds = opts.branchIds ?? null;
    const limit =
      opts.limit !== undefined
        ? Math.max(1, Math.floor(opts.limit))
        : undefined;
    const offset =
      opts.offset !== undefined ? Math.max(0, Math.floor(opts.offset)) : 0;

    if (limit !== undefined) {
      const [summary, rows] = await Promise.all([
        this.fetchSummary(
          clientId,
          opts.includeMobile,
          opts.includeFacedesk,
          branchIds,
        ),
        this.listRows(
          clientId,
          opts.includeMobile,
          opts.includeFacedesk,
          branchIds,
          limit + 1,
          offset,
        ),
      ]);
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const items = pageRows.map((row) => this.mapRow(row, opts));
      return {
        summary,
        items,
        ...(hasMore ? { hasMore: true } : {}),
      };
    }

    const rows = await this.listRows(
      clientId,
      opts.includeMobile,
      opts.includeFacedesk,
      branchIds,
    );
    const items = rows.map((row) => this.mapRow(row, opts));
    return {
      summary: this.buildSummary(items, opts),
      items,
    };
  }

  private emptyResult(): FederatedEnrollmentResult {
    return {
      summary: {
        totalEmployees: 0,
        mobileEnrolledActive: 0,
        facedeskEnrolled: 0,
        bothEnrolled: 0,
        pendingEither: 0,
      },
      items: [],
    };
  }

  private joinClause(
    includeMobile: boolean,
    includeFacedesk: boolean,
  ): { mobileJoin: string; facedeskJoin: string } {
    const mobileJoin = includeMobile
      ? `LEFT JOIN face_enrollments fe
           ON fe.employee_id = e.id
          AND fe.client_id = e.client_id`
      : '';
    const facedeskJoin = includeFacedesk
      ? `LEFT JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id
          AND p.client_id = e.client_id`
      : '';
    return { mobileJoin, facedeskJoin };
  }

  private branchFilter(params: unknown[], branchIds: string[] | null): string {
    if (!branchIds || branchIds.length === 0) return '';
    params.push(branchIds);
    return ` AND e.branch_id = ANY($${params.length}::uuid[])`;
  }

  private async fetchSummary(
    clientId: string,
    includeMobile: boolean,
    includeFacedesk: boolean,
    branchIds: string[] | null,
  ): Promise<FederatedEnrollmentSummary> {
    const params: unknown[] = [clientId];
    const branchFilter = this.branchFilter(params, branchIds);
    const { mobileJoin, facedeskJoin } = this.joinClause(
      includeMobile,
      includeFacedesk,
    );

    const mobileActiveExpr = includeMobile
      ? `fe.employee_id IS NOT NULL AND COALESCE(fe.is_active, false)`
      : 'FALSE';
    const facedeskEnrolledExpr = includeFacedesk
      ? `COALESCE(p.enrollment_status, 'PENDING') = 'ENROLLED'`
      : 'FALSE';

    const [row] = await this.dataSource.query<
      Array<{
        totalEmployees: number;
        mobileEnrolledActive: number;
        facedeskEnrolled: number;
        bothEnrolled: number;
        pendingEither: number;
      }>
    >(
      `SELECT COUNT(*)::int AS "totalEmployees",
              COUNT(*) FILTER (WHERE ${mobileActiveExpr})::int AS "mobileEnrolledActive",
              COUNT(*) FILTER (WHERE ${facedeskEnrolledExpr})::int AS "facedeskEnrolled",
              COUNT(*) FILTER (WHERE ${mobileActiveExpr} AND ${facedeskEnrolledExpr})::int AS "bothEnrolled",
              COUNT(*) FILTER (
                WHERE NOT (${mobileActiveExpr} AND ${facedeskEnrolledExpr})
                  AND NOT (
                    ${includeMobile ? `fe.employee_id IS NOT NULL AND NOT COALESCE(fe.is_active, false)` : 'FALSE'}
                    AND ${includeFacedesk ? `COALESCE(p.enrollment_status, 'PENDING') IN ('DEACTIVATED', 'BLOCKED')` : 'FALSE'}
                    AND NOT ${facedeskEnrolledExpr}
                    AND NOT ${mobileActiveExpr}
                  )
              )::int AS "pendingEither"
         FROM employees e
         ${mobileJoin}
         ${facedeskJoin}
        WHERE e.client_id = $1
          AND e.is_active = TRUE
          ${branchFilter}`,
      params,
    );

    return (
      row ?? {
        totalEmployees: 0,
        mobileEnrolledActive: 0,
        facedeskEnrolled: 0,
        bothEnrolled: 0,
        pendingEither: 0,
      }
    );
  }

  private async listRows(
    clientId: string,
    includeMobile: boolean,
    includeFacedesk: boolean,
    branchIds: string[] | null,
    limit?: number,
    offset = 0,
  ): Promise<
    Array<{
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      branchId: string | null;
      mobileIsEnrolled: boolean;
      mobileIsActive: boolean;
      mobileEmbeddingModel: string | null;
      mobileEnrolledAt: Date | null;
      facedeskStatus: FaceDeskEnrollmentStatus | null;
      facedeskEnrolledAt: Date | null;
    }>
  > {
    const params: unknown[] = [clientId];
    const branchFilter = this.branchFilter(params, branchIds);
    const { mobileJoin, facedeskJoin } = this.joinClause(
      includeMobile,
      includeFacedesk,
    );

    const mobileSelect = includeMobile
      ? `fe.employee_id IS NOT NULL AS "mobileIsEnrolled",
         COALESCE(fe.is_active, false) AS "mobileIsActive",
         fe.embedding_model AS "mobileEmbeddingModel",
         fe.enrolled_at AS "mobileEnrolledAt"`
      : `false AS "mobileIsEnrolled",
         false AS "mobileIsActive",
         NULL::text AS "mobileEmbeddingModel",
         NULL::timestamptz AS "mobileEnrolledAt"`;

    const facedeskSelect = includeFacedesk
      ? `COALESCE(p.enrollment_status, 'PENDING') AS "facedeskStatus",
         p.consent_given_at AS "facedeskEnrolledAt"`
      : `NULL::varchar AS "facedeskStatus",
         NULL::timestamptz AS "facedeskEnrolledAt"`;

    let pagination = '';
    if (limit !== undefined) {
      pagination = ` LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`;
    }

    return this.dataSource.query(
      `SELECT e.id AS "employeeId",
              e.employee_code AS "employeeCode",
              e.name AS "employeeName",
              e.branch_id AS "branchId",
              ${mobileSelect},
              ${facedeskSelect}
         FROM employees e
         ${mobileJoin}
         ${facedeskJoin}
        WHERE e.client_id = $1
          AND e.is_active = TRUE
          ${branchFilter}
        ORDER BY e.employee_code ASC
        ${pagination}`,
      params,
    );
  }

  private mapRow(
    row: {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      branchId: string | null;
      mobileIsEnrolled: boolean;
      mobileIsActive: boolean;
      mobileEmbeddingModel: string | null;
      mobileEnrolledAt: Date | null;
      facedeskStatus: FaceDeskEnrollmentStatus | null;
      facedeskEnrolledAt: Date | null;
    },
    opts: { includeMobile: boolean; includeFacedesk: boolean },
  ): FederatedEnrollmentItem {
    const mobile = opts.includeMobile
      ? {
          isEnrolled: Boolean(row.mobileIsEnrolled),
          isActive: Boolean(row.mobileIsActive),
          embeddingModel: row.mobileEmbeddingModel,
          enrolledAt: row.mobileEnrolledAt
            ? new Date(row.mobileEnrolledAt).toISOString()
            : null,
          portalPath: '/client/mobile-attendance?tab=status' as const,
        }
      : null;

    const facedesk = opts.includeFacedesk
      ? {
          enrollmentStatus: row.facedeskStatus ?? 'PENDING',
          enrolledAt: row.facedeskEnrolledAt
            ? new Date(row.facedeskEnrolledAt).toISOString()
            : null,
          portalPath: '/client/facedesk?tab=pending' as const,
        }
      : null;

    return {
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      branchId: row.branchId,
      mobile,
      facedesk,
      overallStatus: this.computeOverallStatus(mobile, facedesk),
    };
  }

  private computeOverallStatus(
    mobile: FederatedEnrollmentMobileState | null,
    facedesk: FederatedEnrollmentFaceDeskState | null,
  ): FederatedEnrollmentOverallStatus {
    const mobileEnrolled = Boolean(mobile?.isEnrolled && mobile?.isActive);
    const facedeskEnrolled = facedesk?.enrollmentStatus === 'ENROLLED';
    const mobileDeactivated = Boolean(mobile?.isEnrolled && !mobile?.isActive);
    const facedeskDeactivated =
      facedesk?.enrollmentStatus === 'DEACTIVATED' ||
      facedesk?.enrollmentStatus === 'BLOCKED';

    if (mobile && facedesk) {
      if (mobileEnrolled && facedeskEnrolled) return 'FULLY_ENROLLED';
      if (mobileEnrolled || facedeskEnrolled) return 'PARTIAL';
      if (mobileDeactivated && facedeskDeactivated) return 'DEACTIVATED';
      return 'PENDING';
    }

    if (mobile) {
      if (mobileEnrolled) return 'FULLY_ENROLLED';
      if (mobileDeactivated) return 'DEACTIVATED';
      return 'PENDING';
    }

    if (facedesk) {
      if (facedeskEnrolled) return 'FULLY_ENROLLED';
      if (facedeskDeactivated) return 'DEACTIVATED';
      return 'PENDING';
    }

    return 'PENDING';
  }

  private buildSummary(
    items: FederatedEnrollmentItem[],
    opts: { includeMobile: boolean; includeFacedesk: boolean },
  ): FederatedEnrollmentSummary {
    let mobileEnrolledActive = 0;
    let facedeskEnrolled = 0;
    let bothEnrolled = 0;
    let pendingEither = 0;

    for (const item of items) {
      const mobileActive = Boolean(
        item.mobile?.isEnrolled && item.mobile?.isActive,
      );
      const facedeskOk = item.facedesk?.enrollmentStatus === 'ENROLLED';

      if (opts.includeMobile && mobileActive) mobileEnrolledActive += 1;
      if (opts.includeFacedesk && facedeskOk) facedeskEnrolled += 1;
      if (
        opts.includeMobile &&
        opts.includeFacedesk &&
        mobileActive &&
        facedeskOk
      ) {
        bothEnrolled += 1;
      }
      if (
        item.overallStatus === 'PENDING' ||
        item.overallStatus === 'PARTIAL'
      ) {
        pendingEither += 1;
      }
    }

    return {
      totalEmployees: items.length,
      mobileEnrolledActive,
      facedeskEnrolled,
      bothEnrolled,
      pendingEither,
    };
  }
}
