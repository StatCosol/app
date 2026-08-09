import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import { MobileAttendancePunchEntity } from './punch.entity';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';
import { PunchDirectionService } from './punch-direction.service';

@Injectable()
export class PunchReviewService {
  constructor(
    @InjectRepository(MobileAttendancePunchEntity)
    private readonly punchRepo: Repository<MobileAttendancePunchEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly directionService: PunchDirectionService,
    private readonly dataSource: DataSource,
  ) {}

  async listReviewPunches(
    clientId: string,
    opts: { branchIds?: string[]; status?: string; limit?: number } = {},
  ): Promise<unknown[]> {
    const status = opts.status ?? 'REVIEW_PENDING';
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (opts.branchIds && opts.branchIds.length > 0) {
      params.push(opts.branchIds);
      branchFilter = `AND p.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(Math.min(500, Math.max(1, opts.limit ?? 100)));

    return this.dataSource.query(
      `SELECT p.id,
              'EMPLOYEE' AS "subjectType",
              p.employee_id AS "subjectId",
              e.name AS "subjectName",
              e.employee_code AS "subjectCode",
              p.branch_id AS "branchId",
              p.device_id AS "deviceId",
              p.punch_time AS "punchTime",
              p.match_cosine AS "matchCosine",
              p.match_threshold AS "matchThreshold",
              p.match_margin AS "matchMargin",
              p.liveness_score AS "livenessScore",
              p.photo_url AS "photoUrl",
              p.decision,
              p.review_note AS "reviewNote",
              p.reviewed_by AS "reviewedBy",
              p.reviewed_at AS "reviewedAt",
              p.created_at AS "createdAt"
         FROM mobile_attendance_punches p
         JOIN employees e ON e.id = p.employee_id
        WHERE p.client_id = $1 AND p.decision = $2 ${branchFilter}
        UNION ALL
       SELECT p.id,
              'CONTRACTOR' AS "subjectType",
              p.contractor_employee_id AS "subjectId",
              ce.name AS "subjectName",
              NULL AS "subjectCode",
              p.branch_id AS "branchId",
              p.device_id AS "deviceId",
              p.punch_time AS "punchTime",
              p.match_cosine AS "matchCosine",
              p.match_threshold AS "matchThreshold",
              p.match_margin AS "matchMargin",
              p.liveness_score AS "livenessScore",
              p.photo_url AS "photoUrl",
              p.decision,
              p.review_note AS "reviewNote",
              p.reviewed_by AS "reviewedBy",
              p.reviewed_at AS "reviewedAt",
              p.created_at AS "createdAt"
         FROM contractor_biometric_punches p
         JOIN contractor_employees ce ON ce.id = p.contractor_employee_id
        WHERE p.client_id = $1 AND p.decision = $2 ${branchFilter}
        ORDER BY "punchTime" DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  async reviewPunch(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    punchId: string,
    action: 'APPROVE' | 'REJECT',
    actorUserId: string,
    note?: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; decision: string }> {
    const newDecision =
      action === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED';

    if (subjectType === 'EMPLOYEE') {
      const punch = await this.punchRepo.findOne({
        where: { id: punchId, clientId },
      });
      if (!punch) throw new NotFoundException('Punch not found');
      this.assertBranchScope(punch, allowedBranchIds);
      if (punch.decision !== 'REVIEW_PENDING') {
        throw new BadRequestException(
          `Punch is not pending review (decision: ${punch.decision})`,
        );
      }

      await this.dataSource.transaction(async (manager) => {
        let direction: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
        if (action === 'APPROVE') {
          direction = await this.directionService.resolveNextPunchDirection(
            clientId,
            'EMPLOYEE',
            punch.employeeId,
            punch.punchTime,
            { endExclusive: punch.punchTime },
          );
        }
        await manager.getRepository(MobileAttendancePunchEntity).update(
          { id: punchId },
          {
            decision: newDecision,
            direction,
            reviewedBy: actorUserId,
            reviewedAt: new Date(),
            reviewNote: note ?? punch.reviewNote,
          },
        );
        if (action === 'APPROVE') {
          const [emp] = await manager.query<Array<{ employee_code: string }>>(
            `SELECT employee_code FROM employees WHERE id = $1`,
            [punch.employeeId],
          );
          await this.directionService.mirrorEmployeePunchToDailyAttendance(
            {
              clientId,
              branchId: punch.branchId,
              employeeCode: emp?.employee_code ?? punch.employeeId,
              punchTime: punch.punchTime,
              direction,
              deviceId: punch.deviceId,
              source: 'MOBILE_KIOSK',
            },
            manager,
          );
        }
      });
      return { ok: true, decision: newDecision };
    }

    const punch = await this.contractorPunchRepo.findOne({
      where: { id: punchId, clientId },
    });
    if (!punch) throw new NotFoundException('Punch not found');
    this.assertBranchScope(punch, allowedBranchIds);
    if (punch.decision !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Punch is not pending review (decision: ${punch.decision})`,
      );
    }
    let direction: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
    if (action === 'APPROVE') {
      direction = await this.directionService.resolveNextPunchDirection(
        clientId,
        'CONTRACTOR',
        punch.contractorEmployeeId,
        punch.punchTime,
        { endExclusive: punch.punchTime },
      );
    }
    await this.contractorPunchRepo.update(
      { id: punchId },
      {
        decision: newDecision,
        direction,
        reviewedBy: actorUserId,
        reviewedAt: new Date(),
        reviewNote: note ?? punch.reviewNote,
      },
    );
    return { ok: true, decision: newDecision };
  }

  async getPunchPhoto(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    punchId: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const punch =
      subjectType === 'EMPLOYEE'
        ? await this.punchRepo.findOne({ where: { id: punchId, clientId } })
        : await this.contractorPunchRepo.findOne({
            where: { id: punchId, clientId },
          });
    if (!punch) throw new NotFoundException('Punch not found');
    if (
      allowedBranchIds &&
      (!punch.branchId || !allowedBranchIds.includes(punch.branchId))
    ) {
      throw new NotFoundException('Punch not found');
    }
    return this.photoStorage.readPhoto(punch.photoUrl);
  }

  private assertBranchScope(
    punch: { branchId: string | null },
    allowedBranchIds: string[] | null,
  ): void {
    if (
      allowedBranchIds &&
      (!punch.branchId || !allowedBranchIds.includes(punch.branchId))
    ) {
      throw new NotFoundException('Punch not found');
    }
  }
}
