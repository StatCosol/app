import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UnitComplianceMasterEntity,
  CompliancePackageEntity,
  PackageComplianceEntity,
  ApplicabilityRuleEntity,
  PackageRuleEntity,
} from '../masters/entities';
import type {
  ComplianceCategory,
  ComplianceFrequency,
  AppliesTo,
  RuleEffect,
} from '../masters/entities';
import * as ExcelJS from 'exceljs';

@Injectable()
export class AdminApplicabilityConfigService {
  constructor(
    @InjectRepository(UnitComplianceMasterEntity)
    private readonly complianceRepo: Repository<UnitComplianceMasterEntity>,
    @InjectRepository(CompliancePackageEntity)
    private readonly packageRepo: Repository<CompliancePackageEntity>,
    @InjectRepository(PackageComplianceEntity)
    private readonly packageComplianceRepo: Repository<PackageComplianceEntity>,
    @InjectRepository(ApplicabilityRuleEntity)
    private readonly ruleRepo: Repository<ApplicabilityRuleEntity>,
    @InjectRepository(PackageRuleEntity)
    private readonly packageRuleRepo: Repository<PackageRuleEntity>,
  ) {}

  private cellText(value: ExcelJS.CellValue | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value).trim();
    }
    if (value instanceof Date) {
      return value.toISOString().trim();
    }
    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') {
        return value.text.trim();
      }
      if (
        'result' in value &&
        (typeof value.result === 'string' ||
          typeof value.result === 'number' ||
          typeof value.result === 'boolean')
      ) {
        return String(value.result).trim();
      }
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText
          .map((item) => item.text)
          .join('')
          .trim();
      }
    }
    return '';
  }

  // ============ Compliance Items (unit_compliance_master) ============

  async listComplianceItems() {
    return this.complianceRepo.find({ order: { code: 'ASC' } });
  }

  async createComplianceItem(dto: {
    code: string;
    name: string;
    category?: string;
    stateCode?: string;
    frequency?: string;
    appliesTo?: string;
  }) {
    if (!dto.code || !dto.name) {
      throw new BadRequestException('code and name are required');
    }
    const existing = await this.complianceRepo.findOne({
      where: { code: dto.code },
    });
    if (existing)
      throw new ConflictException(
        'Compliance item with code "' + dto.code + '" already exists',
      );

    const item = this.complianceRepo.create({
      code: dto.code,
      name: dto.name,
      category: (dto.category as ComplianceCategory) || 'LABOUR_CODE',
      stateCode: dto.stateCode || null,
      frequency: (dto.frequency as ComplianceFrequency) || 'MONTHLY',
      appliesTo: (dto.appliesTo as AppliesTo) || 'BOTH',
      isActive: true,
    });
    return this.complianceRepo.save(item);
  }

  async updateComplianceItem(id: string, dto: Partial<{ code: string; name: string; category: string; stateCode: string; frequency: string; appliesTo: string; isActive: boolean }>) {
    const item = await this.complianceRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Compliance item not found');

    if (dto.code !== undefined) item.code = dto.code;
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.category !== undefined) item.category = dto.category as ComplianceCategory;
    if (dto.stateCode !== undefined) item.stateCode = dto.stateCode;
    if (dto.frequency !== undefined) item.frequency = dto.frequency as ComplianceFrequency;
    if (dto.appliesTo !== undefined) item.appliesTo = dto.appliesTo as AppliesTo;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    return this.complianceRepo.save(item);
  }

  async deleteComplianceItem(id: string) {
    const item = await this.complianceRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Compliance item not found');
    item.isActive = false;
    await this.complianceRepo.save(item);
    return { message: 'Compliance item deactivated' };
  }

  async bulkCreateComplianceItems(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) throw new BadRequestException('Excel file has no worksheets');

    const VALID_CATEGORIES = new Set([
      'LABOUR_CODE',
      'STATE_RULE',
      'SAFETY',
      'SPECIAL_ACT',
      'LICENSE',
      'RETURN',
    ]);
    const VALID_FREQ = new Set([
      'MONTHLY',
      'QUARTERLY',
      'HALF_YEARLY',
      'ANNUAL',
      'EVENT_BASED',
      'ON_DEMAND',
    ]);
    const VALID_APPLIES = new Set(['BOTH', 'FACTORY', 'ESTABLISHMENT']);

    const results: {
      inserted: number;
      skipped: number;
      errors: { row: number; reason: string }[];
    } = {
      inserted: 0,
      skipped: 0,
      errors: [],
    };

    // Map header columns dynamically
    const headerRow = sheet.getRow(1);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const h = this.cellText(cell.value).toLowerCase();
      const map: Record<string, string> = {
        code: 'code',
        name: 'name',
        category: 'category',
        'state code': 'stateCode',
        statecode: 'stateCode',
        state_code: 'stateCode',
        frequency: 'frequency',
        'applies to': 'appliesTo',
        appliesto: 'appliesTo',
        applies_to: 'appliesTo',
      };
      if (map[h]) colMap[map[h]] = colNumber;
    });

    if (!colMap['code'] || !colMap['name']) {
      throw new BadRequestException(
        'Excel must have columns: "Code" and "Name"',
      );
    }

    // Load existing codes for duplicate detection
    const existing = await this.complianceRepo.find({ select: ['code'] });
    const existingSet = new Set(existing.map((e) => e.code.toUpperCase()));

    const toInsert: UnitComplianceMasterEntity[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const cellVal = (key: string) => {
        const col = colMap[key];
        if (!col) return null;
        const value = this.cellText(row.getCell(col).value);
        return value || null;
      };

      const code = cellVal('code');
      const name = cellVal('name');

      // Skip empty rows
      if (!code && !name) return;

      if (!code) {
        results.errors.push({ row: rowNumber, reason: 'Missing Code' });
        return;
      }
      if (!name) {
        results.errors.push({ row: rowNumber, reason: 'Missing Name' });
        return;
      }

      // Duplicate check
      if (existingSet.has(code.toUpperCase())) {
        results.skipped++;
        return;
      }
      existingSet.add(code.toUpperCase());

      // Normalize category
      const catRaw = (cellVal('category') || 'LABOUR_CODE')
        .toUpperCase()
        .replace(/[\s-]/g, '_');
      const category = VALID_CATEGORIES.has(catRaw) ? catRaw : 'LABOUR_CODE';

      // Normalize frequency
      const freqRaw = (cellVal('frequency') || 'MONTHLY')
        .toUpperCase()
        .replace(/[\s-]/g, '_');
      const frequency = VALID_FREQ.has(freqRaw) ? freqRaw : 'MONTHLY';

      // Normalize appliesTo
      const appliesRaw = (cellVal('appliesTo') || 'BOTH').toUpperCase();
      const appliesTo = VALID_APPLIES.has(appliesRaw) ? appliesRaw : 'BOTH';

      const entity = this.complianceRepo.create({
        code,
        name,
        category: category as ComplianceCategory,
        stateCode: cellVal('stateCode') || null,
        frequency: frequency as ComplianceFrequency,
        appliesTo: appliesTo as AppliesTo,
        isActive: true,
      });

      toInsert.push(entity);
    });

    if (toInsert.length > 0) {
      await this.complianceRepo.save(toInsert);
      results.inserted = toInsert.length;
    }

    return results;
  }

  // ============ Packages (compliance_package) ============

  async listPackages() {
    return this.packageRepo.find({ order: { code: 'ASC' } });
  }

  async createPackage(dto: {
    code: string;
    name: string;
    stateCode?: string;
    appliesTo?: string;
  }) {
    if (!dto.code || !dto.name)
      throw new BadRequestException('code and name are required');
    const existing = await this.packageRepo.findOne({
      where: { code: dto.code },
    });
    if (existing)
      throw new ConflictException('Package "' + dto.code + '" already exists');

    const pkg = this.packageRepo.create({
      code: dto.code,
      name: dto.name,
      stateCode: dto.stateCode || null,
      appliesTo: dto.appliesTo || null,
      isActive: true,
    });
    return this.packageRepo.save(pkg);
  }

  async updatePackage(id: string, dto: Partial<{ code: string; name: string; stateCode: string; appliesTo: string; isActive: boolean }>) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Package not found');

    if (dto.code !== undefined) pkg.code = dto.code;
    if (dto.name !== undefined) pkg.name = dto.name;
    if (dto.stateCode !== undefined) pkg.stateCode = dto.stateCode;
    if (dto.appliesTo !== undefined) pkg.appliesTo = dto.appliesTo;
    if (dto.isActive !== undefined) pkg.isActive = dto.isActive;

    return this.packageRepo.save(pkg);
  }

  async deletePackage(id: string) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Package not found');
    pkg.isActive = false;
    await this.packageRepo.save(pkg);
    return { message: 'Package deactivated' };
  }

  // ============ Package Compliance Items ============

  async listPackageItems(packageId: string) {
    return this.packageComplianceRepo.find({
      where: { packageId },
      relations: ['compliance'],
      order: { compliance: { code: 'ASC' } },
    });
  }

  async addPackageItem(
    packageId: string,
    dto: { complianceId: string; includedByDefault?: boolean },
  ) {
    if (!dto.complianceId)
      throw new BadRequestException('complianceId is required');

    const existing = await this.packageComplianceRepo.findOne({
      where: { packageId, complianceId: dto.complianceId },
    });
    if (existing)
      throw new ConflictException('This compliance is already in the package');

    const link = this.packageComplianceRepo.create({
      packageId,
      complianceId: dto.complianceId,
      includedByDefault: dto.includedByDefault !== false,
    });
    return this.packageComplianceRepo.save(link);
  }

  async removePackageItem(packageId: string, id: string) {
    const link = await this.packageComplianceRepo.findOne({
      where: { id, packageId },
    });
    if (!link) throw new NotFoundException('Package compliance link not found');
    await this.packageComplianceRepo.remove(link);
    return { message: 'Removed from package' };
  }

  async bulkAddPackageItems(packageId: string, complianceIds: string[]) {
    const existing = await this.packageComplianceRepo.find({
      where: { packageId },
    });
    const existingSet = new Set(existing.map((e) => e.complianceId));

    const toInsert = complianceIds
      .filter((id) => !existingSet.has(id))
      .map((complianceId) =>
        this.packageComplianceRepo.create({
          packageId,
          complianceId,
          includedByDefault: true,
        }),
      );

    if (toInsert.length > 0) {
      await this.packageComplianceRepo.save(toInsert);
    }
    return {
      added: toInsert.length,
      skipped: complianceIds.length - toInsert.length,
    };
  }

  // ============ Rules (applicability_rule) ============

  async listRules() {
    return this.ruleRepo.find({
      relations: ['targetCompliance'],
      order: { priority: 'ASC' },
    });
  }

  async createRule(dto: {
    name: string;
    stateCode?: string;
    priority: number;
    targetComplianceId: string;
    effect: string;
    conditionsJson: Record<string, unknown>;
  }) {
    if (
      !dto.name ||
      !dto.targetComplianceId ||
      !dto.effect ||
      !dto.conditionsJson
    ) {
      throw new BadRequestException(
        'name, targetComplianceId, effect, and conditionsJson are required',
      );
    }

    const rule = this.ruleRepo.create({
      name: dto.name,
      stateCode: dto.stateCode || null,
      priority: dto.priority || 100,
      targetComplianceId: dto.targetComplianceId,
      effect: dto.effect as RuleEffect,
      conditionsJson: dto.conditionsJson,
      isActive: true,
    });
    try {
      return await this.ruleRepo.save(rule);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23503') {
        throw new BadRequestException('Referenced compliance not found');
      }
      throw err;
    }
  }

  async updateRule(id: string, dto: Partial<{ name: string; stateCode: string; priority: number; targetComplianceId: string; effect: string; conditionsJson: Record<string, unknown>; isActive: boolean }>) {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.stateCode !== undefined) rule.stateCode = dto.stateCode;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.targetComplianceId !== undefined)
      rule.targetComplianceId = dto.targetComplianceId;
    if (dto.effect !== undefined) rule.effect = dto.effect as RuleEffect;
    if (dto.conditionsJson !== undefined)
      rule.conditionsJson = dto.conditionsJson;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    rule.updatedAt = new Date();

    return this.ruleRepo.save(rule);
  }

  async deleteRule(id: string) {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');
    rule.isActive = false;
    rule.updatedAt = new Date();
    await this.ruleRepo.save(rule);
    return { message: 'Rule deactivated' };
  }

  // ============ Package Rules ============

  async listPackageRules(packageId: string) {
    return this.packageRuleRepo.find({
      where: { packageId },
      relations: ['rule', 'rule.targetCompliance'],
    });
  }

  async addPackageRule(packageId: string, dto: { ruleId: string }) {
    if (!dto.ruleId) throw new BadRequestException('ruleId is required');

    const existing = await this.packageRuleRepo.findOne({
      where: { packageId, ruleId: dto.ruleId },
    });
    if (existing)
      throw new ConflictException('This rule is already in the package');

    const link = this.packageRuleRepo.create({ packageId, ruleId: dto.ruleId });
    return this.packageRuleRepo.save(link);
  }

  async removePackageRule(packageId: string, id: string) {
    const link = await this.packageRuleRepo.findOne({
      where: { id, packageId },
    });
    if (!link) throw new NotFoundException('Package rule link not found');
    await this.packageRuleRepo.remove(link);
    return { message: 'Removed from package' };
  }

  async bulkAddPackageRules(packageId: string, ruleIds: string[]) {
    const existing = await this.packageRuleRepo.find({ where: { packageId } });
    const existingSet = new Set(existing.map((e) => e.ruleId));

    const toInsert = ruleIds
      .filter((id) => !existingSet.has(id))
      .map((ruleId) => this.packageRuleRepo.create({ packageId, ruleId }));

    if (toInsert.length > 0) {
      await this.packageRuleRepo.save(toInsert);
    }
    return {
      added: toInsert.length,
      skipped: ruleIds.length - toInsert.length,
    };
  }
}
