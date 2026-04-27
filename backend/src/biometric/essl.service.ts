import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BiometricDeviceEntity } from './entities/biometric-device.entity';
import { BiometricService } from './biometric.service';
import { IngestPunchItemDto } from './biometric.dto';

/**
 * eSSL/ZKTeco "iclock" protocol service.
 *
 * Parses raw device payloads, resolves the device by serial number, and hands
 * normalised punches off to BiometricService.ingest().
 */
@Injectable()
export class EsslService {
  private readonly logger = new Logger(EsslService.name);

  constructor(
    @InjectRepository(BiometricDeviceEntity)
    private readonly deviceRepo: Repository<BiometricDeviceEntity>,
    private readonly biometric: BiometricService,
  ) {}

  /** Returns the config block the device should adopt on handshake. */
  async handshake(sn: string): Promise<string> {
    const device = await this.requireDevice(sn);
    await this.touch(sn);
    // Standard ZK/eSSL ADMS handshake response.
    // ServerVersion + Flags telling the device what tables to push.
    const lines = [
      `GET OPTION FROM: ${device.serialNumber}`,
      'ATTLOGStamp=None',
      'OPERLOGStamp=None',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=1111000000',
      'TimeZone=5.5', // IST default; override from device.meta if needed
      'Realtime=1',
      'Encrypt=None',
    ];
    return lines.join('\n');
  }

  /** Update last_seen_at for the device (no-op if SN unknown). */
  async touch(sn: string): Promise<void> {
    if (!sn) return;
    await this.deviceRepo
      .createQueryBuilder()
      .update(BiometricDeviceEntity)
      .set({ lastSeenAt: new Date() })
      .where('serial_number = :sn', { sn })
      .execute();
  }

  /**
   * Parse an ATTLOG TSV body and forward to BiometricService.ingest().
   * TSV format (tab-separated):
   *   <pin>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t<workcode>\t...
   * `status`:  0=check-in, 1=check-out, 2=break-out, 3=break-in,
   *            4=ot-in,    5=ot-out — anything else => AUTO.
   *
   * Returns count of records parsed (not necessarily inserted; dedupe happens downstream).
   */
  async ingestAttlog(sn: string, body: string): Promise<number> {
    const device = await this.requireDevice(sn);
    if (!body || !body.trim()) {
      await this.touch(sn);
      return 0;
    }

    const tzOffsetMin = this.tzOffsetMinutes(device);
    const lines = body.split(/\r?\n/);
    const punches: IngestPunchItemDto[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const pin = (parts[0] || '').trim();
      const dt = (parts[1] || '').trim();
      const statusRaw = (parts[2] || '').trim();
      if (!pin || !dt) continue;

      const punchTime = this.parseDeviceTime(dt, tzOffsetMin);
      if (!punchTime) continue;

      punches.push({
        employeeCode: pin,
        punchTime: punchTime.toISOString(),
        direction: this.mapStatus(statusRaw),
        deviceId: device.serialNumber,
      });
    }

    if (!punches.length) {
      await this.touch(sn);
      return 0;
    }

    const result = await this.biometric.ingest(device.clientId, punches, true);

    // Update touch + counter
    await this.deviceRepo
      .createQueryBuilder()
      .update(BiometricDeviceEntity)
      .set({
        lastSeenAt: new Date(),
        lastPushCount: () => `last_push_count + ${punches.length}`,
      })
      .where('id = :id', { id: device.id })
      .execute();

    this.logger.log(
      `eSSL ${sn}: parsed=${punches.length} inserted=${result.inserted} dup=${result.duplicates} unknown=${result.unknownEmployees.length}`,
    );
    return punches.length;
  }

  // ── Internal ───────────────────────────────────────────────

  private async requireDevice(sn: string): Promise<BiometricDeviceEntity> {
    if (!sn) throw new UnauthorizedException('Missing SN');
    const device = await this.deviceRepo.findOne({
      where: { serialNumber: sn },
    });
    if (!device || !device.enabled) {
      this.logger.warn(`eSSL push from unregistered/disabled SN=${sn}`);
      throw new UnauthorizedException('Device not registered');
    }
    return device;
  }

  /** Returns timezone offset in minutes for the device (default IST = +330). */
  private tzOffsetMinutes(device: BiometricDeviceEntity): number {
    const meta = device.meta || {};
    const v = (meta as any).tzOffsetMinutes;
    if (typeof v === 'number') return v;
    return 330; // IST
  }

  /**
   * Device sends "YYYY-MM-DD HH:MM:SS" in its LOCAL time.
   * Convert to a UTC Date by subtracting the offset.
   */
  private parseDeviceTime(s: string, tzOffsetMin: number): Date | null {
    const m = s.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})/,
    );
    if (!m) return null;
    const [, y, mo, d, h, mi, se] = m;
    const utcMs = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se),
    );
    // Device showed local time; subtract offset to get true UTC instant.
    return new Date(utcMs - tzOffsetMin * 60 * 1000);
  }

  private mapStatus(raw: string): 'IN' | 'OUT' | 'AUTO' {
    switch (raw) {
      case '0':
      case '4':
        return 'IN';
      case '1':
      case '5':
        return 'OUT';
      default:
        return 'AUTO';
    }
  }
}
