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
import { PayFormulaTemplateEntity } from '../entities/pay-formula-template.entity';
import { PaySalaryStructureVersionEntity } from '../entities/pay-salary-structure-version.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollEngineService } from './payroll-engine.service';
import { serializeFormula, FormulaNode } from './formula-serializer';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import {
  PreviewEmployeeDto,
  PreviewComponentDto,
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
@Roles('PAYROLL', 'ADMIN', 'CCO')
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
    @InjectRepository(PayFormulaTemplateEntity)
    private readonly templateRepo: Repository<PayFormulaTemplateEntity>,
    @InjectRepository(PaySalaryStructureVersionEntity)
    private readonly versionRepo: Repository<PaySalaryStructureVersionEntity>,
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    private readonly access: AccessScopeService,
  ) {}

  // ── Engine Processing ──────────────────────────

  @ApiOperation({ summary: 'Process With Engine' })
  @Post('runs/:runId/process')
  async processWithEngine(
    @Param('runId') runId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    await this.access.assertClientAllowed(user, run.clientId);
    return this.engineSvc.processWithEngine(runId);
  }

  @ApiOperation({ summary: 'Preview Employee' })
  @Post('preview')
  async previewEmployee(@Body() body: PreviewEmployeeDto) {
    return this.engineSvc.previewEmployee(body);
  }

  @ApiOperation({ summary: 'Preview Single Component (live editor)' })
  @Post('preview-component')
  async previewComponent(@Body() body: PreviewComponentDto) {
    return this.engineSvc.previewComponent(body);
  }

  @ApiOperation({
    summary: 'Serialize Formula JSON to text expression (visual builder)',
  })
  @Post('formula/serialize')
  serializeFormulaEndpoint(@Body() body: { formulaJson?: unknown }): {
    formulaText: string;
  } {
    if (!body?.formulaJson) {
      throw new BadRequestException('formulaJson is required');
    }
    try {
      return {
        formulaText: serializeFormula(body.formulaJson as FormulaNode),
      };
    } catch (err) {
      throw new BadRequestException(
        (err as Error).message || 'Invalid formulaJson',
      );
    }
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

  @ApiOperation({
    summary: 'List Approval Queue (PENDING structures across clients)',
  })
  @Get('structures/approval-queue')
  @Roles('CCO', 'ADMIN')
  async listApprovalQueue(@Query('status') status?: string) {
    const allowed = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];
    const s = (status || 'PENDING').toUpperCase();
    if (!allowed.includes(s)) {
      throw new BadRequestException(
        `status must be one of ${allowed.join(', ')}`,
      );
    }
    const rows = await this.structureRepo
      .createQueryBuilder('ps')
      .leftJoin('clients', 'c', 'c.id = ps.client_id')
      .addSelect('c.client_name', 'clientName')
      .where('ps.approval_status = :s', { s })
      .orderBy('ps.submitted_at', 'DESC', 'NULLS LAST')
      .addOrderBy('ps.effective_from', 'DESC')
      .getRawAndEntities();
    return rows.entities.map((e, i) => ({
      ...e,
      clientName: rows.raw[i]?.clientName ?? null,
    }));
  }

  @ApiOperation({ summary: 'List Structures' })
  @Get('structures')
  async listStructures(
    @Query('clientId') clientId: string,
    @Query('status') status?: string,
  ) {
    if (!clientId?.trim()) {
      throw new BadRequestException('clientId is required');
    }
    const where: {
      clientId: string;
      approvalStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
    } = {
      clientId: clientId.trim(),
    };
    if (status?.trim()) {
      const allowed = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];
      const s = status.trim().toUpperCase();
      if (!allowed.includes(s)) {
        throw new BadRequestException(
          `status must be one of ${allowed.join(', ')}`,
        );
      }
      where.approvalStatus = s as 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
    }
    return this.structureRepo.find({
      where,
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
      if (structure.approvalStatus !== 'APPROVED') {
        throw new ConflictException(
          `Structure must be APPROVED before it can be activated (current: ${structure.approvalStatus})`,
        );
      }
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

  // ── Approval Workflow (Phase 2B) ───────────────
  // Lifecycle: DRAFT → PENDING → APPROVED|REJECTED. Only APPROVED structures
  // are picked up by the engine (resolver also gates on approval_status).
  // Any item edit on an APPROVED structure auto-reverts it to DRAFT so it
  // must be re-submitted and re-approved.

  @ApiOperation({ summary: 'Submit Structure for Approval' })
  @Post('structures/:id/submit')
  async submitStructure(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    const s = await this.structureRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Structure not found');
    if (s.approvalStatus === 'PENDING') {
      throw new ConflictException('Structure is already pending approval');
    }
    if (s.approvalStatus === 'APPROVED') {
      throw new ConflictException(
        'Structure is already approved. Edit items to revert to DRAFT first.',
      );
    }
    s.approvalStatus = 'PENDING';
    s.submittedById = user?.userId ?? null;
    s.submittedAt = new Date();
    s.rejectedById = null;
    s.rejectedAt = null;
    s.rejectionReason = null;
    return this.structureRepo.save(s);
  }

  @ApiOperation({ summary: 'Approve Structure' })
  @Post('structures/:id/approve')
  @Roles('CCO')
  async approveStructure(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
  ) {
    const s = await this.structureRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Structure not found');
    if (s.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Only PENDING structures can be approved (current: ${s.approvalStatus})`,
      );
    }
    if (user?.userId && s.submittedById && user.userId === s.submittedById) {
      throw new ConflictException(
        'Submitter cannot approve their own structure changes',
      );
    }
    s.approvalStatus = 'APPROVED';
    s.approvedById = user?.userId ?? null;
    s.approvedAt = new Date();
    return this.structureRepo.save(s);
  }

  @ApiOperation({ summary: 'Reject Structure' })
  @Post('structures/:id/reject')
  @Roles('CCO')
  async rejectStructure(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: ReqUser,
  ) {
    const s = await this.structureRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Structure not found');
    if (s.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Only PENDING structures can be rejected (current: ${s.approvalStatus})`,
      );
    }
    const reason = (body?.reason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('Rejection reason is required');
    }
    s.approvalStatus = 'REJECTED';
    s.rejectedById = user?.userId ?? null;
    s.rejectedAt = new Date();
    s.rejectionReason = reason.slice(0, 1000);
    // Force-deactivate so a rejected version cannot be live.
    s.isActive = false;
    return this.structureRepo.save(s);
  }

  @ApiOperation({ summary: 'Withdraw Submission (PENDING → DRAFT)' })
  @Post('structures/:id/withdraw')
  async withdrawStructure(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
  ) {
    const s = await this.structureRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Structure not found');
    if (s.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Only PENDING structures can be withdrawn (current: ${s.approvalStatus})`,
      );
    }
    if (
      user?.userId &&
      s.submittedById &&
      user.userId !== s.submittedById &&
      user.roleCode !== 'CCO'
    ) {
      throw new ConflictException(
        'Only the submitter or a CCO can withdraw a pending submission',
      );
    }
    s.approvalStatus = 'DRAFT';
    s.submittedById = null;
    s.submittedAt = null;
    return this.structureRepo.save(s);
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
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureStructureExists(structureId);
    if (!body?.componentId) {
      throw new BadRequestException('componentId is required');
    }
    await this.revertApprovalIfApproved(structureId);
    const patch = this.applyFormulaJson(body);
    const item = this.itemRepo.create({ ...patch, structureId });
    const saved = await this.itemRepo.save(item);
    await this.snapshotStructureVersion(
      structureId,
      'item.create',
      user?.userId,
    );
    return saved;
  }

  @ApiOperation({ summary: 'Update Structure Item' })
  @Put('structures/:structureId/items/:itemId')
  async updateStructureItem(
    @Param('structureId') structureId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateStructureItemDto,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureStructureExists(structureId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, structureId },
    });
    if (!item) throw new NotFoundException('Structure item not found');
    await this.revertApprovalIfApproved(structureId);
    const patch = this.applyFormulaJson(body);
    this.itemRepo.merge(item, patch as Partial<PaySalaryStructureItemEntity>);
    const saved = await this.itemRepo.save(item);
    await this.snapshotStructureVersion(
      structureId,
      'item.update',
      user?.userId,
    );
    return saved;
  }

  @ApiOperation({ summary: 'Delete Structure Item' })
  @Delete('structures/:structureId/items/:itemId')
  async deleteStructureItem(
    @Param('structureId') structureId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureStructureExists(structureId);
    const item = await this.itemRepo.findOne({
      where: { id: itemId, structureId },
    });
    if (!item) throw new NotFoundException('Structure item not found');
    await this.revertApprovalIfApproved(structureId);
    const removed = await this.itemRepo.remove(item);
    await this.snapshotStructureVersion(
      structureId,
      'item.delete',
      user?.userId,
    );
    return removed;
  }

  // ── Bulk update items (replace all items for a structure) ──

  @ApiOperation({ summary: 'Bulk Update Items' })
  @Post('structures/:structureId/items/bulk')
  async bulkUpdateItems(
    @Param('structureId') structureId: string,
    @Body() body: { items: CreateStructureItemDto[] },
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureStructureExists(structureId);
    if (!body || !Array.isArray(body.items)) {
      throw new BadRequestException('items array is required');
    }
    await this.revertApprovalIfApproved(structureId);
    await this.itemRepo.delete({ structureId });
    const items = body.items.map((item) =>
      this.itemRepo.create({ ...this.applyFormulaJson(item), structureId }),
    );
    const saved = await this.itemRepo.save(items);
    await this.snapshotStructureVersion(
      structureId,
      'items.bulk',
      user?.userId,
    );
    return saved;
  }

  // ── Structure Versions (audit / restore) ──

  @ApiOperation({ summary: 'List Structure Versions' })
  @Get('structures/:structureId/versions')
  async listStructureVersions(@Param('structureId') structureId: string) {
    await this.ensureStructureExists(structureId);
    return this.versionRepo.find({
      where: { structureId },
      order: { versionNo: 'DESC' },
      take: 100,
    });
  }

  // ── Formula Templates CRUD ──

  @ApiOperation({ summary: 'List Formula Templates' })
  @Get('formula-templates')
  async listFormulaTemplates(
    @Query('clientId') clientId?: string,
    @Query('componentId') componentId?: string,
  ) {
    const qb = this.templateRepo
      .createQueryBuilder('t')
      .where('t.isActive = true');
    if (clientId?.trim()) {
      qb.andWhere('(t.clientId IS NULL OR t.clientId = :cid)', {
        cid: clientId.trim(),
      });
    } else {
      qb.andWhere('t.clientId IS NULL');
    }
    if (componentId?.trim()) {
      qb.andWhere('(t.componentId IS NULL OR t.componentId = :comp)', {
        comp: componentId.trim(),
      });
    }
    return qb
      .orderBy('t.clientId', 'DESC')
      .addOrderBy('t.name', 'ASC')
      .getMany();
  }

  @ApiOperation({ summary: 'Create Formula Template' })
  @Post('formula-templates')
  async createFormulaTemplate(
    @Body()
    body: {
      name?: string;
      description?: string | null;
      clientId?: string | null;
      componentId?: string | null;
      formulaJson?: Record<string, unknown>;
    },
    @CurrentUser() user: ReqUser,
  ) {
    const name = this.requireTrimmed(body?.name, 'name');
    if (!body?.formulaJson)
      throw new BadRequestException('formulaJson is required');
    let formulaText: string;
    try {
      formulaText = serializeFormula(
        body.formulaJson as unknown as FormulaNode,
      );
    } catch (err) {
      throw new BadRequestException(
        (err as Error).message || 'Invalid formulaJson',
      );
    }
    const tpl = this.templateRepo.create({
      name,
      description: this.optionalTrimmed(body.description),
      clientId: body.clientId?.trim() || null,
      componentId: body.componentId?.trim() || null,
      formulaJson: body.formulaJson,
      formulaText,
      isActive: true,
      createdById: user?.userId || null,
    });
    return this.templateRepo.save(tpl);
  }

  @ApiOperation({ summary: 'Update Formula Template' })
  @Put('formula-templates/:id')
  async updateFormulaTemplate(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      componentId?: string | null;
      formulaJson?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    if (body.name !== undefined)
      tpl.name = this.requireTrimmed(body.name, 'name');
    if (body.description !== undefined)
      tpl.description = this.optionalTrimmed(body.description);
    if (body.componentId !== undefined)
      tpl.componentId = body.componentId?.trim() || null;
    if (body.isActive !== undefined) tpl.isActive = !!body.isActive;
    if (body.formulaJson !== undefined && body.formulaJson !== null) {
      try {
        tpl.formulaText = serializeFormula(
          body.formulaJson as unknown as FormulaNode,
        );
      } catch (err) {
        throw new BadRequestException(
          (err as Error).message || 'Invalid formulaJson',
        );
      }
      tpl.formulaJson = body.formulaJson;
    }
    return this.templateRepo.save(tpl);
  }

  @ApiOperation({ summary: 'Delete Formula Template' })
  @Delete('formula-templates/:id')
  async deleteFormulaTemplate(@Param('id') id: string) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    await this.templateRepo.remove(tpl);
    return { success: true };
  }

  /**
   * Append a JSONB snapshot of all current items for the structure.
   * Best-effort — never throws into the caller's response.
   */
  /**
   * Editing items on an APPROVED structure invalidates that approval — flip
   * it back to DRAFT and force-deactivate so the engine immediately stops
   * picking it up until it is re-submitted and re-approved.
   */
  private async revertApprovalIfApproved(structureId: string): Promise<void> {
    const s = await this.structureRepo.findOne({ where: { id: structureId } });
    if (!s) return;
    if (s.approvalStatus === 'APPROVED' || s.approvalStatus === 'PENDING') {
      s.approvalStatus = 'DRAFT';
      s.isActive = false;
      s.submittedById = null;
      s.submittedAt = null;
      s.approvedById = null;
      s.approvedAt = null;
      await this.structureRepo.save(s);
    }
  }

  private async snapshotStructureVersion(
    structureId: string,
    reason: string,
    userId?: string | null,
  ): Promise<void> {
    try {
      const items = await this.itemRepo.find({
        where: { structureId },
        order: { priority: 'ASC' },
      });
      const last = await this.versionRepo.findOne({
        where: { structureId },
        order: { versionNo: 'DESC' },
      });
      const versionNo = (last?.versionNo || 0) + 1;
      await this.versionRepo.save(
        this.versionRepo.create({
          structureId,
          versionNo,
          itemsSnapshot: items as unknown as Record<string, unknown>[],
          reason: reason.slice(0, 80),
          changedById: userId || null,
        }),
      );
    } catch (err) {
      // Non-fatal: log to stderr and continue.

      console.error('[snapshotStructureVersion] failed', err);
    }
  }

  /**
   * If the caller submitted `formulaJson` (from the no-code Visual Formula
   * Builder), serialize it to a text expression and store both. Plain text
   * `formula` strings are passed through unchanged.
   */
  private applyFormulaJson<T extends CreateStructureItemDto>(body: T): T {
    if (!body || !body.formulaJson) return body;
    try {
      const text = serializeFormula(body.formulaJson as unknown as FormulaNode);
      return { ...body, formula: text };
    } catch (err) {
      throw new BadRequestException(
        (err as Error).message || 'Invalid formula JSON',
      );
    }
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
