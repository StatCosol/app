import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PayRuleSetEntity } from '../entities/pay-rule-set.entity';
import { PayRuleParameterEntity } from '../entities/pay-rule-parameter.entity';
import { PaySalaryStructureEntity } from '../entities/pay-salary-structure.entity';
import { PaySalaryStructureItemEntity } from '../entities/pay-salary-structure-item.entity';
import { PayrollEngineService } from './payroll-engine.service';
import {
  PreviewEmployeeDto,
  CreateRuleSetDto,
  UpdateRuleSetDto,
  CreateParameterDto,
  UpdateParameterDto,
  CreateStructureDto,
  UpdateStructureDto,
  CreateStructureItemDto,
  UpdateStructureItemDto,
} from './dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/engine', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollEngineController {
  constructor(
    private readonly engineSvc: PayrollEngineService,
    @InjectRepository(PayRuleSetEntity)
    private readonly ruleSetRepo: Repository<PayRuleSetEntity>,
    @InjectRepository(PayRuleParameterEntity)
    private readonly paramRepo: Repository<PayRuleParameterEntity>,
    @InjectRepository(PaySalaryStructureEntity)
    private readonly structureRepo: Repository<PaySalaryStructureEntity>,
    @InjectRepository(PaySalaryStructureItemEntity)
    private readonly itemRepo: Repository<PaySalaryStructureItemEntity>,
  ) {}

  // ── Engine Processing ──────────────────────────

  @ApiOperation({ summary: 'Process With Engine' })
  @Post('runs/:runId/process')
  async processWithEngine(@Param('runId') runId: string) {
    return this.engineSvc.processWithEngine(runId);
  }

  @ApiOperation({ summary: 'Preview Employee' })
  @Post('preview')
  async previewEmployee(@Body() body: PreviewEmployeeDto) {
    return this.engineSvc.previewEmployee(body);
  }

  // ── Rule Sets CRUD ─────────────────────────────

  @ApiOperation({ summary: 'List Rule Sets' })
  @Get('rule-sets')
  async listRuleSets(@Query('clientId') clientId: string) {
    if (!clientId?.trim()) {
      throw new BadRequestException('clientId is required');
    }
    return this.ruleSetRepo.find({
      where: { clientId: clientId.trim() },
      order: { isActive: 'DESC', effectiveFrom: 'DESC' },
    });
  }

  @ApiOperation({ summary: 'Get Rule Set' })
  @Get('rule-sets/:id')
  async getRuleSet(@Param('id') id: string) {
    const ruleSet = await this.ruleSetRepo.findOne({ where: { id } });
    if (!ruleSet) throw new NotFoundException('Rule set not found');
    return ruleSet;
  }

  @ApiOperation({ summary: 'Create Rule Set' })
  @Post('rule-sets')
  async createRuleSet(@Body() body: CreateRuleSetDto) {
    const clientId = this.requireTrimmed(body.clientId, 'clientId');
    const name = this.requireTrimmed(body.name, 'name');
    const branchId = this.optionalTrimmed(body.branchId);
    const effectiveFrom = this.parseRequiredIsoDate(
      body.effectiveFrom,
      'effectiveFrom',
    );
    const effectiveTo = this.parseOptionalIsoDate(
      body.effectiveTo,
      'effectiveTo',
    );
    this.validateDateWindow(effectiveFrom, effectiveTo);

    await this.ensureNoOverlappingRuleSet({
      clientId,
      name,
      branchId,
      effectiveFrom,
      effectiveTo,
    });

    // New versions are created inactive and explicitly activated after review.
    const ruleSet = this.ruleSetRepo.create({
      clientId,
      name,
      branchId,
      effectiveFrom,
      effectiveTo,
      isActive: false,
    });
    return this.ruleSetRepo.save(ruleSet);
  }

  @ApiOperation({ summary: 'Update Rule Set' })
  @Put('rule-sets/:id')
  async updateRuleSet(@Param('id') id: string, @Body() body: UpdateRuleSetDto) {
    const ruleSet = await this.ruleSetRepo.findOne({ where: { id } });
    if (!ruleSet) throw new NotFoundException('Rule set not found');

    const name =
      body.name !== undefined
        ? this.requireTrimmed(body.name, 'name')
        : ruleSet.name;
    const branchId =
      body.branchId !== undefined
        ? this.optionalTrimmed(body.branchId)
        : ruleSet.branchId;
    const effectiveFrom =
      body.effectiveFrom !== undefined
        ? this.parseRequiredIsoDate(body.effectiveFrom, 'effectiveFrom')
        : ruleSet.effectiveFrom;
    const effectiveTo =
      body.effectiveTo !== undefined
        ? this.parseOptionalIsoDate(body.effectiveTo, 'effectiveTo')
        : ruleSet.effectiveTo;
    const isActive = body.isActive ?? ruleSet.isActive;

    this.validateDateWindow(effectiveFrom, effectiveTo);

    await this.ensureNoOverlappingRuleSet({
      clientId: ruleSet.clientId,
      name,
      branchId,
      effectiveFrom,
      effectiveTo,
      excludeRuleSetId: ruleSet.id,
    });

    if (isActive) {
      await this.assertRuleSetActivatable(
        ruleSet.id,
        effectiveFrom,
        effectiveTo,
      );
    }

    return this.ruleSetRepo.manager.transaction(async (manager) => {
      const txRuleSetRepo = manager.getRepository(PayRuleSetEntity);

      if (isActive) {
        const activeSiblingsQb = txRuleSetRepo
          .createQueryBuilder('rs')
          .where('rs.clientId = :clientId', { clientId: ruleSet.clientId })
          .andWhere('LOWER(rs.name) = LOWER(:name)', { name })
          .andWhere('rs.id != :id', { id: ruleSet.id })
          .andWhere('rs.isActive = true');
        this.applyBranchFilter(activeSiblingsQb, 'rs', branchId);
        const activeSiblings = await activeSiblingsQb.getMany();
        if (activeSiblings.length) {
          for (const sibling of activeSiblings) sibling.isActive = false;
          await txRuleSetRepo.save(activeSiblings);
        }
      }

      ruleSet.name = name;
      ruleSet.branchId = branchId;
      ruleSet.effectiveFrom = effectiveFrom;
      ruleSet.effectiveTo = effectiveTo;
      ruleSet.isActive = isActive;
      return txRuleSetRepo.save(ruleSet);
    });
  }

  @ApiOperation({ summary: 'Delete Rule Set' })
  @Delete('rule-sets/:id')
  async deleteRuleSet(@Param('id') id: string) {
    const ruleSet = await this.ruleSetRepo.findOne({ where: { id } });
    if (!ruleSet) throw new NotFoundException('Rule set not found');
    ruleSet.isActive = false;
    return this.ruleSetRepo.save(ruleSet);
  }

  // ── Rule Set Parameters CRUD ───────────────────

  @ApiOperation({ summary: 'List Parameters' })
  @Get('rule-sets/:ruleSetId/parameters')
  async listParameters(@Param('ruleSetId') ruleSetId: string) {
    return this.paramRepo.find({ where: { ruleSetId } });
  }

  @ApiOperation({ summary: 'Create Parameter' })
  @Post('rule-sets/:ruleSetId/parameters')
  async createParameter(
    @Param('ruleSetId') ruleSetId: string,
    @Body() body: CreateParameterDto,
  ) {
    await this.ensureRuleSetExists(ruleSetId);

    const key = this.requireTrimmed(body.key, 'key').toUpperCase();
    const existing = await this.paramRepo.findOne({
      where: { ruleSetId, key },
    });
    if (existing) {
      throw new ConflictException(
        `Parameter ${key} already exists for this rule set`,
      );
    }

    const param = this.paramRepo.create({
      ruleSetId,
      key,
      valueNum: body.valueNum ?? null,
      valueText: this.optionalTrimmed(body.valueText),
      unit: this.optionalTrimmed(body.unit),
      notes: this.optionalTrimmed(body.notes),
    });
    return this.paramRepo.save(param);
  }

  @ApiOperation({ summary: 'Update Parameter' })
  @Put('rule-sets/:ruleSetId/parameters/:paramId')
  async updateParameter(
    @Param('ruleSetId') ruleSetId: string,
    @Param('paramId') paramId: string,
    @Body() body: UpdateParameterDto,
  ) {
    await this.ensureRuleSetExists(ruleSetId);
    const param = await this.paramRepo.findOne({
      where: { id: paramId, ruleSetId },
    });
    if (!param) throw new NotFoundException('Parameter not found');

    const nextKey =
      body.key !== undefined
        ? this.requireTrimmed(body.key, 'key').toUpperCase()
        : param.key;

    if (nextKey !== param.key) {
      const keyExists = await this.paramRepo.findOne({
        where: { ruleSetId, key: nextKey },
      });
      if (keyExists) {
        throw new ConflictException(
          `Parameter ${nextKey} already exists for this rule set`,
        );
      }
    }

    this.paramRepo.merge(param, {
      key: nextKey,
      valueNum: body.valueNum !== undefined ? body.valueNum : param.valueNum,
      valueText:
        body.valueText !== undefined
          ? this.optionalTrimmed(body.valueText)
          : param.valueText,
      unit:
        body.unit !== undefined ? this.optionalTrimmed(body.unit) : param.unit,
      notes:
        body.notes !== undefined
          ? this.optionalTrimmed(body.notes)
          : param.notes,
    });
    return this.paramRepo.save(param);
  }

  @ApiOperation({ summary: 'Delete Parameter' })
  @Delete('rule-sets/:ruleSetId/parameters/:paramId')
  async deleteParameter(
    @Param('ruleSetId') ruleSetId: string,
    @Param('paramId') paramId: string,
  ) {
    await this.ensureRuleSetExists(ruleSetId);
    const param = await this.paramRepo.findOne({
      where: { id: paramId, ruleSetId },
    });
    if (!param) throw new NotFoundException('Parameter not found');
    return this.paramRepo.remove(param);
  }

  // ── Salary Structures CRUD ─────────────────────

  @ApiOperation({ summary: 'List Structures' })
  @Get('structures')
  async listStructures(@Query('clientId') clientId: string) {
    if (!clientId?.trim()) {
      throw new BadRequestException('clientId is required');
    }
    return this.structureRepo.find({
      where: { clientId: clientId.trim() },
      order: { scopeType: 'ASC', effectiveFrom: 'DESC' },
    });
  }

  @ApiOperation({ summary: 'Get Structure' })
  @Get('structures/:id')
  async getStructure(@Param('id') id: string) {
    const structure = await this.structureRepo.findOne({ where: { id } });
    if (!structure) throw new NotFoundException('Structure not found');
    return structure;
  }

  @ApiOperation({ summary: 'Create Structure' })
  @Post('structures')
  async createStructure(@Body() body: CreateStructureDto) {
    const clientId = this.requireTrimmed(body.clientId, 'clientId');
    const name = this.requireTrimmed(body.name, 'name');
    const scopeType = this.normalizeScopeType(body.scopeType);
    const effectiveFrom = this.parseRequiredIsoDate(
      body.effectiveFrom,
      'effectiveFrom',
    );
    const effectiveTo = this.parseOptionalIsoDate(
      body.effectiveTo,
      'effectiveTo',
    );
    this.validateDateWindow(effectiveFrom, effectiveTo);

    const scopeTargets = this.normalizeScopeTargets(scopeType, {
      branchId: body.branchId,
      departmentId: body.departmentId,
      gradeId: body.gradeId,
      employeeId: body.employeeId,
    });

    const ruleSetId = this.requireTrimmed(body.ruleSetId, 'ruleSetId');
    await this.ensureRuleSetBelongsToClient(ruleSetId, clientId);

    await this.ensureNoOverlappingStructure({
      clientId,
      scopeType,
      ...scopeTargets,
      effectiveFrom,
      effectiveTo,
    });

    const structure = this.structureRepo.create({
      clientId,
      name,
      scopeType,
      ruleSetId,
      effectiveFrom,
      effectiveTo,
      isActive: false,
      ...scopeTargets,
    });
    return this.structureRepo.save(structure);
  }

  @ApiOperation({ summary: 'Update Structure' })
  @Put('structures/:id')
  async updateStructure(
    @Param('id') id: string,
    @Body() body: UpdateStructureDto,
  ) {
    const structure = await this.structureRepo.findOne({ where: { id } });
    if (!structure) throw new NotFoundException('Structure not found');

    const name =
      body.name !== undefined
        ? this.requireTrimmed(body.name, 'name')
        : structure.name;
    const scopeType =
      body.scopeType !== undefined
        ? this.normalizeScopeType(body.scopeType)
        : structure.scopeType;
    const effectiveFrom =
      body.effectiveFrom !== undefined
        ? this.parseRequiredIsoDate(body.effectiveFrom, 'effectiveFrom')
        : structure.effectiveFrom;
    const effectiveTo =
      body.effectiveTo !== undefined
        ? this.parseOptionalIsoDate(body.effectiveTo, 'effectiveTo')
        : structure.effectiveTo;
    const isActive = body.isActive ?? structure.isActive;

    this.validateDateWindow(effectiveFrom, effectiveTo);

    const scopeTargets = this.normalizeScopeTargets(scopeType, {
      branchId:
        body.branchId !== undefined ? body.branchId : structure.branchId,
      departmentId:
        body.departmentId !== undefined
          ? body.departmentId
          : structure.departmentId,
      gradeId: body.gradeId !== undefined ? body.gradeId : structure.gradeId,
      employeeId:
        body.employeeId !== undefined ? body.employeeId : structure.employeeId,
    });

    const ruleSetId =
      body.ruleSetId !== undefined
        ? this.requireTrimmed(body.ruleSetId, 'ruleSetId')
        : structure.ruleSetId;
    await this.ensureRuleSetBelongsToClient(ruleSetId, structure.clientId);

    await this.ensureNoOverlappingStructure({
      clientId: structure.clientId,
      scopeType,
      ...scopeTargets,
      effectiveFrom,
      effectiveTo,
      excludeStructureId: structure.id,
    });

    if (isActive) {
      await this.assertStructureActivatable(
        structure.id,
        effectiveFrom,
        effectiveTo,
      );
    }

    return this.structureRepo.manager.transaction(async (manager) => {
      const txStructureRepo = manager.getRepository(PaySalaryStructureEntity);

      if (isActive) {
        const activeSiblingsQb = txStructureRepo
          .createQueryBuilder('s')
          .where('s.clientId = :clientId', { clientId: structure.clientId })
          .andWhere('s.scopeType = :scopeType', { scopeType })
          .andWhere('s.id != :id', { id: structure.id })
          .andWhere('s.isActive = true');
        this.applyStructureScopeFilter(activeSiblingsQb, 's', scopeTargets);
        const activeSiblings = await activeSiblingsQb.getMany();
        if (activeSiblings.length) {
          for (const sibling of activeSiblings) sibling.isActive = false;
          await txStructureRepo.save(activeSiblings);
        }
      }

      structure.name = name;
      structure.scopeType = scopeType;
      structure.branchId = scopeTargets.branchId;
      structure.departmentId = scopeTargets.departmentId;
      structure.gradeId = scopeTargets.gradeId;
      structure.employeeId = scopeTargets.employeeId;
      structure.ruleSetId = ruleSetId;
      structure.effectiveFrom = effectiveFrom;
      structure.effectiveTo = effectiveTo;
      structure.isActive = isActive;

      return txStructureRepo.save(structure);
    });
  }

  @ApiOperation({ summary: 'Delete Structure' })
  @Delete('structures/:id')
  async deleteStructure(@Param('id') id: string) {
    const structure = await this.structureRepo.findOne({ where: { id } });
    if (!structure) throw new NotFoundException('Structure not found');
    if (structure.isActive) {
      throw new BadRequestException(
        'Active structure cannot be deleted. Activate another version first.',
      );
    }

    await this.structureRepo.manager.transaction(async (manager) => {
      const traceColumnExists = await manager.query(
        `SELECT 1
           FROM information_schema.columns
          WHERE table_name = 'pay_calc_traces'
            AND column_name = 'structure_id'
          LIMIT 1`,
      );
      if (traceColumnExists?.length) {
        await manager.query(
          'DELETE FROM pay_calc_traces WHERE structure_id = $1',
          [id],
        );
      }

      await manager.delete(PaySalaryStructureItemEntity, { structureId: id });
      const deleted = await manager.delete(PaySalaryStructureEntity, { id });
      if (!deleted.affected) {
        throw new ConflictException('Structure could not be deleted');
      }
    });

    return { success: true };
  }

  // ── Structure Items CRUD ───────────────────────

  @ApiOperation({ summary: 'List Structure Items' })
  @Get('structures/:structureId/items')
  async listStructureItems(@Param('structureId') structureId: string) {
    await this.ensureStructureExists(structureId);
    return this.itemRepo.find({
      where: { structureId },
      order: { priority: 'ASC' },
    });
  }

  @ApiOperation({ summary: 'Create Structure Item' })
  @Post('structures/:structureId/items')
  async createStructureItem(
    @Param('structureId') structureId: string,
    @Body() body: CreateStructureItemDto,
  ) {
    await this.ensureStructureExists(structureId);
    if (!body?.componentId) {
      throw new BadRequestException('componentId is required');
    }
    const item = this.itemRepo.create({ ...body, structureId });
    return this.itemRepo.save(item);
  }

  @ApiOperation({ summary: 'Update Structure Item' })
  @Put('structures/:structureId/items/:itemId')
  async updateStructureItem(
    @Param('structureId') structureId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateStructureItemDto,
  ) {
    await this.ensureStructureExists(structureId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, structureId },
    });
    if (!item) throw new NotFoundException('Structure item not found');
    this.itemRepo.merge(item, body as Partial<PaySalaryStructureItemEntity>);
    return this.itemRepo.save(item);
  }

  @ApiOperation({ summary: 'Delete Structure Item' })
  @Delete('structures/:structureId/items/:itemId')
  async deleteStructureItem(
    @Param('structureId') structureId: string,
    @Param('itemId') itemId: string,
  ) {
    await this.ensureStructureExists(structureId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, structureId },
    });
    if (!item) throw new NotFoundException('Structure item not found');
    return this.itemRepo.remove(item);
  }

  // ── Bulk update items (replace all items for a structure) ──

  @ApiOperation({ summary: 'Bulk Update Items' })
  @Post('structures/:structureId/items/bulk')
  async bulkUpdateItems(
    @Param('structureId') structureId: string,
    @Body() body: { items: CreateStructureItemDto[] },
  ) {
    await this.ensureStructureExists(structureId);
    if (!body || !Array.isArray(body.items)) {
      throw new BadRequestException('items array is required');
    }
    await this.itemRepo.delete({ structureId });
    const items = body.items.map((item) =>
      this.itemRepo.create({ ...item, structureId }),
    );
    return this.itemRepo.save(items);
  }

  private requireTrimmed(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return value.trim();
  }

  private optionalTrimmed(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid string value');
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private parseRequiredIsoDate(value: unknown, fieldName: string): string {
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return this.parseIsoDateValue(value, fieldName);
  }

  private parseOptionalIsoDate(
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return this.parseIsoDateValue(value, fieldName);
  }

  private parseIsoDateValue(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a date string`);
    }
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(
        `${fieldName} must be in YYYY-MM-DD format`,
      );
    }
    const dt = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return trimmed;
  }

  private validateDateWindow(
    effectiveFrom: string,
    effectiveTo: string | null,
  ): void {
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo cannot be before effectiveFrom',
      );
    }
  }

  private applyBranchFilter(
    qb: any,
    alias: string,
    branchId: string | null,
  ): void {
    if (branchId) {
      qb.andWhere(`${alias}.branchId = :branchId`, { branchId });
      return;
    }
    qb.andWhere(`${alias}.branchId IS NULL`);
  }

  private async ensureNoOverlappingRuleSet(args: {
    clientId: string;
    name: string;
    branchId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    excludeRuleSetId?: string;
  }): Promise<void> {
    const qb = this.ruleSetRepo
      .createQueryBuilder('rs')
      .where('rs.clientId = :clientId', { clientId: args.clientId })
      .andWhere('LOWER(rs.name) = LOWER(:name)', { name: args.name })
      .andWhere('rs.effectiveFrom <= :newTo', {
        newTo: args.effectiveTo ?? '9999-12-31',
      })
      .andWhere('(rs.effectiveTo IS NULL OR rs.effectiveTo >= :newFrom)', {
        newFrom: args.effectiveFrom,
      });
    this.applyBranchFilter(qb, 'rs', args.branchId);

    if (args.excludeRuleSetId) {
      qb.andWhere('rs.id != :excludeId', { excludeId: args.excludeRuleSetId });
    }

    const overlap = await qb.getOne();
    if (overlap) {
      throw new ConflictException(
        'Overlapping effective date range exists for the same rule set family',
      );
    }
  }

  private async assertRuleSetActivatable(
    ruleSetId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (effectiveFrom > today) {
      throw new BadRequestException(
        `Cannot activate before effective date ${effectiveFrom}`,
      );
    }
    if (effectiveTo && effectiveTo < today) {
      throw new BadRequestException(
        `Cannot activate expired version (ended ${effectiveTo})`,
      );
    }

    const paramCount = await this.paramRepo.count({ where: { ruleSetId } });
    if (paramCount === 0) {
      throw new BadRequestException(
        'Add at least one parameter before activating this version',
      );
    }
  }

  private async ensureRuleSetExists(ruleSetId: string): Promise<void> {
    const exists = await this.ruleSetRepo.findOne({ where: { id: ruleSetId } });
    if (!exists) {
      throw new NotFoundException('Rule set not found');
    }
  }

  private normalizeScopeType(
    scopeType: unknown,
  ): PaySalaryStructureEntity['scopeType'] {
    const value = this.requireTrimmed(scopeType, 'scopeType').toUpperCase();
    const allowed = new Set([
      'TENANT',
      'BRANCH',
      'DEPARTMENT',
      'GRADE',
      'EMPLOYEE',
    ]);
    if (!allowed.has(value)) {
      throw new BadRequestException(
        'scopeType must be TENANT | BRANCH | DEPARTMENT | GRADE | EMPLOYEE',
      );
    }
    return value as PaySalaryStructureEntity['scopeType'];
  }

  private normalizeScopeTargets(
    scopeType: PaySalaryStructureEntity['scopeType'],
    raw: {
      branchId?: unknown;
      departmentId?: unknown;
      gradeId?: unknown;
      employeeId?: unknown;
    },
  ): {
    branchId: string | null;
    departmentId: string | null;
    gradeId: string | null;
    employeeId: string | null;
  } {
    const branchId = this.optionalTrimmed(raw.branchId);
    const departmentId = this.optionalTrimmed(raw.departmentId);
    const gradeId = this.optionalTrimmed(raw.gradeId);
    const employeeId = this.optionalTrimmed(raw.employeeId);

    if (scopeType === 'TENANT') {
      return {
        branchId: null,
        departmentId: null,
        gradeId: null,
        employeeId: null,
      };
    }
    if (scopeType === 'BRANCH') {
      if (!branchId)
        throw new BadRequestException('branchId is required for BRANCH scope');
      return { branchId, departmentId: null, gradeId: null, employeeId: null };
    }
    if (scopeType === 'DEPARTMENT') {
      if (!departmentId) {
        throw new BadRequestException(
          'departmentId is required for DEPARTMENT scope',
        );
      }
      return { branchId: null, departmentId, gradeId: null, employeeId: null };
    }
    if (scopeType === 'GRADE') {
      if (!gradeId)
        throw new BadRequestException('gradeId is required for GRADE scope');
      return { branchId: null, departmentId: null, gradeId, employeeId: null };
    }
    if (!employeeId) {
      throw new BadRequestException(
        'employeeId is required for EMPLOYEE scope',
      );
    }
    return { branchId: null, departmentId: null, gradeId: null, employeeId };
  }

  private applyStructureScopeFilter(
    qb: any,
    alias: string,
    targets: {
      branchId: string | null;
      departmentId: string | null;
      gradeId: string | null;
      employeeId: string | null;
    },
  ): void {
    if (targets.branchId)
      qb.andWhere(`${alias}.branchId = :branchId`, {
        branchId: targets.branchId,
      });
    else qb.andWhere(`${alias}.branchId IS NULL`);

    if (targets.departmentId) {
      qb.andWhere(`${alias}.departmentId = :departmentId`, {
        departmentId: targets.departmentId,
      });
    } else qb.andWhere(`${alias}.departmentId IS NULL`);

    if (targets.gradeId)
      qb.andWhere(`${alias}.gradeId = :gradeId`, { gradeId: targets.gradeId });
    else qb.andWhere(`${alias}.gradeId IS NULL`);

    if (targets.employeeId) {
      qb.andWhere(`${alias}.employeeId = :employeeId`, {
        employeeId: targets.employeeId,
      });
    } else qb.andWhere(`${alias}.employeeId IS NULL`);
  }

  private async ensureNoOverlappingStructure(args: {
    clientId: string;
    scopeType: PaySalaryStructureEntity['scopeType'];
    branchId: string | null;
    departmentId: string | null;
    gradeId: string | null;
    employeeId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    excludeStructureId?: string;
  }): Promise<void> {
    const qb = this.structureRepo
      .createQueryBuilder('s')
      .where('s.clientId = :clientId', { clientId: args.clientId })
      .andWhere('s.scopeType = :scopeType', { scopeType: args.scopeType })
      .andWhere('s.effectiveFrom <= :newTo', {
        newTo: args.effectiveTo ?? '9999-12-31',
      })
      .andWhere('(s.effectiveTo IS NULL OR s.effectiveTo >= :newFrom)', {
        newFrom: args.effectiveFrom,
      });
    this.applyStructureScopeFilter(qb, 's', {
      branchId: args.branchId,
      departmentId: args.departmentId,
      gradeId: args.gradeId,
      employeeId: args.employeeId,
    });

    if (args.excludeStructureId) {
      qb.andWhere('s.id != :excludeId', { excludeId: args.excludeStructureId });
    }

    const overlap = await qb.getOne();
    if (overlap) {
      throw new ConflictException(
        'Overlapping effective date range exists for the same structure scope',
      );
    }
  }

  private async assertStructureActivatable(
    structureId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (effectiveFrom > today) {
      throw new BadRequestException(
        `Cannot activate before effective date ${effectiveFrom}`,
      );
    }
    if (effectiveTo && effectiveTo < today) {
      throw new BadRequestException(
        `Cannot activate expired version (ended ${effectiveTo})`,
      );
    }
    const enabledCount = await this.itemRepo.count({
      where: { structureId, enabled: true },
    });
    if (enabledCount === 0) {
      throw new BadRequestException(
        'Add at least one enabled structure mapping before activation',
      );
    }
  }

  private async ensureRuleSetBelongsToClient(
    ruleSetId: string,
    clientId: string,
  ): Promise<void> {
    const ruleSet = await this.ruleSetRepo.findOne({
      where: { id: ruleSetId, clientId },
    });
    if (!ruleSet) {
      throw new BadRequestException(
        'ruleSetId is invalid for the selected client',
      );
    }
  }

  private async ensureStructureExists(structureId: string): Promise<void> {
    const structure = await this.structureRepo.findOne({
      where: { id: structureId },
    });
    if (!structure) {
      throw new NotFoundException('Structure not found');
    }
  }
}
