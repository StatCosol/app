/**
 * FaceDesk V2 entities. One module-owned set of tables (facedesk_*), fully
 * separate from V1 mobile-attendance. Grouped in one file for cohesion.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FaceDeskCaptureTuning } from '../facedesk-capture-tuning';

@Entity({ name: 'facedesk_kiosk_devices' })
@Index(['clientId'])
export class FaceDeskDeviceEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'device_id' })
  deviceId: string;

  @Column({ name: 'device_name', type: 'varchar', length: 120 })
  deviceName: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'location', type: 'text', nullable: true })
  location: string | null;

  @Column({
    name: 'device_status',
    type: 'varchar',
    length: 20,
    default: 'PROVISIONED',
  })
  deviceStatus: string;

  @Column({
    name: 'install_token',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  installToken: string | null;

  @Column({ name: 'android_id', type: 'varchar', length: 120, nullable: true })
  androidId: string | null;

  @Column({ name: 'mode', type: 'varchar', length: 20, default: 'ATTENDANCE' })
  mode: 'ATTENDANCE' | 'ENROLLMENT';

  @Column({ name: 'admin_pin', type: 'varchar', length: 12, nullable: true })
  adminPin: string | null;

  @Column({ name: 'last_sync_time', type: 'timestamptz', nullable: true })
  lastSyncTime: Date | null;

  @Column({ name: 'app_version', type: 'varchar', length: 40, nullable: true })
  appVersion: string | null;

  @Column({ name: 'offline_queue_depth', type: 'int', nullable: true })
  offlineQueueDepth: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'facedesk_employee_face_profiles' })
@Index(['clientId', 'enrollmentStatus'])
export class FaceDeskProfileEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'profile_id' })
  profileId: string;

  /**
   * The enrolled subject's id — an employees.id when subjectType is EMPLOYEE,
   * or a contractor_employees.id when CONTRACTOR. Named employee_id for
   * backwards compatibility (no FK, so it safely holds either).
   */
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  /** Whether employee_id points at an employee or a contractor worker. */
  @Column({
    name: 'subject_type',
    type: 'varchar',
    length: 20,
    default: 'EMPLOYEE',
  })
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({
    name: 'enrollment_status',
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  enrollmentStatus: 'PENDING' | 'ENROLLED' | 'BLOCKED' | 'DEACTIVATED';

  @Column({ name: 'face_template', type: 'bytea', nullable: true })
  faceTemplate: Buffer | null;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  @Column({ name: 'quality_score', type: 'numeric', nullable: true })
  qualityScore: number | null;

  @Column({
    name: 'liveness_status',
    type: 'varchar',
    length: 20,
    default: 'UNKNOWN',
  })
  livenessStatus: 'UNKNOWN' | 'PASSED' | 'FAILED';

  @Column({
    name: 'duplicate_status',
    type: 'varchar',
    length: 20,
    default: 'CLEAR',
  })
  duplicateStatus: 'CLEAR' | 'FLAGGED' | 'APPROVED' | 'REJECTED';

  /** bcrypt hash of the employee's attendance PIN (PIN_THEN_FACE mode). */
  @Column({ name: 'attendance_pin_hash', type: 'text', nullable: true })
  attendancePinHash: string | null;

  /**
   * Keyed (HMAC) lookup hash of the PIN, unique per client. bcrypt hashes are
   * unsearchable, so this deterministic hash is what enforces "no duplicate
   * PINs" (unique index) and lets the kiosk resolve a punch by PIN with an
   * indexed lookup instead of scanning + bcrypt-comparing the whole roster.
   */
  @Column({ name: 'attendance_pin_lookup', type: 'text', nullable: true })
  attendancePinLookup: string | null;

  @Column({ name: 'attendance_pin_set_at', type: 'timestamptz', nullable: true })
  attendancePinSetAt: Date | null;

  @Column({ name: 'consent_given_at', type: 'timestamptz', nullable: true })
  consentGivenAt: Date | null;

  @Column({ name: 'consent_given_by', type: 'uuid', nullable: true })
  consentGivenBy: string | null;

  @Column({ name: 'enrolled_by', type: 'uuid', nullable: true })
  enrolledBy: string | null;

  /** Persisted face id in the client's Azure Large Face List. */
  @Column({ name: 'azure_persisted_face_id', type: 'varchar', length: 64, nullable: true })
  azurePersistedFaceId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'facedesk_employee_face_samples' })
@Index(['profileId'])
export class FaceDeskSampleEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'sample_id' })
  sampleId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({
    name: 'sample_type',
    type: 'varchar',
    length: 20,
    default: 'FRONT',
  })
  sampleType: 'FRONT' | 'LEFT' | 'RIGHT' | 'EXPRESSION' | 'LIVENESS';

  @Column({ name: 'image_path', type: 'text', nullable: true })
  imagePath: string | null;

  @Column({ name: 'embedding', type: 'bytea' })
  embedding: Buffer;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  @Column({ name: 'quality_score', type: 'numeric', nullable: true })
  qualityScore: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'facedesk_attendance_logs' })
@Index(['clientId', 'punchTime'])
export class FaceDeskAttendanceEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'attendance_id' })
  attendanceId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'punch_type', type: 'varchar', length: 10, default: 'AUTO' })
  punchType: 'IN' | 'OUT' | 'AUTO';

  @Column({ name: 'punch_time', type: 'timestamptz' })
  punchTime: Date;

  @Column({ name: 'confidence_score', type: 'numeric', nullable: true })
  confidenceScore: number | null;

  @Column({ name: 'match_margin', type: 'numeric', nullable: true })
  matchMargin: number | null;

  @Column({ name: 'liveness_score', type: 'numeric', nullable: true })
  livenessScore: number | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({
    name: 'attendance_status',
    type: 'varchar',
    length: 20,
    default: 'MARKED',
  })
  attendanceStatus: 'MARKED' | 'REVIEW_PENDING' | 'APPROVED' | 'REJECTED';

  @Column({
    name: 'sync_status',
    type: 'varchar',
    length: 20,
    default: 'SYNCED',
  })
  syncStatus: 'SYNCED' | 'OFFLINE_PENDING';

  @Column({ name: 'offline_ref', type: 'varchar', length: 80, nullable: true })
  offlineRef: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'facedesk_attendance_failed_attempts' })
@Index(['clientId', 'attemptedAt'])
export class FaceDeskFailedAttemptEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'attempt_id' })
  attemptId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'best_employee_id', type: 'uuid', nullable: true })
  bestEmployeeId: string | null;

  @Column({ name: 'best_confidence', type: 'numeric', nullable: true })
  bestConfidence: number | null;

  @Column({ name: 'reason', type: 'varchar', length: 40 })
  reason: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @CreateDateColumn({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt: Date;
}

@Entity({ name: 'facedesk_face_duplicate_alerts' })
@Index(['clientId', 'status'])
export class FaceDeskDuplicateAlertEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'alert_id' })
  alertId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'new_employee_id', type: 'uuid' })
  newEmployeeId: string;

  @Column({ name: 'matched_employee_id', type: 'uuid' })
  matchedEmployeeId: string;

  @Column({ name: 'similarity_score', type: 'numeric' })
  similarityScore: number;

  /**
   * Which detection path raised this alert — the two need opposite resolutions.
   * BLOCK: scored at/above the duplicate threshold, so enrollment was refused
   *   and no template was stored. Clearing the alert must reopen enrollment.
   * REVIEW: scored in the near-miss band, so the profile is already ENROLLED
   *   with a valid template. Clearing must leave it enrolled; confirming the
   *   duplicate must revoke it.
   * Defaults to BLOCK so alerts created before this column existed keep their
   * original meaning.
   */
  @Column({
    name: 'detection_band',
    type: 'varchar',
    length: 10,
    default: 'BLOCK',
  })
  detectionBand: 'BLOCK' | 'REVIEW';

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FALSE_ALERT';

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'admin_remarks', type: 'text', nullable: true })
  adminRemarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'facedesk_attendance_review_queue' })
@Index(['clientId', 'status'])
export class FaceDeskReviewQueueEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'review_id' })
  reviewId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId: string | null;

  @Column({ name: 'contractor_punch_id', type: 'uuid', nullable: true })
  contractorPunchId: string | null;

  /**
   * The face embedding captured on the flagged punch. Kept so that when HR
   * approves a face-mismatch, this exact face is added to the subject's gallery
   * — a later punch at the same angle then matches automatically.
   */
  @Column({ name: 'probe_embedding', type: 'bytea', nullable: true })
  probeEmbedding: Buffer | null;

  @Column({ name: 'issue_type', type: 'varchar', length: 30 })
  issueType:
    | 'DUPLICATE_ENROLLMENT'
    | 'LOW_CONFIDENCE'
    | 'MULTIPLE_MATCH'
    | 'FACE_MISMATCH'
    | 'REPEATED_FAILURE'
    | 'MANUAL_CORRECTION';

  @Column({ name: 'confidence_score', type: 'numeric', nullable: true })
  confidenceScore: number | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'FALSE_ALERT';

  @Column({ name: 'admin_remarks', type: 'text', nullable: true })
  adminRemarks: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}

@Entity({ name: 'facedesk_manual_attendance_corrections' })
@Index(['clientId', 'status'])
export class FaceDeskCorrectionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'correction_id' })
  correctionId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId: string | null;

  @Column({ name: 'correction_type', type: 'varchar', length: 20 })
  correctionType: 'ADD' | 'EDIT' | 'DELETE';

  @Column({ name: 'old_punch_time', type: 'timestamptz', nullable: true })
  oldPunchTime: Date | null;

  @Column({ name: 'new_punch_time', type: 'timestamptz', nullable: true })
  newPunchTime: Date | null;

  @Column({
    name: 'old_punch_type',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  oldPunchType: string | null;

  @Column({
    name: 'new_punch_type',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  newPunchType: string | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}

@Entity({ name: 'facedesk_device_sync_logs' })
@Index(['deviceId', 'createdAt'])
export class FaceDeskSyncLogEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'sync_id' })
  syncId: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'synced_count', type: 'int', default: 0 })
  syncedCount: number;

  @Column({ name: 'duplicate_skipped', type: 'int', default: 0 })
  duplicateSkipped: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'sync_status', type: 'varchar', length: 20, default: 'OK' })
  syncStatus: 'OK' | 'PARTIAL' | 'FAILED';

  @Column({ name: 'detail', type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'facedesk_face_settings' })
export class FaceDeskSettingsEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'client_id' })
  clientId: string;

  /** Percentage shown in the admin UI; mapped to cosine by the service. */
  @Column({ name: 'face_match_confidence', type: 'numeric', default: 95 })
  faceMatchConfidence: number;

  @Column({ name: 'face_retry_confidence', type: 'numeric', default: 90 })
  faceRetryConfidence: number;

  /** Percent at/above which an enrollment is treated as a duplicate. Raised to
   *  97 (cosine ~0.884): at the former 90/93 the check matched unrelated faces
   *  and blocked every enrollment. See the boot patch in main.ts, which also
   *  moves existing rows off the old defaults. */
  @Column({ name: 'duplicate_threshold', type: 'numeric', default: 97 })
  duplicateThreshold: number;

  @Column({ name: 'min_face_samples', type: 'int', default: 5 })
  minFaceSamples: number;

  @Column({ name: 'frame_capture_count', type: 'int', default: 15 })
  frameCaptureCount: number;

  @Column({ name: 'liveness_required', type: 'boolean', default: true })
  livenessRequired: boolean;

  @Column({ name: 'offline_sync_enabled', type: 'boolean', default: true })
  offlineSyncEnabled: boolean;

  /** Legacy column retained for schema compatibility; FaceDesk is PIN + face. */
  @Column({
    name: 'identification_mode',
    type: 'varchar',
    length: 20,
    default: 'PIN_THEN_FACE',
  })
  identificationMode: 'PIN_THEN_FACE';

  @Column({ name: 'shift_start_time', type: 'varchar', length: 5, nullable: true })
  shiftStartTime: string | null;

  @Column({ name: 'shift_end_time', type: 'varchar', length: 5, nullable: true })
  shiftEndTime: string | null;

  /** Azure Large Face List id for this client (when AZURE_FACE_* is configured). */
  @Column({ name: 'azure_face_list_id', type: 'varchar', length: 64, nullable: true })
  azureFaceListId: string | null;

  /**
   * Per-client capture thresholds handed to the kiosk, overriding the app's
   * built-in defaults. Those defaults were profiled on one handset and applied
   * to every device; this is how a client on different hardware gets gates that
   * match its cameras. Null means "use the app defaults".
   *
   * Partial objects are fine — set one value, inherit the rest. See
   * facedesk-capture-tuning.ts for the shape and accepted ranges.
   */
  @Column({ name: 'capture_tuning', type: 'jsonb', nullable: true })
  captureTuning: Partial<FaceDeskCaptureTuning> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'facedesk_enroll_tickets' })
@Index(['deviceId', 'status'])
@Index(['clientId', 'status'])
export class FaceDeskEnrollTicketEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'ticket_id' })
  ticketId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  /** EMPLOYEE (default) or CONTRACTOR — which roster employee_id belongs to. */
  @Column({
    name: 'subject_type',
    type: 'varchar',
    length: 20,
    default: 'EMPLOYEE',
  })
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';

  @Column({
    name: 'employee_name',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  employeeName: string | null;

  @Column({
    name: 'employee_code',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  employeeCode: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'CAPTURING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}

@Entity({ name: 'facedesk_audit_logs' })
@Index(['clientId', 'createdAt'])
export class FaceDeskAuditEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'audit_id' })
  auditId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'action', type: 'varchar', length: 40 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'detail', type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/**
 * Branch decision on a short (< full-day) worked day. One row per
 * (client, employee, work_date), created only when a branch user acts.
 * APPROVED → full day (1.0), HALF_DAY → 0.5, REJECTED → 0.
 */
@Entity({ name: 'facedesk_day_reviews' })
@Index(['clientId', 'workDate'])
export class FaceDeskDayReviewEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ name: 'worked_minutes', type: 'int', default: 0 })
  workedMinutes: number;

  @Column({ name: 'decision', type: 'varchar', length: 20 })
  decision: 'APPROVED' | 'HALF_DAY' | 'REJECTED';

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
