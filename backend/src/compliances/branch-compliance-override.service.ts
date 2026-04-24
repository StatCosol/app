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
        `SELECT * FROM branch_compliances WHERE branch_id=$1 AND compliance_id=$2 FOR UPDATE`,
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
            : prev.is_applicable;

      await manager.query(
        `
        UPDATE branch_compliances
        SET
          override_mode=$3,
          is_applicable=$4,
          source=CASE WHEN $3='AUTO' THEN source ELSE 'MANUAL' END,
          reason=CASE WHEN $3='AUTO' THEN reason ELSE COALESCE($5,'Manual override') END,
          overridden_by=CASE WHEN $3='AUTO' THEN NULL ELSE $6 END,
          overridden_at=CASE WHEN $3='AUTO' THEN NULL ELSE now() END,
          override_reason=CASE WHEN $3='AUTO' THEN NULL ELSE $5 END,
          last_updated=now()
        WHERE branch_id=$1 AND compliance_id=$2
        `,
        [branchId, complianceId, mode, newIsApplicable, reason ?? null, userId],
      );

      await manager.query(
        `
        INSERT INTO branch_compliance_overrides_audit
        (branch_id, compliance_id, old_override_mode, new_override_mode, old_is_applicable, new_is_applicable, reason, changed_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          branchId,
          complianceId,
          prev.override_mode ?? 'AUTO',
          mode,
          prev.is_applicable,
          newIsApplicable,
          reason ?? null,
          userId,
        ],
      );

      return { ok: true, overrideMode: mode, isApplicable: newIsApplicable };
    });
  }
}
