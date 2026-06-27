import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import {
  CUSTOM_SERVICES_PACKAGE,
  FULL_SERVICE_PACKAGE,
  PACKAGE_MODULES,
  SERVICE_MODULE_CODES,
  SERVICE_MODULE_OPTIONS,
  SERVICE_PACKAGE_OPTIONS,
  ServiceModuleCode,
} from './service-entitlements.constants';
import {
  CreateModuleChangeRequestDto,
  ReviewModuleChangeRequestDto,
} from './dto/service-entitlements.dto';

type CurrentPackageRow = {
  packageCode: string;
  enabledModules: ServiceModuleCode[];
  isRestricted: boolean;
};

type ServiceRequestRow = {
  requestedModules?: unknown;
  currentModules?: unknown;
};

type ServiceAuditRow = {
  modules?: unknown;
};

const SERVICE_REQUEST_STATUSES = [
  'PENDING_CCO',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ServiceEntitlementsService {
  constructor(private readonly dataSource: DataSource) {}

  listPackageOptions() {
    return SERVICE_PACKAGE_OPTIONS;
  }

  listModuleOptions() {
    return SERVICE_MODULE_OPTIONS;
  }

  normalizeModules(packageCode: string, modules?: ServiceModuleCode[]) {
    if (!PACKAGE_MODULES[packageCode]) {
      throw new BadRequestException(`Unsupported package code: ${packageCode}`);
    }
    const allowed = new Set(SERVICE_MODULE_CODES);
    const requested = Array.from(
      new Set(modules?.length ? modules : PACKAGE_MODULES[packageCode]),
    );
    const unsupportedIndex = requested.findIndex(
      (module) => !allowed.has(module),
    );
    if (unsupportedIndex >= 0) {
      throw new BadRequestException(
        `Unsupported service module: ${requested[unsupportedIndex]}`,
      );
    }
    const normalized = requested as ServiceModuleCode[];
    if (!normalized.length) {
      throw new BadRequestException('At least one module is required');
    }
    if (packageCode !== CUSTOM_SERVICES_PACKAGE && modules?.length) {
      const fixedModules = PACKAGE_MODULES[packageCode];
      const fixedSet = new Set(fixedModules);
      const matchesFixedPackage =
        normalized.length === fixedModules.length &&
        normalized.every((module) => fixedSet.has(module));
      if (!matchesFixedPackage) {
        throw new BadRequestException(
          'Only Custom Services can use a custom module selection',
        );
      }
    }
    return normalized;
  }

  async getCurrentForClient(clientId: string): Promise<CurrentPackageRow> {
    let packageRows: { package_code: string; approved_at: Date | null }[] = [];
    try {
      packageRows = await this.dataSource.query(
        `SELECT package_code, approved_at
           FROM client_service_packages
          WHERE client_id = $1::uuid
          LIMIT 1`,
        [clientId],
      );
    } catch (err: any) {
      if (err?.code === '42P01') {
        return {
          packageCode: FULL_SERVICE_PACKAGE,
          enabledModules: PACKAGE_MODULES[FULL_SERVICE_PACKAGE],
          isRestricted: false,
        };
      }
      throw err;
    }

    const packageRow = packageRows[0];
    const packageCode = packageRow?.package_code ?? FULL_SERVICE_PACKAGE;
    if (packageRow && !packageRow.approved_at) {
      return {
        packageCode,
        enabledModules: [],
        isRestricted: true,
      };
    }

    let entitlementRows: { module_code: ServiceModuleCode }[] = [];
    try {
      entitlementRows = await this.dataSource.query(
        `SELECT module_code
           FROM client_module_entitlements
          WHERE client_id = $1::uuid
            AND is_enabled = TRUE
          ORDER BY module_code`,
        [clientId],
      );
    } catch (err: any) {
      if (err?.code === '42P01') {
        return {
          packageCode: FULL_SERVICE_PACKAGE,
          enabledModules: PACKAGE_MODULES[FULL_SERVICE_PACKAGE],
          isRestricted: false,
        };
      }
      throw err;
    }

    const enabledModules = entitlementRows.length
      ? this.normalizeStoredModuleArray(entitlementRows.map((r) => r.module_code))
      : PACKAGE_MODULES[packageCode] ?? PACKAGE_MODULES[FULL_SERVICE_PACKAGE];

    return {
      packageCode,
      enabledModules,
      isRestricted: packageCode !== FULL_SERVICE_PACKAGE,
    };
  }

  async hasModule(clientId: string | null | undefined, module: ServiceModuleCode) {
    if (!clientId) return true;
    const current = await this.getCurrentForClient(clientId);
    if (!current.isRestricted) return true;
    return current.enabledModules.includes(module);
  }

  async hasAnyModule(
    clientId: string | null | undefined,
    modules: ServiceModuleCode[],
  ) {
    if (!clientId) return true;
    const current = await this.getCurrentForClient(clientId);
    if (!current.isRestricted) return true;
    return modules.some((module) => current.enabledModules.includes(module));
  }

  async assertModule(
    clientId: string | null | undefined,
    module: ServiceModuleCode,
  ) {
    if (!(await this.hasModule(clientId, module))) {
      throw new ForbiddenException(
        `This client is not approved for ${module.replace(/_/g, ' ').toLowerCase()}`,
      );
    }
  }

  async assertAnyModule(
    clientId: string | null | undefined,
    modules: ServiceModuleCode[],
  ) {
    if (!(await this.hasAnyModule(clientId, modules))) {
      throw new ForbiddenException(
        `This client is not approved for ${modules
          .map((module) => module.replace(/_/g, ' ').toLowerCase())
          .join(' or ')}`,
      );
    }
  }

  async createRequest(dto: CreateModuleChangeRequestDto, actor: ReqUser) {
    const modules = this.normalizeModules(dto.packageCode, dto.modules);
    const requestNote = this.normalizeOptionalNote(dto.note);
    const clientRows = await this.dataSource.query(
      `SELECT id FROM clients WHERE id = $1::uuid LIMIT 1`,
      [dto.clientId],
    );
    if (!clientRows.length) throw new NotFoundException('Client not found');

    const pendingRows = await this.dataSource.query(
      `SELECT id
         FROM client_module_change_requests
        WHERE client_id = $1::uuid
          AND status = 'PENDING_CCO'
        LIMIT 1`,
      [dto.clientId],
    );
    if (pendingRows.length) {
      throw new BadRequestException(
        'This client already has a service package request pending CCO review',
      );
    }

    const current = await this.getCurrentForClient(dto.clientId);
    let requestId: string;
    try {
      requestId = await this.dataSource.transaction(async (manager) => {
        const inserted: { id: string }[] = await manager.query(
          `INSERT INTO client_module_change_requests
            (client_id, package_code, requested_modules, current_modules, requested_by, request_note)
           VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::uuid, $6)
           RETURNING id`,
          [
            dto.clientId,
            dto.packageCode,
            JSON.stringify(modules),
            JSON.stringify(current.enabledModules),
            actor.userId || actor.id,
            requestNote,
          ],
        );

        await manager.query(
          `INSERT INTO client_module_audit_logs
            (client_id, request_id, action, package_code, modules, actor_user_id, note)
           VALUES ($1::uuid, $2::uuid, 'REQUESTED', $3, $4::jsonb, $5::uuid, $6)`,
          [
            dto.clientId,
            inserted[0].id,
            dto.packageCode,
            JSON.stringify(modules),
            actor.userId || actor.id,
            requestNote,
          ],
        );

        return inserted[0].id;
      });
    } catch (err: any) {
      if (
        err?.code === '23505' &&
        String(err?.constraint || '').includes(
          'uniq_client_module_change_requests_pending',
        )
      ) {
        throw new BadRequestException(
          'This client already has a service package request pending CCO review',
        );
      }
      throw err;
    }

    return this.getRequest(requestId);
  }

  async listRequests(status?: string, clientId?: string) {
    this.assertValidRequestStatus(status);
    this.assertValidOptionalUuid(clientId, 'clientId');
    const params: unknown[] = [];
    const filters: string[] = [];
    if (status) {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }
    if (clientId) {
      params.push(clientId);
      filters.push(`r.client_id = $${params.length}::uuid`);
    }
    const where = filters.length ? filters.join(' AND ') : 'TRUE';
    const rows = await this.dataSource.query(
      `SELECT r.id,
              r.client_id AS "clientId",
              c.client_name AS "clientName",
              r.package_code AS "packageCode",
              r.requested_modules AS "requestedModules",
              r.current_modules AS "currentModules",
              r.status,
              r.request_note AS "requestNote",
              r.review_note AS "reviewNote",
              r.requested_at AS "requestedAt",
              r.reviewed_at AS "reviewedAt",
              requester.name AS "requestedByName",
              reviewer.name AS "reviewedByName"
         FROM client_module_change_requests r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN users requester ON requester.id = r.requested_by
         LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
        WHERE ${where}
        ORDER BY r.requested_at DESC
        LIMIT 200`,
      params,
    );
    return rows.map((row) => this.normalizeRequestRow(row));
  }

  async listAuditLogs(clientId?: string) {
    this.assertValidOptionalUuid(clientId, 'clientId');
    const params: unknown[] = [];
    let where = 'TRUE';
    if (clientId) {
      params.push(clientId);
      where = `l.client_id = $${params.length}::uuid`;
    }

    const rows = await this.dataSource.query(
      `SELECT l.id,
              l.client_id AS "clientId",
              c.client_name AS "clientName",
              l.request_id AS "requestId",
              l.action,
              l.package_code AS "packageCode",
              l.modules,
              l.actor_user_id AS "actorUserId",
              actor.name AS "actorName",
              l.note,
              l.created_at AS "createdAt"
         FROM client_module_audit_logs l
         LEFT JOIN clients c ON c.id = l.client_id
         LEFT JOIN users actor ON actor.id = l.actor_user_id
        WHERE ${where}
        ORDER BY l.created_at DESC
        LIMIT 200`,
      params,
    );
    return rows.map((row) => this.normalizeAuditRow(row));
  }

  async getRequest(id: string) {
    const rows = await this.dataSource.query(
      `SELECT r.id,
              r.client_id AS "clientId",
              c.client_name AS "clientName",
              r.package_code AS "packageCode",
              r.requested_modules AS "requestedModules",
              r.current_modules AS "currentModules",
              r.status,
              r.request_note AS "requestNote",
              r.review_note AS "reviewNote",
              r.requested_at AS "requestedAt",
              r.reviewed_at AS "reviewedAt",
              requester.name AS "requestedByName",
              reviewer.name AS "reviewedByName"
         FROM client_module_change_requests r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN users requester ON requester.id = r.requested_by
         LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
        WHERE r.id = $1::uuid
        LIMIT 1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Service request not found');
    return this.normalizeRequestRow(rows[0]);
  }

  async reviewRequest(
    id: string,
    dto: ReviewModuleChangeRequestDto,
    actor: ReqUser,
  ) {
    const existing = await this.getRequest(id);
    if (existing.status !== 'PENDING_CCO') {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    const reviewNote = dto.note?.trim() || null;
    if (dto.action !== 'APPROVED' && !reviewNote) {
      throw new BadRequestException(
        'Review note is required when rejecting or requesting changes',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE client_module_change_requests
            SET status = $2,
                reviewed_by = $3::uuid,
                reviewed_at = NOW(),
                review_note = $4
          WHERE id = $1::uuid`,
        [id, dto.action, actor.userId || actor.id, reviewNote],
      );

      if (dto.action === 'APPROVED') {
        const modules = this.normalizeModules(
          existing.packageCode,
          existing.requestedModules,
        );

        await manager.query(
          `INSERT INTO client_service_packages
            (client_id, package_code, request_id, approved_by, approved_at, updated_at)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, NOW(), NOW())
           ON CONFLICT (client_id) DO UPDATE SET
             package_code = EXCLUDED.package_code,
             request_id = EXCLUDED.request_id,
             approved_by = EXCLUDED.approved_by,
             approved_at = EXCLUDED.approved_at,
             updated_at = NOW()`,
          [existing.clientId, existing.packageCode, id, actor.userId || actor.id],
        );

        await manager.query(
          `DELETE FROM client_module_entitlements WHERE client_id = $1::uuid`,
          [existing.clientId],
        );

        for (const moduleCode of modules) {
          await manager.query(
            `INSERT INTO client_module_entitlements
              (client_id, module_code, is_enabled, request_id, approved_by, approved_at, updated_at)
             VALUES ($1::uuid, $2, TRUE, $3::uuid, $4::uuid, NOW(), NOW())`,
            [existing.clientId, moduleCode, id, actor.userId || actor.id],
          );
        }

        await manager.query(
          `INSERT INTO client_module_audit_logs
            (client_id, request_id, action, package_code, modules, actor_user_id, note)
           VALUES ($1::uuid, $2::uuid, 'APPROVED', $3, $4::jsonb, $5::uuid, $6)`,
          [
            existing.clientId,
            id,
            existing.packageCode,
            JSON.stringify(modules),
            actor.userId || actor.id,
            reviewNote,
          ],
        );
      } else {
        await manager.query(
          `INSERT INTO client_module_audit_logs
            (client_id, request_id, action, package_code, modules, actor_user_id, note)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::uuid, $7)`,
          [
            existing.clientId,
            id,
            dto.action,
            existing.packageCode,
            JSON.stringify(existing.requestedModules ?? []),
            actor.userId || actor.id,
            reviewNote,
          ],
        );
      }
    });

    return this.getRequest(id);
  }

  async getClientStatus(clientId: string) {
    const current = await this.getCurrentForClient(clientId);
    const pending = await this.dataSource.query(
      `SELECT id,
              package_code AS "packageCode",
              requested_modules AS "requestedModules",
              request_note AS "requestNote",
              requested_at AS "requestedAt"
         FROM client_module_change_requests
        WHERE client_id = $1::uuid
          AND status = 'PENDING_CCO'
        ORDER BY requested_at DESC`,
      [clientId],
    );
    return {
      clientId,
      ...current,
      pendingRequests: pending.map((row) => this.normalizeRequestRow(row)),
    };
  }

  private assertValidRequestStatus(status?: string): void {
    if (!status) return;
    if (!SERVICE_REQUEST_STATUSES.includes(status as any)) {
      throw new BadRequestException(`Unsupported service request status: ${status}`);
    }
  }

  private assertValidOptionalUuid(value: string | undefined, field: string): void {
    if (!value) return;
    if (!UUID_RE.test(value)) {
      throw new BadRequestException(`${field} must be a UUID`);
    }
  }

  private normalizeOptionalNote(note: string | undefined): string | null {
    const trimmed = note?.trim();
    return trimmed || null;
  }

  private normalizeRequestRow<T extends ServiceRequestRow>(row: T): T {
    const normalized = { ...row } as T;
    if (Object.prototype.hasOwnProperty.call(row, 'requestedModules')) {
      normalized.requestedModules = this.normalizeStoredModuleArray(
        row.requestedModules,
      );
    }
    if (Object.prototype.hasOwnProperty.call(row, 'currentModules')) {
      normalized.currentModules = this.normalizeStoredModuleArray(
        row.currentModules,
      );
    }
    return normalized;
  }

  private normalizeAuditRow<T extends ServiceAuditRow>(row: T): T {
    const normalized = { ...row } as T;
    if (Object.prototype.hasOwnProperty.call(row, 'modules')) {
      normalized.modules = this.normalizeStoredModuleArray(row.modules);
    }
    return normalized;
  }

  private normalizeStoredModuleArray(value: unknown): ServiceModuleCode[] {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const allowed = new Set(SERVICE_MODULE_CODES);
    return Array.isArray(parsed)
      ? parsed.filter((module) => allowed.has(module)) as ServiceModuleCode[]
      : [];
  }
}
