import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { FaceDeskEnrollTicketEntity } from './entities/facedesk.entities';

/**
 * Web-initiated enrollment tickets. A branch user picks an employee + kiosk to
 * create a PENDING ticket; the kiosk polls its pending ticket, captures, and
 * completes it. One open ticket per device at a time; attendance is held on a
 * device while it has an open ticket (enforced by the kiosk polling this).
 */
@Injectable()
export class FaceDeskTicketService {
  constructor(
    @InjectRepository(FaceDeskEnrollTicketEntity)
    private readonly repo: Repository<FaceDeskEnrollTicketEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    clientId: string,
    createdBy: string,
    body: {
      employeeId: string;
      deviceId: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    },
    allowedBranchIds: string[] | null = null,
  ): Promise<FaceDeskEnrollTicketEntity> {
    if (!body?.employeeId || !body?.deviceId) {
      throw new BadRequestException('employeeId and deviceId are required');
    }
    const subjectType =
      body.subjectType === 'CONTRACTOR' ? 'CONTRACTOR' : 'EMPLOYEE';
    // Device must belong to the client (and branch scope for branch users).
    const [device] = await this.dataSource.query<
      Array<{ device_id: string; branch_id: string | null; status: string }>
    >(
      `SELECT device_id, branch_id, device_status AS status
         FROM facedesk_kiosk_devices
        WHERE device_id = $1 AND client_id = $2 LIMIT 1`,
      [body.deviceId, clientId],
    );
    if (!device)
      throw new BadRequestException('Device not found for this client');
    if (device.status === 'REVOKED') {
      throw new BadRequestException('Device is revoked');
    }
    if (
      allowedBranchIds &&
      (!device.branch_id || !allowedBranchIds.includes(device.branch_id))
    ) {
      throw new BadRequestException('Device is not in your branch');
    }

    // Subject must belong to the client (+ branch scope) and be active. The
    // roster table depends on subjectType — employees or contractor_employees.
    const subjectTable =
      subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
    // Both rosters carry employee_code. This used to select NULL for
    // contractors because the column really was absent in production, but
    // main.ts adds it and its partial unique index on boot ("Schema patch:
    // contractor employee_code uniqueness OK" on the live revision), and #585
    // generates the codes. Selecting NULL now blanks the code on every
    // contractor enrolment ticket — the kiosk shows the worker with no
    // identifier, and it stays blank even after the backfill fills the column.
    const codeCol = 'employee_code';
    const [emp] = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        employee_code: string | null;
        branch_id: string | null;
      }>
    >(
      `SELECT id, name, ${codeCol}, branch_id
         FROM ${subjectTable}
        WHERE id = $1 AND client_id = $2 AND is_active = true LIMIT 1`,
      [body.employeeId, clientId],
    );
    if (!emp)
      throw new BadRequestException(
        subjectType === 'CONTRACTOR' ? 'Contractor not found' : 'Employee not found',
      );
    if (
      allowedBranchIds &&
      (!emp.branch_id || !allowedBranchIds.includes(emp.branch_id))
    ) {
      throw new BadRequestException('Employee is not in your branch');
    }

    // Cancel any existing open ticket on this device, then create a new one.
    await this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'CANCELLED' })
      .where('device_id = :deviceId AND status IN (:...open)', {
        deviceId: body.deviceId,
        open: ['PENDING', 'CAPTURING'],
      })
      .execute();

    try {
      return await this.repo.save(
        this.repo.create({
          clientId,
          branchId: device.branch_id ?? emp.branch_id ?? null,
          deviceId: body.deviceId,
          employeeId: body.employeeId,
          subjectType,
          employeeName: emp.name,
          employeeCode: emp.employee_code,
          status: 'PENDING',
          createdBy,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        }),
      );
    } catch {
      throw new ConflictException('This device already has an open enrollment');
    }
  }

  /** Kiosk poll: the current PENDING/CAPTURING ticket for a device, if any. */
  async getPendingForDevice(
    deviceId: string,
  ): Promise<FaceDeskEnrollTicketEntity | null> {
    // Expire stale tickets first so a forgotten one doesn't block the device.
    await this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'EXPIRED' })
      .where(
        'device_id = :deviceId AND status IN (:...open) AND expires_at <= now()',
        { deviceId, open: ['PENDING', 'CAPTURING'] },
      )
      .execute();

    return this.repo.findOne({
      where: [
        { deviceId, status: 'PENDING' },
        { deviceId, status: 'CAPTURING' },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async markCapturing(ticketId: string): Promise<{ ok: true }> {
    await this.repo.update(
      { ticketId, status: 'PENDING' },
      { status: 'CAPTURING' },
    );
    return { ok: true };
  }

  async complete(ticketId: string, deviceId: string): Promise<{ ok: true }> {
    // Only an OPEN ticket for this device can be completed — never resurrect a
    // cancelled/expired one back to COMPLETED.
    const res = await this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(
        'ticket_id = :ticketId AND device_id = :deviceId AND status IN (:...open)',
        { ticketId, deviceId, open: ['PENDING', 'CAPTURING'] },
      )
      .execute();
    if (!res.affected) {
      throw new ConflictException('Ticket is no longer open');
    }
    return { ok: true };
  }

  /**
   * Device-initiated cancel: the kiosk gave up on an enrollment (e.g. the
   * capture time limit was exceeded) and abandons the ticket. Mirrors
   * {@link complete} — scoped to the device and only touches an OPEN ticket, so
   * it never resurrects an already cancelled/completed one. Idempotent: a
   * no-op (still returns ok) when the ticket is already closed, so a retried
   * timeout call can't error the kiosk.
   */
  async abandon(ticketId: string, deviceId: string): Promise<{ ok: true }> {
    await this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'CANCELLED' })
      .where(
        'ticket_id = :ticketId AND device_id = :deviceId AND status IN (:...open)',
        { ticketId, deviceId, open: ['PENDING', 'CAPTURING'] },
      )
      .execute();
    return { ok: true };
  }

  /**
   * Close any open ticket this device holds for one subject.
   *
   * Used when an enrolment cannot proceed no matter how often it is retried —
   * a duplicate sent to admin review, or a subject already enrolled. The kiosk
   * cancels its own ticket in those cases, but only if it survives to make the
   * call: a crash, a dropped network, or a killed app between the refusal and
   * the cancel leaves the ticket open, and getPendingForDevice treats PENDING
   * and CAPTURING alike, so the device relaunches enrolment for the same person
   * on its next poll. This is the copy that does not depend on the kiosk.
   *
   * Scoped to device + client + subject so it can never touch a queued ticket
   * for somebody else.
   */
  async cancelOpenForSubject(
    deviceId: string,
    clientId: string,
    employeeId: string,
  ): Promise<{ ok: true }> {
    await this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'CANCELLED' })
      .where(
        'device_id = :deviceId AND client_id = :clientId ' +
          'AND employee_id = :employeeId AND status IN (:...open)',
        { deviceId, clientId, employeeId, open: ['PENDING', 'CAPTURING'] },
      )
      .execute();
    return { ok: true };
  }

  listByClient(
    clientId: string,
    status?: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<FaceDeskEnrollTicketEntity[]> {
    const where: Record<string, unknown> = { clientId };
    if (status) where['status'] = status;
    // Branch users only see their branches' tickets.
    if (allowedBranchIds) {
      where['branchId'] = allowedBranchIds.length
        ? In(allowedBranchIds)
        : In(['']);
    }
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async cancel(
    clientId: string,
    ticketId: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true }> {
    const qb = this.repo
      .createQueryBuilder()
      .update(FaceDeskEnrollTicketEntity)
      .set({ status: 'CANCELLED' })
      .where(
        'ticket_id = :ticketId AND client_id = :clientId AND status IN (:...open)',
        { ticketId, clientId, open: ['PENDING', 'CAPTURING'] },
      );
    // Branch users can only cancel tickets in their branches.
    if (allowedBranchIds) {
      qb.andWhere('branch_id IN (:...branches)', {
        branches: allowedBranchIds.length ? allowedBranchIds : [''],
      });
    }
    const res = await qb.execute();
    if (!res.affected) throw new NotFoundException('Ticket not cancellable');
    return { ok: true };
  }
}
