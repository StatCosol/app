import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  bufferToEmbedding,
  normalizeEmbeddingModel,
} from '../mobile-attendance/face/face-math';
import { FaceDeskFaceService, ResolvedFrame } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { pinLookupHash } from './facedesk-pin.util';
import { MarkAttendanceDto } from './facedesk.dto';
import { MarkResult } from './facedesk-attendance.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';
import { FaceDeskPunchAcceptService } from './facedesk-punch-accept.service';

const PIN_MAX_ATTEMPTS = Number(process.env.FD_PIN_MAX_ATTEMPTS ?? 5);

interface SubjectProfileRow {
  profileId: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  branchId: string | null;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  template: Buffer | null;
  model: string | null;
  pinHash: string | null;
}

const SUBJECT_PROFILE_SELECT = `
  SELECT p.profile_id AS "profileId",
         p.employee_id AS "employeeId",
         emp.employee_code AS "employeeCode",
         COALESCE(emp.name, con.name) AS "name",
         p.branch_id AS "branchId",
         p.subject_type AS "subjectType",
         p.face_template AS "template",
         p.embedding_model AS "model",
         p.attendance_pin_hash AS "pinHash"
    FROM facedesk_employee_face_profiles p
    LEFT JOIN employees emp
      ON p.subject_type = 'EMPLOYEE' AND emp.id = p.employee_id AND emp.client_id = p.client_id
    LEFT JOIN contractor_employees con
      ON p.subject_type = 'CONTRACTOR' AND con.id = p.employee_id AND con.client_id = p.client_id
`;

@Injectable()
export class FaceDeskPinAttendanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly faceService: FaceDeskFaceService,
    private readonly settings: FaceDeskSettingsService,
    private readonly failedAttemptService: FaceDeskFailedAttemptService,
    private readonly punchAcceptService: FaceDeskPunchAcceptService,
  ) {}

  async markByPin(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    eff: { acceptCosine: number; retryCosine: number; minMarginCosine: number },
    probe: Float32Array,
    probeModel: string | null,
    best3: ResolvedFrame[],
  ): Promise<MarkResult> {
    const code = (dto.employeeCode ?? '').trim();
    const pin = (dto.pin ?? '').trim();
    if (!pin) {
      await this.failedAttemptService.recordFailed(
        clientId,
        branchId,
        deviceId,
        null,
        null,
        'PIN_MISSING',
      );
      return { status: 'REJECTED', message: 'Enter your PIN' };
    }

    const release = await this.acquireDevicePinLock(
      clientId,
      deviceId,
      branchId,
    );
    try {
      return await this.resolvePinAttempt(
        clientId,
        branchId,
        deviceId,
        dto,
        eff,
        probe,
        probeModel,
        best3,
        code,
        pin,
      );
    } finally {
      await release();
    }
  }

  private async resolvePinAttempt(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    eff: { acceptCosine: number; retryCosine: number; minMarginCosine: number },
    probe: Float32Array,
    probeModel: string | null,
    best3: ResolvedFrame[],
    code: string,
    pin: string,
  ): Promise<MarkResult> {
    if (
      PIN_MAX_ATTEMPTS > 0 &&
      (await this.failedAttemptService.recentWrongPinCount(
        clientId,
        deviceId,
        branchId,
      )) >= PIN_MAX_ATTEMPTS
    ) {
      return {
        status: 'REJECTED',
        message: 'Too many incorrect PINs — please wait a few minutes.',
      };
    }

    let roster: SubjectProfileRow[];
    if (code) {
      const claimed = await this.loadClaimedProfile(clientId, branchId, code);
      roster = claimed ? [claimed] : [];
    } else {
      roster = await this.loadByPinLookup(
        clientId,
        branchId,
        pinLookupHash(clientId, pin),
      );
      if (roster.length === 0) {
        roster = await this.loadBranchPinRoster(clientId, branchId);
      }
    }
    if (roster.length === 0) {
      await this.failedAttemptService.recordFailed(
        clientId,
        branchId,
        deviceId,
        null,
        null,
        code ? 'UNKNOWN_CODE' : 'NO_ENROLLED',
      );
      return {
        status: 'REJECTED',
        message: code
          ? 'Employee code not recognized'
          : 'No enrolled employees on this device',
      };
    }

    const pinMatched: SubjectProfileRow[] = [];
    for (const p of roster) {
      if (p.pinHash && (await bcrypt.compare(pin, p.pinHash)))
        pinMatched.push(p);
    }
    if (pinMatched.length === 0) {
      await this.failedAttemptService.recordFailed(
        clientId,
        branchId,
        deviceId,
        null,
        null,
        'WRONG_PIN',
      );
      return { status: 'REJECTED', message: 'Incorrect PIN' };
    }

    let claimed: SubjectProfileRow | null = null;
    let cosine = -1;
    let runnerUpCosine = -1;
    for (const p of pinMatched) {
      const pm = normalizeEmbeddingModel(p.model);
      if (probeModel && pm && probeModel !== pm) continue;
      const gallery = await this.loadGalleryEmbeddings(p.profileId, p.template);
      if (gallery.length === 0) continue;
      let best = -1;
      for (const emb of gallery) {
        best = Math.max(best, this.faceService.cosine(probe, emb));
      }
      if (best > cosine) {
        if (claimed && claimed.employeeId !== p.employeeId) {
          runnerUpCosine = Math.max(runnerUpCosine, cosine);
        }
        cosine = best;
        claimed = p;
      } else if (claimed && p.employeeId !== claimed.employeeId) {
        runnerUpCosine = Math.max(runnerUpCosine, best);
      }
    }
    if (!claimed) {
      return {
        status: 'REJECTED',
        message: 'Face model mismatch — please re-enroll',
      };
    }
    const margin = runnerUpCosine >= 0 ? cosine - runnerUpCosine : 1;
    const ambiguous = margin < eff.minMarginCosine;
    const confidencePercent = this.settings.cosineToPercent(cosine);

    const subject = {
      employeeId: claimed.employeeId,
      employeeCode: claimed.employeeCode,
      name: claimed.name,
      branchId: claimed.branchId,
      subjectType: claimed.subjectType,
    };

    if (cosine < eff.retryCosine) {
      return this.punchAcceptService.acceptPunch(
        clientId,
        branchId,
        deviceId,
        dto,
        subject,
        cosine,
        margin,
        best3,
        confidencePercent,
        true,
      );
    }
    if (cosine < eff.acceptCosine) {
      return this.punchAcceptService.acceptPunch(
        clientId,
        branchId,
        deviceId,
        dto,
        subject,
        cosine,
        margin,
        best3,
        confidencePercent,
        true,
        'LOW_CONFIDENCE',
        `Low confidence match (${confidencePercent}%) — verify the captured photo.`,
      );
    }

    if (ambiguous) {
      await this.failedAttemptService.recordFailed(
        clientId,
        branchId,
        deviceId,
        claimed.employeeId,
        cosine,
        'AMBIGUOUS_MATCH',
      );
      return {
        status: 'RETRY',
        message:
          'Multiple close matches — please try again or contact your administrator.',
        confidencePercent,
      };
    }

    return this.punchAcceptService.acceptPunch(
      clientId,
      branchId,
      deviceId,
      dto,
      subject,
      cosine,
      margin,
      best3,
      confidencePercent,
    );
  }

  private async loadClaimedProfile(
    clientId: string,
    branchId: string | null,
    employeeCode: string,
  ): Promise<SubjectProfileRow | null> {
    const params: unknown[] = [clientId, employeeCode];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (p.branch_id = $3 OR p.branch_id IS NULL)`;
    }
    const [row] = await this.dataSource.query<SubjectProfileRow[]>(
      `${SUBJECT_PROFILE_SELECT}
        WHERE p.client_id = $1
          AND emp.employee_code = $2
          AND p.enrollment_status = 'ENROLLED'
          AND COALESCE(emp.is_active, con.is_active) = true
          ${branchFilter}
        LIMIT 1`,
      params,
    );
    return row ?? null;
  }

  private async loadBranchPinRoster(
    clientId: string,
    branchId: string | null,
  ): Promise<SubjectProfileRow[]> {
    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (p.branch_id = $2 OR p.branch_id IS NULL)`;
    }
    return this.dataSource.query(
      `${SUBJECT_PROFILE_SELECT}
        WHERE p.client_id = $1
          AND p.enrollment_status = 'ENROLLED'
          AND COALESCE(emp.is_active, con.is_active) = true
          AND p.attendance_pin_hash IS NOT NULL
          ${branchFilter}`,
      params,
    );
  }

  private async loadByPinLookup(
    clientId: string,
    branchId: string | null,
    lookup: string,
  ): Promise<SubjectProfileRow[]> {
    const params: unknown[] = [clientId, lookup];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (p.branch_id = $3 OR p.branch_id IS NULL)`;
    }
    return this.dataSource.query(
      `${SUBJECT_PROFILE_SELECT}
        WHERE p.client_id = $1
          AND p.attendance_pin_lookup = $2
          AND p.enrollment_status = 'ENROLLED'
          AND COALESCE(emp.is_active, con.is_active) = true
          AND p.attendance_pin_hash IS NOT NULL
          ${branchFilter}`,
      params,
    );
  }

  private async loadGalleryEmbeddings(
    profileId: string,
    template: Buffer | null,
  ): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    if (template && template.length > 0) out.push(bufferToEmbedding(template));
    const rows = await this.dataSource.query<Array<{ embedding: Buffer }>>(
      `SELECT embedding FROM facedesk_employee_face_samples
        WHERE profile_id = $1 AND embedding IS NOT NULL`,
      [profileId],
    );
    for (const r of rows) {
      if (r.embedding && r.embedding.length > 0) {
        out.push(bufferToEmbedding(r.embedding));
      }
    }
    return out;
  }

  private async acquireDevicePinLock(
    clientId: string,
    deviceId: string | null,
    branchId: string | null,
  ): Promise<() => Promise<void>> {
    const ds = this.dataSource as unknown as {
      createQueryRunner?: () => {
        connect: () => Promise<void>;
        query: (q: string, p?: unknown[]) => Promise<unknown>;
        release: () => Promise<void>;
      };
    };
    if (typeof ds.createQueryRunner !== 'function') {
      return async () => undefined;
    }
    const key = `fdpin:${clientId}:${deviceId ?? branchId ?? 'web'}`;
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    return async () => {
      try {
        await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
      } finally {
        await runner.release();
      }
    };
  }
}
