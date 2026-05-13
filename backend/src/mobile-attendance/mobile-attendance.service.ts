import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { BiometricService } from '../biometric/biometric.service';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import {
  MobileAttendanceDeviceEntity,
  MobileDeviceMode,
} from './entities/mobile-attendance-device.entity';
import {
  EnrollFaceDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
} from './mobile-attendance.dto';

const MIN_MATCH_SCORE = 0.78; // cosine similarity threshold for MobileFaceNet
const MIN_LIVENESS_SCORE = 0.5;

@Injectable()
export class MobileAttendanceService {
  private readonly logger = new Logger(MobileAttendanceService.name);

  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly faceRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(MobileAttendanceDeviceEntity)
    private readonly deviceRepo: Repository<MobileAttendanceDeviceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly biometricService: BiometricService,
  ) {}

  // ---------------------------------------------------------------- devices
  async registerDevice(
    clientId: string,
    registeredBy: string | null,
    body: RegisterMobileDeviceDto,
  ): Promise<MobileAttendanceDeviceEntity> {
    const installToken = randomBytes(32).toString('hex');
    const dev = this.deviceRepo.create({
      clientId,
      branchId: body.branchId ?? null,
      mode: body.mode,
      deviceLabel: body.deviceLabel ?? null,
      installToken,
      geofenceLat: body.geofenceLat ?? null,
      geofenceLng: body.geofenceLng ?? null,
      geofenceRadiusM: body.geofenceRadiusM ?? null,
      registeredBy,
      isActive: true,
    });
    return this.deviceRepo.save(dev);
  }

  async listDevices(clientId: string): Promise<MobileAttendanceDeviceEntity[]> {
    return this.deviceRepo.find({
      where: { clientId },
      order: { registeredAt: 'DESC' },
    });
  }

  async revokeDevice(clientId: string, deviceId: string, revokedBy: string | null) {
    const dev = await this.deviceRepo.findOne({ where: { id: deviceId, clientId } });
    if (!dev) throw new NotFoundException('Device not found');
    dev.isActive = false;
    dev.revokedAt = new Date();
    dev.revokedBy = revokedBy;
    return this.deviceRepo.save(dev);
  }

  /** Resolve install-token -> device. Throws on revoked / unknown. */
  async resolveDeviceByToken(token: string): Promise<MobileAttendanceDeviceEntity> {
    if (!token) throw new UnauthorizedException('Missing device token');
    const dev = await this.deviceRepo.findOne({ where: { installToken: token } });
    if (!dev || !dev.isActive) throw new UnauthorizedException('Invalid device token');
    dev.lastSeenAt = new Date();
    await this.deviceRepo.update(dev.id, { lastSeenAt: dev.lastSeenAt });
    return dev;
  }

  // -------------------------------------------------------------- enrollment
  async enrollFace(
    clientId: string,
    enrolledBy: string | null,
    body: EnrollFaceDto,
  ): Promise<FaceEnrollmentEntity> {
    if (!body.consentGiven) {
      throw new BadRequestException('Employee consent is required for biometric enrollment');
    }
    if (!body.embeddingBase64 && !body.photoBase64) {
      throw new BadRequestException('Provide either embeddingBase64 or photoBase64');
    }
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const embedding = body.embeddingBase64
      ? Buffer.from(body.embeddingBase64, 'base64')
      : null;

    // Azure Face enrollment is performed lazily on first successful punch
    // OR via a separate admin sync job once Limited-Access is granted.
    // For now we just persist the local embedding + photo.
    const photoUrl = body.photoBase64
      ? `data:image/jpeg;base64,${body.photoBase64.slice(0, 64)}...` // placeholder; real impl uploads to Blob
      : null;

    const existing = await this.faceRepo.findOne({ where: { employeeId: emp.id } });
    const now = new Date();
    const payload: Partial<FaceEnrollmentEntity> = {
      employeeId: emp.id,
      clientId,
      branchId: emp.branchId ?? null,
      embedding,
      embeddingModel: body.embeddingModel ?? 'mobilefacenet-v1',
      photoUrl,
      consentGivenAt: now,
      consentGivenBy: enrolledBy,
      enrolledAt: now,
      enrolledBy,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
    };
    if (existing) {
      await this.faceRepo.update({ employeeId: emp.id }, payload);
      return (await this.faceRepo.findOne({ where: { employeeId: emp.id } }))!;
    }
    return this.faceRepo.save(this.faceRepo.create(payload));
  }

  async deactivateEnrollment(clientId: string, employeeId: string, by: string | null, reason: string) {
    const row = await this.faceRepo.findOne({ where: { employeeId, clientId } });
    if (!row) throw new NotFoundException('Enrollment not found');
    row.isActive = false;
    row.deactivatedAt = new Date();
    row.deactivationReason = reason;
    row.deactivatedAt = row.deactivatedAt;
    return this.faceRepo.save(row);
  }

  /**
   * Roster for kiosk devices to pull at startup. Returns enrolled employees
   * for the device's branch (or the whole client if branch is null), with
   * embeddings so matching can run on-device offline.
   */
  async roster(clientId: string, branchId: string | null) {
    const where: Record<string, unknown> = { clientId, isActive: true };
    if (branchId) where.branchId = branchId;
    const rows = await this.faceRepo.find({ where: where as any });
    if (!rows.length) return { employees: [] };

    const empIds = rows.map((r) => r.employeeId);
    const emps = await this.empRepo.findByIds(empIds);
    const byId = new Map(emps.map((e) => [e.id, e]));

    return {
      employees: rows.map((r) => {
        const e = byId.get(r.employeeId);
        return {
          employeeId: r.employeeId,
          employeeCode: e?.employeeCode ?? null,
          name: e?.name ?? null,
          branchId: r.branchId,
          embeddingBase64: r.embedding ? r.embedding.toString('base64') : null,
          embeddingModel: r.embeddingModel,
        };
      }),
    };
  }

  // ------------------------------------------------------------------ punch
  async recordPunch(
    device: MobileAttendanceDeviceEntity,
    body: MobilePunchDto,
    actorEmployeeId?: string | null,
  ) {
    // ESS mode: punch must be for the logged-in employee (passed by controller)
    if (device.mode === 'ESS' && actorEmployeeId && actorEmployeeId !== body.employeeId) {
      throw new ForbiddenException('ESS punch must be for the logged-in employee');
    }

    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId: device.clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Quality gates — reject low confidence / liveness
    if (body.matchScore != null && body.matchScore < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `Face match score ${body.matchScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
      );
    }
    if (body.livenessScore != null && body.livenessScore < MIN_LIVENESS_SCORE) {
      throw new BadRequestException('Liveness check failed');
    }

    // Geofence check (kiosk: device location is fixed, not enforced here)
    if (
      device.mode === 'ESS' &&
      device.geofenceLat != null &&
      device.geofenceLng != null &&
      device.geofenceRadiusM != null &&
      body.lat != null &&
      body.lng != null
    ) {
      const dist = haversineMeters(
        Number(device.geofenceLat),
        Number(device.geofenceLng),
        body.lat,
        body.lng,
      );
      if (dist > device.geofenceRadiusM) {
        throw new ForbiddenException(
          `Outside allowed geofence (~${Math.round(dist)}m from site)`,
        );
      }
    }

    const ts = new Date(body.capturedAt);
    if (isNaN(ts.getTime())) throw new BadRequestException('Invalid capturedAt');

    const source: 'MOBILE_KIOSK' | 'MOBILE_ESS' =
      device.mode === 'KIOSK' ? 'MOBILE_KIOSK' : 'MOBILE_ESS';

    // Use existing biometric ingest for idempotency + roll-up. Then patch
    // the just-inserted row with mobile-specific evidence columns.
    const ingestResult = await this.biometricService.ingest(
      device.clientId,
      [
        {
          employeeCode: emp.employeeCode,
          punchTime: ts.toISOString(),
          direction: body.direction ?? 'AUTO',
          deviceId: `mobile:${device.id}`,
          branchId: emp.branchId ?? device.branchId ?? undefined,
        } as any,
      ],
      true,
    );

    // Patch evidence columns (raw SQL — short and avoids fetching the row twice)
    await this.faceRepo.manager.query(
      `UPDATE biometric_punches
         SET mobile_device_id = $1,
             capture_lat = $2,
             capture_lng = $3,
             capture_accuracy_m = $4,
             photo_url = COALESCE($5, photo_url),
             match_score = $6,
             liveness_score = $7,
             match_provider = $8,
             source = $9
       WHERE client_id = $10
         AND employee_code = $11
         AND punch_time = $12
         AND device_id = $13`,
      [
        device.id,
        body.lat ?? null,
        body.lng ?? null,
        body.accuracyM ?? null,
        body.photoBase64 ? null : null, // photo upload to blob is a separate task
        body.matchScore ?? null,
        body.livenessScore ?? null,
        body.matchProvider ?? 'mobilefacenet',
        source,
        device.clientId,
        emp.employeeCode,
        ts,
        `mobile:${device.id}`,
      ],
    );

    await this.deviceRepo.update(device.id, { lastPunchAt: ts });

    return {
      ok: true,
      duplicate: ingestResult.inserted === 0 && ingestResult.duplicates > 0,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      capturedAt: ts.toISOString(),
      mode: device.mode,
    };
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
