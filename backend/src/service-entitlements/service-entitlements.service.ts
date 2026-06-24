import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import {
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
    const requested = modules?.length ? modules : PACKAGE_MODULES[packageCode];
    const normalized = Array.from(new Set(requested)).filter((m) =>
      allowed.has(m),
    ) as ServiceModuleCode[];
    if (!normalized.length) {
      throw new BadRequestException('At least one module is required');
    }
    return normalized;
  }

  async getCurrentForClient(clientId: string): Promise<CurrentPackageRow> {
    let packageRows: { package_code: string }[] = [];
    try {
      packageRows = await this.dataSource.query(
        `SELECT package_code
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

    const packageCode = packageRows[0]?.package_code ?? FULL_SERVICE_PACKAGE;

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
      ? entitlementRows.map((r) => r.module_code)
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
            dto.note ?? null,
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
            dto.note ?? null,
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

  async listRequests(status?: string) {
    const params: unknown[] = [];
    let where = 'TRUE';
    if (status) {
      params.push(status);
      where = `r.status = $${params.length}`;
    }
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
    return rows;
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
    return rows[0];
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

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE client_module_change_requests
            SET status = $2,
                reviewed_by = $3::uuid,
                reviewed_at = NOW(),
                review_note = $4
          WHERE id = $1::uuid`,
        [id, dto.action, actor.userId || actor.id, dto.note ?? null],
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
            dto.note ?? null,
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
            dto.note ?? null,
          ],
        );
      }
    });

    return this.getRequest(id);
  }

  async getClientStatus(clientId: string) {
    const current = await this.getCurrentForClient(clientId);
    const pending = await this.dataSource.query(
      `SELECT id, package_code AS "packageCode", requested_at AS "requestedAt"
         FROM client_module_change_requests
        WHERE client_id = $1::uuid
          AND status = 'PENDING_CCO'
        ORDER BY requested_at DESC`,
      [clientId],
    );
    return { clientId, ...current, pendingRequests: pending };
  }
}
