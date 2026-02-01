import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type OverrideMode =
  | 'AUTO'
  | 'MANUAL_APPLICABLE'
  | 'MANUAL_NOT_APPLICABLE';

@Injectable()
export class BranchComplianceOverrideService {
  constructor(private readonly ds: DataSource) {}

  async setOverride(params: {
    branchId: string;
    complianceId: string;
    mode: OverrideMode;
    reason?: string;
    userId: string;
  }) {
    const { branchId, complianceId, mode, reason, userId } = params;

    return this.ds.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM branch_compliances WHERE "branchId"=$1 AND "complianceId"=$2 FOR UPDATE`,
        [branchId, complianceId],
      );
      if (!rows.length) {
        throw new BadRequestException(
          'branch_compliances row not found. Run recompute first.',
        );
      }

      const prev = rows[0];
      const newIsApplicable =
        mode === 'MANUAL_APPLICABLE'
          ? true
          : mode === 'MANUAL_NOT_APPLICABLE'
            ? false
            : prev.isApplicable;

      await manager.query(
        `
        UPDATE branch_compliances
        SET
          "overrideMode"=$3,
          "isApplicable"=$4,
          "source"=CASE WHEN $3='AUTO' THEN "source" ELSE 'MANUAL' END,
          "reason"=CASE WHEN $3='AUTO' THEN "reason" ELSE COALESCE($5,'Manual override') END,
          "overriddenBy"=CASE WHEN $3='AUTO' THEN NULL ELSE $6 END,
          "overriddenAt"=CASE WHEN $3='AUTO' THEN NULL ELSE now() END,
          "overrideReason"=CASE WHEN $3='AUTO' THEN NULL ELSE $5 END,
          "lastUpdated"=now()
        WHERE "branchId"=$1 AND "complianceId"=$2
        `,
        [branchId, complianceId, mode, newIsApplicable, reason ?? null, userId],
      );

      await manager.query(
        `
        INSERT INTO branch_compliance_overrides_audit
        ("branchId","complianceId","oldOverrideMode","newOverrideMode","oldIsApplicable","newIsApplicable","reason","changedBy")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          branchId,
          complianceId,
          prev.overrideMode ?? 'AUTO',
          mode,
          prev.isApplicable,
          newIsApplicable,
          reason ?? null,
          userId,
        ],
      );

      return { ok: true, overrideMode: mode, isApplicable: newIsApplicable };
    });
  }
}
