import { registerStatusAttendance } from './register-status-attendance';
import {
  registerContractors,
  assertRegisterContractor,
  contractorRegisterSource,
} from './register-contractor-source';
import { registerOperationalSource } from './register-operational-source';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { REGISTER_JURISDICTIONS } from './register-jurisdictions';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { RegistersRecordEntity } from '../entities/registers-record.entity';
import {
  definition,
  RegisterInput,
  RegisterRow,
  registerWorkbook,
  validateRegister,
} from './register-workbook';

@Injectable()
export class RegisterBuilderService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  async branchContext(branchId: string, user: ReqUser) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        branchId || '',
      )
    )
      throw new BadRequestException('Select a valid branch');
    await this.access.assertBranchAllowed(user, branchId);
    await this.access.assertCcoBranchAllowed(user, branchId);
    const branch = await this.ds
      .getRepository(BranchEntity)
      .findOneBy({ id: branchId, isActive: true, isDeleted: false });
    if (!branch) throw new BadRequestException('Active branch not found');
    await this.access.assertClientAllowed(user, branch.clientId);
    const stateCode = branch.stateCode?.trim().toUpperCase();
    if (!stateCode || !REGISTER_JURISDICTIONS.some((s) => s.code === stateCode))
      throw new BadRequestException(
        'Set a recognised state code in the selected branch profile before choosing registers',
      );
    const [facts] = await this.ds.query(
      'SELECT state_code AS "stateCode", appropriate_government AS government FROM unit_facts WHERE branch_id=$1',
      [branchId],
    );
    if (facts && facts.stateCode?.trim().toUpperCase() !== stateCode)
      throw new BadRequestException(
        'Branch state and applicability facts disagree. Correct the branch profile first.',
      );
    return {
      branchId: branch.id,
      branchName: branch.branchName,
      stateCode,
      centralRulesAvailable: facts?.government === 'CENTRAL',
    };
  }

  async context(
    id: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
  ) {
    const { form, layout } = definition(id);
    if (
      !/^[0-9a-f-]{36}$/i.test(branchId || '') ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    )
      throw new BadRequestException('Select a branch and valid period');
    await this.access.assertBranchAllowed(user, branchId);
    await this.access.assertCcoBranchAllowed(user, branchId);
    const branch = await this.ds
      .getRepository(BranchEntity)
      .findOneBy({ id: branchId, isActive: true, isDeleted: false });
    if (!branch) throw new BadRequestException('Active branch not found');
    await this.access.assertClientAllowed(user, branch.clientId);
    if (layout.periodKind === 'ANNUAL' && month !== 12)
      throw new BadRequestException(
        'Annual registers must use the year-end reporting period',
      );
    const periodStart =
      year +
      '-' +
      (layout.periodKind === 'ANNUAL' ? '01' : String(month).padStart(2, '0')) +
      '-01';
    if (form.effectiveFrom && periodStart < form.effectiveFrom) {
      throw new BadRequestException(
        'This rule version does not cover the full selected ' +
          (layout.periodKind === 'ANNUAL' ? 'year' : 'month') +
          '. Select the applicable earlier version or split the transition period.',
      );
    }
    if (
      form.jurisdiction !== 'CENTRAL' &&
      form.jurisdiction !== branch.stateCode?.toUpperCase()
    ) {
      throw new BadRequestException(
        'This form belongs to a different state from the selected branch',
      );
    }
    // Read the existing applicability decision, not a guessed headcount threshold.
    const decisions = await this.ds.query(
      `SELECT uc.is_applicable AS applicable, uc.computed_at AS "computedAt", uf.appropriate_government AS government,
               uf.updated_at AS "factsUpdatedAt", uf.state_code AS "factState",
               uf.establishment_type AS "establishmentType", uf.is_bocw_project AS "isBocwProject"
       FROM unit_applicable_compliance uc
       JOIN unit_compliance_master cm ON cm.id=uc.compliance_id AND cm.is_active=true
       JOIN unit_facts uf ON uf.branch_id=uc.branch_id
       WHERE uc.branch_id=$1 AND cm.code=$2`,
      [branchId, form.actCode],
    );
    if (decisions.length !== 1 || decisions[0].applicable !== true) {
      throw new BadRequestException(
        'Confirm ' +
          form.actCode +
          ' applicability in the branch applicability screen before generating registers.',
      );
    }
    const decision = decisions[0];
    if (
      !Number.isFinite(new Date(decision.computedAt).getTime()) ||
      !Number.isFinite(new Date(decision.factsUpdatedAt).getTime()) ||
      new Date(decision.computedAt).getTime() <
        new Date(decision.factsUpdatedAt).getTime()
    ) {
      throw new BadRequestException(
        'Branch facts changed. Recompute and review applicability before generating registers.',
      );
    }
    if (decision.factState?.toUpperCase() !== branch.stateCode?.toUpperCase()) {
      throw new BadRequestException(
        'Branch state and applicability facts disagree. Correct the branch profile first.',
      );
    }
    const requiredGovernment =
      form.jurisdiction === 'CENTRAL' ? 'CENTRAL' : 'STATE';
    if (decision.government !== requiredGovernment) {
      throw new BadRequestException(
        'Set the appropriate government to ' +
          requiredGovernment +
          ' in branch applicability facts, then recompute and review applicability.',
      );
    }
    if (
      layout.establishmentRequirement === 'FACTORY_OR_CONSTRUCTION' &&
      !['FACTORY', 'BOTH'].includes(decision.establishmentType) &&
      decision.isBocwProject !== true
    ) {
      throw new BadRequestException(
        'This register applies only to factories or building/construction work. Review the branch establishment facts before generating it.',
      );
    }
    return {
      form,
      layout,
      branch,
      periodStart,
      applicabilityEvidence: decisions.map((d: any) => ({
        applicable: d.applicable,
        computedAt: d.computedAt,
        government: d.government,
        factState: d.factState,
        factsUpdatedAt: d.factsUpdatedAt,
        establishmentType: d.establishmentType,
        isBocwProject: d.isBocwProject,
      })),
    };
  }

  async contractors(
    id: string,
    branchId: string,
    year: number,
    month: number,
    user: ReqUser,
  ) {
    const ctx = await this.context(id, branchId, year, month, user);
    return registerContractors(this.ds, ctx.branch.clientId, branchId);
  }

  async prefill(
    id: string,
    branchId: string,
    runId: string,
    year: number,
    month: number,
    user: ReqUser,
    contractorId?: string,
  ) {
    const context = await this.context(id, branchId, year, month, user);
    if (context.layout.manualOnly)
      throw new BadRequestException(
        context.layout.periodKind === 'ANNUAL'
          ? 'Complete this annual ledger from reviewed full-year HR records; monthly payroll or leave applications cannot establish annual balances'
          : 'Complete this register from reviewed supporting records; payroll totals alone cannot establish all prescribed particulars',
      );
    if (context.layout.baseFormNumber === 'MATERNITY')
      throw new BadRequestException(
        'Complete this register from authorised HR and maternity payment evidence; payroll cannot establish these events',
      );
    const allowedFields = new Set(context.layout.fields.map((f) => f.key));
    const scopeRows = (result: any) => ({
      ...result,
      rows: result.rows.map((row: any, i: number) =>
        Object.fromEntries(
          Object.entries({ serial: i + 1, ...row }).filter(
            ([key]) =>
              allowedFields.has(key) &&
              !context.layout.omitPrefillFields?.includes(key),
          ),
        ),
      ),
    });
    if (context.layout.attendanceMode === 'STATUS') {
      if (contractorId)
        throw new BadRequestException(
          'Enter daily contractor attendance from the approved attendance register; monthly totals cannot fill the Rajasthan daily muster',
        );
      return registerStatusAttendance(
        this.ds,
        context.branch.clientId,
        branchId,
        year,
        month,
      );
    }
    if (contractorId)
      return scopeRows(
        await contractorRegisterSource(
          this.ds,
          context.layout,
          context.branch.clientId,
          branchId,
          contractorId,
          year,
          month,
        ),
      );
    if (!context.layout.payrollPrefill)
      return scopeRows(
        await registerOperationalSource(
          this.ds,
          context.layout.baseFormNumber,
          context.branch.clientId,
          branchId,
          year,
          month,
        ),
      );
    const run = await this.ds
      .getRepository(PayrollRunEntity)
      .findOneBy({ id: runId });
    if (
      !run ||
      run.clientId !== context.branch.clientId ||
      (run.branchId && run.branchId !== branchId)
    ) {
      throw new ForbiddenException(
        'Payroll run does not belong to this client and branch',
      );
    }
    if (
      run.status !== 'APPROVED' ||
      !run.approvedAt ||
      run.periodYear !== year ||
      run.periodMonth !== month
    ) {
      throw new BadRequestException(
        'Select an approved payroll run for this exact period',
      );
    }
    const employees = await this.ds
      .getRepository(PayrollRunEmployeeEntity)
      .find({
        where: { runId, clientId: run.clientId, branchId },
        order: { employeeCode: 'ASC' },
        take: 501,
      });
    if (!employees.length || employees.length > 500)
      throw new BadRequestException(
        'Choose a payroll batch containing 1 to 500 branch employees',
      );
    const allowed = new Set(context.layout.fields.map((f) => f.key));
    const rows: RegisterRow[] = employees.map((e, i) => {
      const values: RegisterRow = {
        serial: i + 1,
        employeeCode: e.employeeCode,
        name: e.employeeName,
        designation: e.designation || '',
        uan: e.uan || '',
        frequency: 'Monthly',
        wagePeriod:
          context.periodStart +
          ' to ' +
          year +
          '-' +
          String(month).padStart(2, '0') +
          '-' +
          new Date(Date.UTC(year, month, 0)).getUTCDate(),
        daysWorked: String(e.daysPresent),
        otHours: String(e.otHours),
        gross: e.grossEarnings,
        deductions: e.totalDeductions,
        net: e.netPay,
      };
      for (const key of context.layout.omitPrefillFields || [])
        delete values[key];
      return Object.fromEntries(
        Object.entries(values).filter(
          ([k, v]) => allowed.has(k) && v !== null && v !== undefined,
        ),
      );
    });
    return {
      rows,
      establishment: context.branch.branchName,
      address: context.branch.address,
      sourceRunId: run.id,
      sourceApprovedAt: run.approvedAt,
      notice:
        'Only stored payroll snapshot fields are prefilled. Complete rates, deductions and payment evidence from supporting records. Daily attendance is never inferred.',
    };
  }

  async generate(id: string, input: RegisterInput, user: ReqUser) {
    const errors = validateRegister(id, input);
    if (errors.length)
      throw new BadRequestException({
        message: 'Complete the register details',
        errors,
      });
    const ctx = await this.context(
      id,
      input.branchId,
      input.year,
      input.month,
      user,
    );
    const contractor = input.contractorUserId
      ? await assertRegisterContractor(
          this.ds,
          ctx.branch.clientId,
          input.branchId,
          input.contractorUserId,
        )
      : null;
    const auditContext = {
      'Contractor ID': input.contractorUserId || '',
      'Contractor name': contractor?.name || '',
      establishment: ctx.branch.branchName || '',
      address: ctx.branch.address,
      'Client ID': ctx.branch.clientId,
      'Branch ID': ctx.branch.id,
      'Prepared by': user.id || user.userId,
      'Prepared at': new Date().toISOString(),
      'Data provenance':
        'Entered/reviewed by preparer; not an immutable approved payroll snapshot',
      'Applicability evidence': JSON.stringify(ctx.applicabilityEvidence),
    };
    const buffer = await registerWorkbook(id, input, auditContext);
    const legalHash = createHash('sha256')
      .update(id)
      .digest('hex')
      .slice(0, 32);
    const canonicalRows = input.rows.map((row) =>
      ctx.layout.fields.map((f) => {
        const value = row[f.key];
        if (value == null || value === '') return '';
        return f.type === 'money' || f.type === 'number'
          ? Number(value)
          : value;
      }),
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          schema: definition(id).schemaVersion,
          metadata: [
            input.branchId,
            input.year,
            input.month,
            input.employer,
            input.owner,
            input.employerPan,
            input.registrationNumber,
            input.issueDate,
            input.contractorUserId || '',
            input.supportingReference || '',
          ],
          rows: canonicalRows,
          ...(ctx.layout.capacityRequired
            ? { actingCapacity: input.actingCapacity }
            : {}),
          ...(ctx.layout.particulars
            ? {
                particulars: ctx.layout.particulars.map((f) => {
                  const value = input.particulars?.[f.key];
                  return value == null || value === ''
                    ? ''
                    : f.type === 'number' || f.type === 'money'
                      ? Number(value)
                      : value;
                }),
              }
            : {}),
          applicability: ctx.applicabilityEvidence,
        }),
      )
      .digest('hex')
      .slice(0, 32);
    const fileName =
      'register_' + legalHash.slice(0, 12) + '_' + fingerprint + '.xlsx';
    const dir = path.resolve(
      process.cwd(),
      'uploads',
      'registers',
      ctx.branch.clientId,
    );
    const filePath = path.join(dir, randomUUID() + '.xlsx');
    // Keep unique evidence files if commit acknowledgement is uncertain.
    return await this.ds.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [ctx.branch.id + ':' + id + ':' + input.year + ':' + input.month],
      );
      const repo = manager.getRepository(RegistersRecordEntity);
      const existing = await repo.findOneBy({
        clientId: ctx.branch.clientId,
        branchId: ctx.branch.id,
        fileName,
      });
      if (existing)
        return {
          buffer: await fs.readFile(existing.filePath),
          recordId: existing.id,
        };
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, buffer, { flag: 'wx' });
      const record = await repo.save(
        repo.create({
          clientId: ctx.branch.clientId,
          branchId: ctx.branch.id,
          payrollInputId: null,
          category: 'REGISTER',
          title: (
            (contractor ? contractor.name.slice(0, 60) + ' | ' : '') +
            ctx.form.actCode +
            ' | Form ' +
            ctx.form.formNumber +
            ' | ' +
            ctx.form.ruleReference +
            ' | ' +
            ctx.form.title
          ).slice(0, 200),
          periodYear: input.year,
          periodMonth: input.month,
          preparedByUserId: user.id || user.userId,
          fileName,
          filePath,
          fileType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: String(buffer.length),
          registerType: 'LEGAL_' + legalHash,
          stateCode: ctx.branch.stateCode,
          approvalStatus: 'PENDING',
        }),
      );
      await manager.query(
        'INSERT INTO register_preparation_scopes(register_id,contractor_user_id) VALUES ($1,$2)',
        [record.id, input.contractorUserId || null],
      );
      return { buffer, recordId: record.id };
    });
  }
}
