import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  averageEmbeddings,
  bufferToEmbedding,
  embeddingToBuffer,
  normalizeEmbeddingModel,
} from '../mobile-attendance/face/face-math';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import {
  FaceDeskAttendanceEntity,
  FaceDeskFailedAttemptEntity,
  FaceDeskReviewQueueEntity,
} from './entities/facedesk.entities';
import { FaceDeskFaceService, ResolvedFrame } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { pinLookupHash } from './facedesk-pin.util';
import { MarkAttendanceDto } from './facedesk.dto';

// Business-day boundary offset in minutes (default +330 = IST). Env-tunable so
// a non-India deployment can set its own day boundary without a code change.
const BUSINESS_TZ_OFFSET_MIN = Number(
  process.env.FD_BUSINESS_TZ_OFFSET_MIN ?? 330,
);
const FACE_DESK_WEB_DEVICE_ID = '00000000-0000-0000-0000-000000000000';

// PIN brute-force throttle: after this many WRONG_PIN failures on a device
// within the window, further PIN attempts are refused until it elapses.
// FD_PIN_MAX_ATTEMPTS=0 disables the throttle.
const PIN_MAX_ATTEMPTS = Number(process.env.FD_PIN_MAX_ATTEMPTS ?? 5);
const PIN_LOCKOUT_MIN = Number(process.env.FD_PIN_LOCKOUT_MIN ?? 5);

// When true, the client-asserted `livenessPassed` flag is NOT trusted — a punch
// must carry a server-scored liveness frame at or above the floor. Off by
// default (the on-device blink detector remains the primary signal).
const REQUIRE_SERVER_LIVENESS =
  (process.env.FD_REQUIRE_SERVER_LIVENESS ?? 'false').toLowerCase() === 'true';
const SERVER_LIVENESS_MIN = Number(process.env.FD_SERVER_LIVENESS_MIN ?? 0.5);

/** A resolved FaceDesk profile with the subject's identity from either roster. */
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

/**
 * Shared SELECT + FROM for resolving a FaceDesk profile to its subject.
 * A profile's employee_id is an employees.id or a contractor_employees.id
 * depending on subject_type; join both rosters and COALESCE the identity so
 * employees and contractors resolve through one path.
 */
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

export interface MarkResult {
  status: 'MARKED' | 'RETRY' | 'REJECTED' | 'REVIEW';
  message: string;
  employeeName?: string;
  employeeCode?: string;
  punchType?: 'IN' | 'OUT';
  punchTime?: string;
  branchId?: string | null;
  confidencePercent?: number;
}

@Injectable()
export class FaceDeskAttendanceService {
  private readonly logger = new Logger(FaceDeskAttendanceService.name);

  constructor(
    @InjectRepository(FaceDeskAttendanceEntity)
    private readonly attRepo: Repository<FaceDeskAttendanceEntity>,
    @InjectRepository(FaceDeskFailedAttemptEntity)
    private readonly failRepo: Repository<FaceDeskFailedAttemptEntity>,
    @InjectRepository(FaceDeskReviewQueueEntity)
    private readonly reviewRepo: Repository<FaceDeskReviewQueueEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly faceService: FaceDeskFaceService,
    private readonly settings: FaceDeskSettingsService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly dataSource: DataSource,
  ) {}

  private businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
    const offsetMs = BUSINESS_TZ_OFFSET_MIN * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    const startLocalUtcMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
    const start = new Date(startLocalUtcMs - offsetMs);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  private async nextPunchType(
    clientId: string,
    employeeId: string,
    at: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(at);
    // Toggle off the most recent counted punch of the day rather than parity of
    // the count. When a mid-day punch is later rejected, count-parity would flip
    // every subsequent punch's IN/OUT; keying off the last surviving punch keeps
    // direction stable and intuitive ("opposite of what they last did").
    const [row] = await this.dataSource.query<Array<{ punch_type: string }>>(
      `SELECT punch_type FROM facedesk_attendance_logs
        WHERE client_id = $1 AND employee_id = $2
          AND punch_time >= $3 AND punch_time < $4
          AND attendance_status IN ('MARKED','APPROVED')
        ORDER BY punch_time DESC LIMIT 1`,
      [clientId, employeeId, start, end],
    );
    return row?.punch_type === 'IN' ? 'OUT' : 'IN';
  }

  /** IN/OUT for a contractor, toggling off the last counted punch of the day. */
  private async nextContractorDirection(
    clientId: string,
    contractorEmployeeId: string,
    at: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(at);
    const [row] = await this.dataSource.query<Array<{ direction: string }>>(
      `SELECT direction FROM contractor_biometric_punches
        WHERE client_id = $1 AND contractor_employee_id = $2
          AND punch_time >= $3 AND punch_time < $4
          AND decision IN ('AUTO','REVIEW_APPROVED')
        ORDER BY punch_time DESC LIMIT 1`,
      [clientId, contractorEmployeeId, start, end],
    );
    return row?.direction === 'IN' ? 'OUT' : 'IN';
  }

  async markAttendance(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
  ): Promise<MarkResult> {
    const eff = await this.settings.getEffective(clientId);

    // Offline dedupe: same client + offlineRef already recorded → idempotent OK.
    if (dto.offlineRef) {
      const existing = await this.attRepo.findOne({
        where: { clientId, offlineRef: dto.offlineRef },
      });
      if (existing) {
        return {
          status: 'MARKED',
          message: 'Attendance already recorded',
          punchType: existing.punchType as 'IN' | 'OUT',
          punchTime: existing.punchTime.toISOString(),
        };
      }
      const existingContractorPunch = await this.contractorPunchRepo.findOne({
        where: { clientId, offlineRef: dto.offlineRef },
      });
      if (existingContractorPunch) {
        return this.contractorPunchResult(
          existingContractorPunch,
          'Attendance already recorded',
        );
      }
    }

    const resolved = await this.faceService.resolveFrames(dto.frames);
    const good = this.faceService.goodFrames(resolved);
    if (good.length === 0) {
      await this.recordFailed(
        clientId,
        branchId,
        deviceId,
        null,
        null,
        'NO_FACE',
      );
      return {
        status: 'REJECTED',
        message: 'Face not clear — please look at the camera',
      };
    }

    if (eff.livenessRequired) {
      const serverLive = good.some(
        (f) => (f.livenessScore ?? 0) >= SERVER_LIVENESS_MIN,
      );
      // Default: trust the on-device blink flag OR a server-scored frame. When
      // FD_REQUIRE_SERVER_LIVENESS is set, ignore the client flag entirely so a
      // modified/old APK can't assert liveness it never checked.
      const livenessOk = REQUIRE_SERVER_LIVENESS
        ? serverLive
        : dto.livenessPassed === true || serverLive;
      if (!livenessOk) {
        await this.recordFailed(
          clientId,
          branchId,
          deviceId,
          null,
          null,
          'LIVENESS_FAILED',
        );
        return {
          status: 'REJECTED',
          message: 'Liveness check failed — please blink',
        };
      }
    }

    const best3 = this.faceService.bestFrames(good, 3);
    const probe = averageEmbeddings(best3.map((f) => f.embedding));
    const probeModel = normalizeEmbeddingModel(best3[0]?.model ?? null);

    // PIN + 1:1 face verification is mandatory for EVERY FaceDesk punch —
    // live and offline sync alike. A punch without code + PIN can't be
    // trusted: an old face-only APK, or a direct submission to the
    // offline-sync endpoint, could otherwise omit credentials and bypass the
    // PIN requirement indefinitely. markByPin rejects a credential-less punch
    // (PIN_MISSING), so the legacy 1:N face-only path is gone entirely.
    return this.markByPin(
      clientId,
      branchId,
      deviceId,
      dto,
      eff,
      probe,
      probeModel,
      best3,
    );
  }

  /** Persist an accepted punch (shared by the PIN accept + mismatch-flag paths). */
  private async acceptPunch(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    employee: {
      employeeId: string;
      employeeCode: string;
      name: string;
      branchId: string | null;
      subjectType: 'EMPLOYEE' | 'CONTRACTOR';
    },
    cosine: number,
    margin: number,
    best3: ResolvedFrame[],
    confidencePercent: number,
    flagForReview = false,
    reviewReason?: string,
  ): Promise<MarkResult> {
    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();
    const resolvedBranchId = employee.branchId ?? branchId;
    const livenessScore =
      best3.find((f) => f.livenessScore != null)?.livenessScore ?? null;
    // Keep the captured face on a flagged (mismatch) punch so HR approval can
    // fold it into the subject's gallery (point 4). Only needed when flagging.
    const probeEmbedding = flagForReview
      ? embeddingToBuffer(averageEmbeddings(best3.map((f) => f.embedding)))
      : null;
    // On a flagged punch the photo IS the reviewer's evidence, so upload with a
    // retry; a single transient blob hiccup shouldn't leave the branch with a
    // "verify the photo" task and no photo.
    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.uploadPhotoWithRetry(
        dto.photoB64,
        clientId,
        employee.employeeId,
        flagForReview,
      );
    }
    // Review note is photo-aware: if the evidence photo is missing, say so
    // rather than telling the reviewer to check a photo that isn't there.
    const reviewBase =
      reviewReason ??
      `PIN correct but face did not match (${confidencePercent}%).`;
    const reviewRemark = photoUrl
      ? `${reviewBase} Verify the captured photo.`
      : `${reviewBase} ⚠ Captured photo unavailable — verify by other means.`;

    // Contractors punch into the contractor attendance pipeline
    // (contractor_biometric_punches → contractor payroll), NOT the employee
    // facedesk logs — otherwise their time would land in employee payroll.
    if (employee.subjectType === 'CONTRACTOR') {
      const direction = await this.nextContractorDirection(
        clientId,
        employee.employeeId,
        punchTime,
      );
      let savedContractorPunch: ContractorBiometricPunchEntity;
      try {
        savedContractorPunch = await this.contractorPunchRepo.save({
          clientId,
          branchId: resolvedBranchId,
          deviceId: deviceId ?? FACE_DESK_WEB_DEVICE_ID,
          contractorEmployeeId: employee.employeeId,
          direction,
          punchTime,
          matchCosine: cosine,
          matchMargin: margin,
          livenessScore,
          photoUrl,
          embeddingModel: best3[0]?.model ?? null,
          // Count the punch immediately even on a face mismatch (symmetric with
          // the employee 'MARKED' path): 'AUTO' is counted by the contractor
          // rollup, while the FaceDesk review queue below holds the flag. HR
          // reject then flips it to REVIEW_REJECTED, which retracts it — the
          // rollup is live-computed, so the reversal is exact.
          decision: 'AUTO',
          offlineSync: !!dto.offlineRef,
          offlineRef: dto.offlineRef ?? null,
        });
      } catch (error: unknown) {
        // The unique (client_id, offline_ref) index closes the race between two
        // simultaneous retries. Return the winning row as an idempotent success.
        if (dto.offlineRef && (error as { code?: string })?.code === '23505') {
          const existing = await this.contractorPunchRepo.findOne({
            where: { clientId, offlineRef: dto.offlineRef },
          });
          if (existing) {
            return this.contractorPunchResult(
              existing,
              'Attendance already recorded',
            );
          }
        }
        throw error;
      }

      if (flagForReview) {
        await this.reviewRepo.save({
          clientId,
          branchId: resolvedBranchId,
          employeeId: employee.employeeId,
          attendanceId: null,
          contractorPunchId: savedContractorPunch.id,
          issueType: 'FACE_MISMATCH',
          confidenceScore: cosine,
          status: 'PENDING',
          probeEmbedding,
          adminRemarks: reviewRemark,
        });
      }
      return {
        status: 'MARKED',
        message: flagForReview
          ? 'Marked — pending branch verification'
          : 'Attendance Marked Successfully',
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        punchType: direction === 'OUT' ? 'OUT' : 'IN',
        punchTime: punchTime.toISOString(),
        branchId: resolvedBranchId,
        confidencePercent,
      };
    }

    const punchType = await this.nextPunchType(
      clientId,
      employee.employeeId,
      punchTime,
    );
    const saved = await this.attRepo.save({
      employeeId: employee.employeeId,
      clientId,
      branchId: resolvedBranchId,
      deviceId,
      punchType,
      punchTime,
      confidenceScore: cosine,
      matchMargin: margin,
      livenessScore,
      photoUrl,
      // Counts immediately; a flagged punch is reversible on branch rejection.
      attendanceStatus: 'MARKED',
      syncStatus: 'SYNCED',
      offlineRef: dto.offlineRef ?? null,
    });

    // PIN correct but face didn't match → mark, but queue for the branch to
    // verify the captured photo and approve or reverse it.
    if (flagForReview) {
      await this.reviewRepo.save({
        clientId,
        branchId: saved.branchId,
        employeeId: employee.employeeId,
        attendanceId: saved.attendanceId,
        issueType: 'FACE_MISMATCH',
        confidenceScore: cosine,
        status: 'PENDING',
        probeEmbedding,
        adminRemarks: reviewRemark,
      });
    }

    return {
      status: 'MARKED',
      message: flagForReview
        ? 'Marked — pending branch verification'
        : 'Attendance Marked Successfully',
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      punchType: saved.punchType,
      punchTime: saved.punchTime.toISOString(),
      branchId: saved.branchId,
      confidencePercent,
    };
  }

  private contractorPunchResult(
    punch: ContractorBiometricPunchEntity,
    message: string,
  ): MarkResult {
    return {
      status: 'MARKED',
      message,
      punchType: punch.direction === 'OUT' ? 'OUT' : 'IN',
      punchTime: punch.punchTime.toISOString(),
      branchId: punch.branchId,
    };
  }

  /** Load the single claimed employee's profile for PIN 1:1 verification. */
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
    const [row] = await this.dataSource.query(
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

  /**
   * PIN-only path: load every enrolled, active employee at the kiosk's branch
   * who has an attendance PIN set. The caller bcrypt-checks the typed PIN
   * against this roster and face-matches the survivors, so identity is settled
   * without the employee typing a code. Scoped to the device's branch to keep
   * the candidate set (and the PIN namespace) small.
   */
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

  /**
   * PIN-only fast path: resolve the (unique-per-client) employee for a PIN by
   * its indexed lookup hash — an index seek instead of scanning + bcrypt-
   * comparing the whole branch roster. Scoped to the device's branch.
   */
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

  /**
   * The subject's full face gallery for matching: the averaged enrollment
   * template plus every stored sample (enrollment angles + HR-approved faces).
   * Deduped into Float32Array probes; a punch matches on the best of these.
   */
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

  /** PIN_THEN_FACE 1:1: verify the entered PIN, then match the face to that one template. */
  private async markByPin(
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
      await this.recordFailed(clientId, branchId, deviceId, null, null, 'PIN_MISSING');
      return { status: 'REJECTED', message: 'Enter your PIN' };
    }

    // Brute-force guard: refuse further PIN attempts once a device has burned
    // through the allowed WRONG_PIN failures in the window. Checked before any
    // bcrypt work so a locked device is cheap to turn away.
    if (
      PIN_MAX_ATTEMPTS > 0 &&
      (await this.recentWrongPinCount(clientId, deviceId, branchId)) >=
        PIN_MAX_ATTEMPTS
    ) {
      return {
        status: 'REJECTED',
        message: 'Too many incorrect PINs — please wait a few minutes.',
      };
    }

    // Resolve who is punching. Two supported paths:
    //  - PIN-only (no code): the worker types just their PIN. We load the
    //    branch's enrolled roster, keep those whose PIN matches, and let the
    //    1:1 face match pick the right person — so a rare PIN collision is
    //    broken by the face rather than by forcing globally-unique PINs. This
    //    is the default: unskilled staff enter a single 4-digit PIN.
    //  - Legacy code + PIN: an older APK still sends the employee code as the
    //    identity claim; we verify that single profile 1:1.
    let roster: Awaited<ReturnType<typeof this.loadBranchPinRoster>>;
    if (code) {
      const claimed = await this.loadClaimedProfile(clientId, branchId, code);
      roster = claimed ? [claimed] : [];
    } else {
      // PIN-only: resolve the single employee by the indexed lookup hash
      // (unique per client). Fall back to a roster scan for any PIN enrolled
      // before the lookup column existed.
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
      await this.recordFailed(
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

    // Keep only profiles whose PIN matches what was typed (bcrypt over the
    // candidate set — one for the code path, the branch roster for PIN-only).
    const pinMatched: typeof roster = [];
    for (const p of roster) {
      if (p.pinHash && (await bcrypt.compare(pin, p.pinHash))) pinMatched.push(p);
    }
    if (pinMatched.length === 0) {
      await this.recordFailed(clientId, branchId, deviceId, null, null, 'WRONG_PIN');
      return { status: 'REJECTED', message: 'Incorrect PIN' };
    }

    // Among the PIN-matched profiles (usually exactly one), choose the best
    // face match. When two employees happen to share a PIN, the face decides.
    // Match against the subject's whole gallery (the averaged enrollment
    // template PLUS every stored sample — enrollment angles and any HR-approved
    // faces) and take the best cosine, so a previously-approved angle now
    // passes on its own.
    let claimed: (typeof pinMatched)[number] | null = null;
    let cosine = -1;
    // Best cosine of any OTHER distinct identity — the runner-up. Only meaningful
    // when a PIN is shared by two people; used to enforce a separation margin so
    // we don't confidently pick between two near-tied faces.
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
        // Previous leader (if a different person) becomes the runner-up.
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
    // Margin over the next-best identity; a lone candidate has no competition.
    const margin = runnerUpCosine >= 0 ? cosine - runnerUpCosine : 1;
    const ambiguous = margin < eff.minMarginCosine;
    const confidencePercent = this.settings.cosineToPercent(cosine);

    // Correct PIN but the face doesn't match. Per policy, mark the punch
    // (it counts immediately) but flag it so the branch verifies the photo
    // and can reverse it — this catches buddy-punching without blocking a
    // genuine employee the model failed to match.
    const subject = {
      employeeId: claimed.employeeId,
      employeeCode: claimed.employeeCode,
      name: claimed.name,
      branchId: claimed.branchId,
      subjectType: claimed.subjectType,
    };

    if (cosine < eff.retryCosine) {
      return this.acceptPunch(
        clientId,
        branchId,
        deviceId,
        dto,
        subject,
        cosine,
        margin,
        best3,
        confidencePercent,
        true, // flag for branch verification
      );
    }
    if (cosine < eff.acceptCosine) {
      return {
        status: 'RETRY',
        message: 'Please look at the camera again',
        confidencePercent,
      };
    }

    // Clean face match. If a shared PIN left two near-tied identities (margin
    // below the floor), mark but flag it — the branch decides which person it
    // was rather than the system guessing on a hair's-width difference.
    return this.acceptPunch(
      clientId,
      branchId,
      deviceId,
      dto,
      subject,
      cosine,
      margin,
      best3,
      confidencePercent,
      ambiguous,
      ambiguous
        ? `PIN matched two similar faces (${confidencePercent}% vs ${this.settings.cosineToPercent(
            runnerUpCosine,
          )}%) — confirm identity.`
        : undefined,
    );
  }

  private async recordFailed(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    bestEmployeeId: string | null,
    bestConfidence: number | null,
    reason: string,
  ): Promise<FaceDeskFailedAttemptEntity> {
    return this.failRepo.save({
      clientId,
      branchId,
      deviceId,
      bestEmployeeId,
      bestConfidence,
      reason,
    });
  }

  /**
   * WRONG_PIN failures in the lockout window, scoped to the device (or the
   * branch for the web kiosk that has no device id). Drives the brute-force
   * throttle; the lockout attempt itself is not recorded, so it can't extend
   * its own window.
   */
  private async recentWrongPinCount(
    clientId: string,
    deviceId: string | null,
    branchId: string | null,
  ): Promise<number> {
    const since = new Date(Date.now() - PIN_LOCKOUT_MIN * 60 * 1000);
    const params: unknown[] = [clientId, since];
    let scope = '';
    if (deviceId) {
      params.push(deviceId);
      scope = `AND device_id = $3`;
    } else if (branchId) {
      params.push(branchId);
      scope = `AND branch_id = $3`;
    }
    const [row] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_attendance_failed_attempts
        WHERE client_id = $1 AND reason = 'WRONG_PIN'
          AND attempted_at >= $2 ${scope}`,
      params,
    );
    return Number(row?.n ?? 0);
  }

  /** Upload a punch photo, retrying once when it's the evidence for a flag. */
  private async uploadPhotoWithRetry(
    photoB64: string,
    clientId: string,
    employeeId: string,
    critical: boolean,
  ): Promise<string | null> {
    const attempts = critical ? 2 : 1;
    for (let i = 0; i < attempts; i++) {
      const url = await this.photoStorage
        .uploadPhoto(photoB64, clientId, employeeId)
        .catch(() => null);
      if (url) return url;
    }
    if (critical) {
      this.logger.warn(
        `flagged-punch photo upload failed for employee ${employeeId} (client ${clientId})`,
      );
    }
    return null;
  }

  /** Offline batch sync: mark each punch, dedupe by offlineRef, log the sync. */
  async offlineSync(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    punches: MarkAttendanceDto[],
  ): Promise<{ synced: number; duplicateSkipped: number; failed: number }> {
    let synced = 0;
    let duplicateSkipped = 0;
    let failed = 0;
    for (const p of punches ?? []) {
      try {
        const before = dedupeKeyPresent(p);
        const res = await this.markAttendance(clientId, branchId, deviceId, {
          ...p,
        });
        if (res.status === 'MARKED') {
          if (before && res.message === 'Attendance already recorded')
            duplicateSkipped++;
          else synced++;
        } else {
          failed++;
        }
      } catch (err) {
        this.logger.warn(`offline punch failed: ${(err as Error)?.message}`);
        failed++;
      }
    }
    if (deviceId) {
      await this.dataSource.query(
        `INSERT INTO facedesk_device_sync_logs
           (device_id, client_id, synced_count, duplicate_skipped, failed_count, sync_status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          deviceId,
          clientId,
          synced,
          duplicateSkipped,
          failed,
          failed === 0 ? 'OK' : synced > 0 ? 'PARTIAL' : 'FAILED',
        ],
      );
      await this.dataSource.query(
        `UPDATE facedesk_kiosk_devices SET last_sync_time = now(), device_status = 'ONLINE' WHERE device_id = $1`,
        [deviceId],
      );
    }
    return { synced, duplicateSkipped, failed };
  }

  async getStatus(clientId: string, employeeId: string) {
    const { start, end } = this.businessDayBoundsUtc(new Date());
    const rows = await this.attRepo
      .createQueryBuilder('a')
      .where('a.clientId = :clientId', { clientId })
      .andWhere('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.punchTime >= :start AND a.punchTime < :end', { start, end })
      .orderBy('a.punchTime', 'ASC')
      .getMany();
    return { employeeId, punches: rows.length, log: rows };
  }
}

function dedupeKeyPresent(p: MarkAttendanceDto): boolean {
  return !!p.offlineRef;
}
