import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { PayrollClientScopeService } from './payroll-client-scope.service';
import { SaveClientComponentsDto } from './dto/save-client-components.dto';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { PayrollComponentMasterEntity } from './entities/payroll-component-master.entity';
import { PayrollClientComponentOverrideEntity } from './entities/payroll-client-component-override.entity';
import { PayrollClientPayslipLayoutEntity } from './entities/payroll-client-payslip-layout.entity';
import { PayrollConfigAuditEntity } from './entities/payroll-config-audit.entity';
import {
  defaultPayslipLayout,
  validatePayslipLayout,
} from './utils/payslip-layout';

@Injectable()
export class PayrollClientConfigService {
  constructor(
    @InjectRepository(PayrollComponentMasterEntity)
    private readonly compRepo: Repository<PayrollComponentMasterEntity>,
    @InjectRepository(PayrollClientComponentOverrideEntity)
    private readonly overrideRepo: Repository<PayrollClientComponentOverrideEntity>,
    @InjectRepository(PayrollClientPayslipLayoutEntity)
    private readonly layoutRepo: Repository<PayrollClientPayslipLayoutEntity>,
    private readonly scopeService: PayrollClientScopeService,
  ) {}

  async getClientEffectiveComponents(user: ReqUser, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.scopeService.assertPayrollAccessToClient(user, clientId);

    const [master, overrides] = await Promise.all([
      this.compRepo.find({
        where: { isActive: true },
        order: { code: 'ASC' },
      }),
      this.overrideRepo.find({ where: { clientId } }),
    ]);

    const ovMap = new Map<string, PayrollClientComponentOverrideEntity>();
    for (const o of overrides) ovMap.set(o.componentId, o);

    const merged = master.map((c) => {
      const ov = ovMap.get(c.id);

      const enabled = ov?.enabled ?? true; // default enabled
      const showOnPayslip = ov?.showOnPayslip ?? true;
      const displayOrder = ov?.displayOrder ?? null;

      return {
        componentId: c.id,
        code: c.code,
        name: ov?.labelOverride ?? c.name,
        componentType: c.componentType,
        isTaxable: c.isTaxable,
        affectsPfWage: c.affectsPfWage,
        affectsEsiWage: c.affectsEsiWage,
        enabled,
        showOnPayslip,
        displayOrder,
        formula: ov?.formulaOverride ?? c.defaultFormula ?? null,
      };
    });

    // filter disabled
    const active = merged.filter((x) => x.enabled);

    // order: displayOrder first, then code
    active.sort((a, b) => {
      const ao = a.displayOrder ?? 999999;
      const bo = b.displayOrder ?? 999999;
      if (ao !== bo) return ao - bo;
      return String(a.code).localeCompare(String(b.code));
    });

    return active;
  }

  async saveClientComponentOverrides(
    user: ReqUser,
    clientId: string,
    dto: SaveClientComponentsDto,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.scopeService.assertPayrollAccessToClient(user, clientId);

    const items = dto?.items ?? [];
    if (!Array.isArray(items)) throw new BadRequestException('items required');

    const ids = [...new Set(items.map((item) => item.componentId))];
    const componentCodes = new Map<string, string>();
    if (ids.length !== items.length) {
      throw new BadRequestException('Duplicate component overrides');
    }
    if (ids.length) {
      const components = await this.compRepo.find({ where: { id: In(ids) } });
      if (components.length !== ids.length) {
        throw new BadRequestException('Unknown payroll component');
      }
      for (const component of components)
        componentCodes.set(component.id, component.code);
    }

    await this.overrideRepo.manager.transaction(async (manager) => {
      // Serialize edits for this client and commit the history with the changes.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `payroll-config:${clientId}`,
      ]);
      const repo = manager.getRepository(PayrollClientComponentOverrideEntity);
      for (const it of items) {
        const existing = await repo.findOne({
          where: { clientId, componentId: it.componentId },
        });

        const patch: Partial<PayrollClientComponentOverrideEntity> = {};
        if (it.enabled !== undefined) patch.enabled = it.enabled;
        if (it.displayOrder !== undefined) patch.displayOrder = it.displayOrder;
        if (it.showOnPayslip !== undefined)
          patch.showOnPayslip = it.showOnPayslip;
        if (it.labelOverride !== undefined)
          patch.labelOverride = it.labelOverride?.trim() || null;
        if (it.formulaOverride !== undefined)
          patch.formulaOverride = it.formulaOverride?.trim() || null;
        if (!Object.keys(patch).length) continue;
        const oldValues = existing ? { ...existing } : null;

        const saved = await repo.save(
          existing
            ? Object.assign(existing, patch)
            : repo.create({
                clientId,
                componentId: it.componentId,
                ...patch,
              }),
        );
        await manager.getRepository(PayrollConfigAuditEntity).save({
          clientId,
          userId: user.id,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'PayrollClientComponentOverride',
          entityId: saved.id,
          oldValues,
          newValues: { ...saved },
          description: `Component override: ${componentCodes.get(it.componentId)}`,
        });
      }
    });

    return this.getClientEffectiveComponents(user, clientId);
  }

  async getClientPayslipLayout(user: ReqUser, clientId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');

    await this.scopeService.assertPayrollAccessToClient(user, clientId);

    const row = await this.layoutRepo.findOne({
      where: { clientId, isActive: true },
    });
    if (row?.layoutJson) return row.layoutJson;

    return defaultPayslipLayout();
  }

  async saveClientPayslipLayout(
    user: ReqUser,
    clientId: string,
    dto: SaveClientPayslipLayoutDto,
  ) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!clientId) throw new BadRequestException('clientId required');
    if (!dto?.layout) throw new BadRequestException('layout required');

    await this.scopeService.assertPayrollAccessToClient(user, clientId);

    // Validate: ensure component codes exist for this client
    const effective = await this.getClientEffectiveComponents(user, clientId);
    const codeSet = new Set(
      effective.filter((x) => x.enabled).map((x) => x.code),
    );
    const layout = validatePayslipLayout(
      dto.layout,
      dto.layout.settings?.enabled === true ? codeSet : undefined,
    );

    await this.layoutRepo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `payroll-config:${clientId}`,
      ]);
      const repo = manager.getRepository(PayrollClientPayslipLayoutEntity);
      const existing = await repo.findOne({ where: { clientId } });
      const oldValues = existing ? { ...existing } : null;
      const saved = await repo.save(
        existing
          ? Object.assign(existing, { layoutJson: layout, isActive: true })
          : repo.create({ clientId, layoutJson: layout, isActive: true }),
      );
      await manager.getRepository(PayrollConfigAuditEntity).save({
        clientId,
        userId: user.id,
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'PayrollClientPayslipLayout',
        entityId: saved.id,
        oldValues,
        newValues: { ...saved },
        description: 'Payslip layout configuration',
      });
    });

    return layout;
  }
}
