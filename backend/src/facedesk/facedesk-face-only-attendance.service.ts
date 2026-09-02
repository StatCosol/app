import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarkAttendanceDto } from './facedesk.dto';
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';
import { FaceDeskPunchAcceptService } from './facedesk-punch-accept.service';
import { MarkResult } from './facedesk-attendance.service';
import { ResolvedFrame } from './facedesk-face.service';

/**
 * FACE_ONLY attendance: no PIN, identify 1:N from the face alone.
 *
 * This is a materially harder problem than PIN_THEN_FACE, and the difference is
 * worth stating because the failure is silent. With a PIN the worker asserts who
 * they are and the face only has to agree; a wrong answer usually means a
 * refused punch. Without one, the system picks someone out of the whole gallery,
 * and a wrong answer marks the wrong person present — and pays them.
 *
 * So this path is served ONLY by Azure identification, and it fails closed.
 * The on-device matcher is never consulted: the duplicate-threshold comment in
 * facedesk-settings.service.ts records what happened when 192-d MobileFaceNet
 * embeddings were asked to separate people — "several different employees all
 * matched the same one or two profiles at 0.73-0.84". Falling back to that would
 * turn an outage into misattributed attendance, which is worse than no punch.
 *
 * Consequences the operator should know, rather than discover:
 *  - no network, no punch (offline queueing does not apply to FACE_ONLY);
 *  - a client whose Azure face list is not populated identifies nobody;
 *  - Azure is called on every punch, not just at enrolment, which is a very
 *    different cost profile.
 */
@Injectable()
export class FaceDeskFaceOnlyAttendanceService {
  private readonly logger = new Logger(FaceDeskFaceOnlyAttendanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly azureFace: FaceDeskAzureFaceService,
    private readonly failedAttemptService: FaceDeskFailedAttemptService,
    private readonly punchAcceptService: FaceDeskPunchAcceptService,
  ) {}

  async markByFace(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    best3: ResolvedFrame[],
  ): Promise<MarkResult> {
    const photoB64 = dto.frames?.find((f) => f.photoB64)?.photoB64 ?? null;
    if (!photoB64) {
      // Azure identifies from the image, not from a device embedding. A kiosk
      // configured for FACE_ONLY must send one.
      await this.record(clientId, branchId, deviceId, 'FACE_NOT_DETECTED');
      return { status: 'REJECTED', message: 'No usable photo captured' };
    }

    if (!this.azureFace.enabled) {
      // Refusing is the point. There is no safe local answer to "who is this?".
      this.logger.warn(
        'FACE_ONLY punch attempted while Azure identification is unavailable',
      );
      await this.record(clientId, branchId, deviceId, 'AZURE_UNAVAILABLE');
      return {
        status: 'REJECTED',
        message: 'Face recognition is unavailable — please try again shortly',
      };
    }

    const hit = await this.azureFace.identifyForAttendance(clientId, photoB64);
    if (!hit) {
      // Covers not-recognised, below-threshold, and too-close-to-call alike.
      // They are the same answer to the worker, and each is a refusal.
      await this.record(clientId, branchId, deviceId, 'NO_MATCH');
      return { status: 'REJECTED', message: 'Face not recognised' };
    }

    const [subject] = await this.dataSource.query(
      `SELECT p.employee_id AS "employeeId",
              COALESCE(emp.employee_code, con.employee_code) AS "employeeCode",
              COALESCE(emp.name, con.name) AS "name",
              p.branch_id AS "branchId",
              p.subject_type AS "subjectType"
         FROM facedesk_employee_face_profiles p
         LEFT JOIN employees emp
           ON p.subject_type = 'EMPLOYEE' AND emp.id = p.employee_id
          AND emp.client_id = p.client_id
         LEFT JOIN contractor_employees con
           ON p.subject_type = 'CONTRACTOR' AND con.id = p.employee_id
          AND con.client_id = p.client_id
        WHERE p.client_id = $1 AND p.employee_id = $2
          AND p.enrollment_status = 'ENROLLED'
        LIMIT 1`,
      [clientId, hit.employeeId],
    );
    if (!subject) {
      // Azure knew the face but the profile is gone or no longer enrolled.
      await this.record(clientId, branchId, deviceId, 'NO_MATCH');
      return { status: 'REJECTED', message: 'Face not recognised' };
    }

    // Azure confidence and margin stand in for cosine and margin here. They are
    // a different scale, and are recorded so a punch can be audited on the
    // numbers that actually decided it.
    return this.punchAcceptService.acceptPunch(
      clientId,
      branchId,
      deviceId,
      dto,
      {
        employeeId: subject.employeeId,
        employeeCode: subject.employeeCode ?? '',
        name: subject.name ?? '',
        branchId: subject.branchId ?? null,
        subjectType: subject.subjectType,
      },
      hit.confidence,
      hit.margin,
      best3,
      Math.round(hit.confidence * 100),
    );
  }

  private record(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    reason: string,
  ): Promise<unknown> {
    return this.failedAttemptService
      .recordFailed(clientId, branchId, deviceId, null, null, reason)
      .catch(() => undefined);
  }
}
