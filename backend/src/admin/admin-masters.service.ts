import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { AuditObservationCategoryEntity } from '../audits/entities/audit-observation-category.entity';
import { Frequency } from '../common/enums';
import * as ExcelJS from 'exceljs';

@Injectable()
export class AdminMastersService {
  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(AuditObservationCategoryEntity)
    private readonly auditCategoryRepo: Repository<AuditObservationCategoryEntity>,
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

  private normalizeComplianceCode(value: unknown): string {
    const raw =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    return raw
      .trim()
      .toUpperCase()
      .replace(/&/g, 'AND')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private deriveComplianceCode(...values: unknown[]): string {
    const combined = values
      .map((value) => {
        const str =
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : '';
        return str.trim().toUpperCase();
      })
      .filter(Boolean)
      .join(' ');
    if (!combined) return 'COMPLIANCE_ITEM';

    if (
      combined.includes('MONTHLY COMPLIANCE DOCUMENT') ||
      combined.includes('MONTHLY COMPLIANCE DOCKET') ||
      combined.includes(' MCD ') ||
      combined.startsWith('MCD ')
    ) {
      return 'MCD_UPLOAD';
    }
    if (combined.includes('PROVIDENT FUND') || /\bPF\b/.test(combined)) {
      return 'PF_PAYMENT';
    }
    if (
      combined.includes('EMPLOYEES STATE INSURANCE') ||
      /\bESI\b/.test(combined)
    ) {
      return 'ESI_PAYMENT';
    }
    if (combined.includes('PROFESSIONAL TAX') || /\bPT\b/.test(combined)) {
      return 'PT_PAYMENT';
    }
    if (combined.includes('LABOUR WELFARE FUND') || /\bLWF\b/.test(combined)) {
      return 'LWF_PAYMENT';
    }
    if (/\bGST\b/.test(combined)) {
      return 'GST_RETURN';
    }
    if (/\bTDS\b/.test(combined)) {
      return 'TDS_RETURN';
    }
    if (/\bROC\b/.test(combined)) {
      return 'ROC_FILINGS';
    }

    return (
      this.normalizeComplianceCode(values[0] || combined) || 'COMPLIANCE_ITEM'
    );
  }

  private resolveComplianceCode(
    code: unknown,
    fallback: {
      complianceName?: string | null;
      lawName?: string | null;
      description?: string | null;
    },
  ): string {
    const normalized = this.normalizeComplianceCode(code);
    if (normalized) return normalized;
    return this.deriveComplianceCode(
      fallback.complianceName,
      fallback.lawName,
      fallback.description,
    );
  }

  // ============ Compliance Masters ============
  async listComplianceMasters() {
    return this.complianceRepo.find({ order: { complianceName: 'ASC' } });
  }

  async getComplianceMaster(id: string) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');
    return master;
  }

  async createComplianceMaster(dto: {
    code?: string;
    complianceName: string;
    lawName: string;
    lawFamily?: string;
    stateScope?: string;
    minHeadcount?: number;
    maxHeadcount?: number;
    frequency: Frequency;
    description?: string;
    isActive?: boolean;
  }) {
    if (!dto.complianceName || !dto.lawName || !dto.frequency) {
      throw new BadRequestException(
        'complianceName, lawName, and frequency are required',
      );
    }

    const master = this.complianceRepo.create({
      code: this.resolveComplianceCode(dto.code, dto),
      complianceName: dto.complianceName,
      lawName: dto.lawName,
      lawFamily: dto.lawFamily || null,
      stateScope: dto.stateScope || null,
      minHeadcount: dto.minHeadcount || null,
      maxHeadcount: dto.maxHeadcount || null,
      frequency: dto.frequency,
      description: dto.description || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return this.complianceRepo.save(master);
  }

  async updateComplianceMaster(
    id: string,
    dto: Partial<ComplianceMasterEntity>,
  ) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');

    if (dto.code !== undefined) {
      master.code = this.resolveComplianceCode(dto.code, {
        complianceName: dto.complianceName ?? master.complianceName,
        lawName: dto.lawName ?? master.lawName,
        description: dto.description ?? master.description,
      });
    } else if (!master.code) {
      master.code = this.resolveComplianceCode(null, master);
    }
    if (dto.complianceName !== undefined)
      master.complianceName = dto.complianceName;
    if (dto.lawName !== undefined) master.lawName = dto.lawName;
    if (dto.lawFamily !== undefined) master.lawFamily = dto.lawFamily;
    if (dto.stateScope !== undefined) master.stateScope = dto.stateScope;
    if (dto.minHeadcount !== undefined) master.minHeadcount = dto.minHeadcount;
    if (dto.maxHeadcount !== undefined) master.maxHeadcount = dto.maxHeadcount;
    if (dto.frequency !== undefined) master.frequency = dto.frequency;
    if (dto.description !== undefined) master.description = dto.description;
    if (dto.isActive !== undefined) master.isActive = dto.isActive;

    return this.complianceRepo.save(master);
  }

  async deleteComplianceMaster(id: string) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');

    // Soft delete by setting isActive = false
    master.isActive = false;
    await this.complianceRepo.save(master);

    return { message: 'Compliance master deleted successfully' };
  }

  async bulkCreateComplianceMasters(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) throw new BadRequestException('Excel file has no worksheets');

    const FREQ_MAP: Record<string, Frequency> = {
      MONTHLY: Frequency.MONTHLY,
      QUARTERLY: Frequency.QUARTERLY,
      HALF_YEARLY: Frequency.HALF_YEARLY,
      YEARLY: Frequency.YEARLY,
      EVENT: Frequency.EVENT,
      EVENT_BASED: Frequency.EVENT,
    };

    const results: {
      inserted: number;
      skipped: number;
      errors: { row: number; reason: string }[];
    } = {
      inserted: 0,
      skipped: 0,
      errors: [],
    };

    // Find header row → map column indices
    const headerRow = sheet.getRow(1);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const header = this.cellText(cell.value).toLowerCase();
      const map: Record<string, string> = {
        code: 'code',
        'compliance name': 'complianceName',
        'law name': 'lawName',
        'law family': 'lawFamily',
        'state scope': 'stateScope',
        'min headcount': 'minHeadcount',
        'max headcount': 'maxHeadcount',
        frequency: 'frequency',
        status: 'status',
        description: 'description',
      };
      if (map[header]) colMap[map[header]] = colNumber;
    });

    if (
      !colMap['complianceName'] ||
      !colMap['lawName'] ||
      !colMap['frequency']
    ) {
      throw new BadRequestException(
        'Excel must have columns: "Compliance Name", "Law Name", and "Frequency"',
      );
    }

    // Load existing names for duplicate detection
    const existing = await this.complianceRepo.find({
      select: ['complianceName', 'lawName'],
    });
    const existingSet = new Set(
      existing.map(
        (e) => `${e.complianceName.toLowerCase()}||${e.lawName.toLowerCase()}`,
      ),
    );

    const toInsert: ComplianceMasterEntity[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const cellVal = (key: string) => {
        const col = colMap[key];
        if (!col) return null;
        const value = this.cellText(row.getCell(col).value);
        return value || null;
      };

      const complianceName = cellVal('complianceName');
      const lawName = cellVal('lawName');
      const frequencyRaw = cellVal('frequency');

      // Skip completely empty rows
      if (!complianceName && !lawName && !frequencyRaw) return;

      // Validate required fields
      if (!complianceName) {
        results.errors.push({
          row: rowNumber,
          reason: 'Missing Compliance Name',
        });
        return;
      }
      if (!lawName) {
        results.errors.push({ row: rowNumber, reason: 'Missing Law Name' });
        return;
      }
      if (!frequencyRaw) {
        results.errors.push({ row: rowNumber, reason: 'Missing Frequency' });
        return;
      }

      // Normalize and validate frequency
      const freqKey = frequencyRaw.toUpperCase().replace(/[\s-]/g, '_');
      const frequency = FREQ_MAP[freqKey];
      if (!frequency) {
        results.errors.push({
          row: rowNumber,
          reason: `Invalid Frequency "${frequencyRaw}". Must be one of: MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY, EVENT`,
        });
        return;
      }

      // Duplicate check
      const key = `${complianceName.toLowerCase()}||${lawName.toLowerCase()}`;
      if (existingSet.has(key)) {
        results.skipped++;
        return;
      }
      existingSet.add(key);

      // Parse optional fields
      const statusRaw = (cellVal('status') || 'active').toLowerCase();
      const isActive = !['inactive', 'no', 'false', '0'].includes(statusRaw);

      const minRaw = cellVal('minHeadcount');
      const maxRaw = cellVal('maxHeadcount');
      const minHeadcount = minRaw ? parseInt(minRaw, 10) : null;
      const maxHeadcount = maxRaw ? parseInt(maxRaw, 10) : null;

      const entity = this.complianceRepo.create({
        code: this.resolveComplianceCode(cellVal('code'), {
          complianceName,
          lawName,
          description: cellVal('description') || null,
        }),
        complianceName,
        lawName,
        lawFamily: cellVal('lawFamily') || null,
        stateScope: cellVal('stateScope') || null,
        minHeadcount: !isNaN(minHeadcount as number) ? minHeadcount : null,
        maxHeadcount: !isNaN(maxHeadcount as number) ? maxHeadcount : null,
        frequency,
        description: cellVal('description') || null,
        isActive,
      });

      toInsert.push(entity);
    });

    if (toInsert.length > 0) {
      await this.complianceRepo.save(toInsert);
      results.inserted = toInsert.length;
    }

    return results;
  }

  // ============ Audit Observation Categories ============
  async listAuditCategories() {
    return this.auditCategoryRepo.find({ order: { name: 'ASC' } });
  }

  async createAuditCategory(dto: { name: string; description?: string }) {
    if (!dto.name) throw new BadRequestException('Category name is required');

    const category = this.auditCategoryRepo.create({
      name: dto.name,
      description: dto.description || null,
    });

    return this.auditCategoryRepo.save(category);
  }

  async updateAuditCategory(
    id: string,
    dto: Partial<{ name: string; description: string | null }>,
  ) {
    const category = await this.auditCategoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Audit category not found');

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.description !== undefined) category.description = dto.description;

    return this.auditCategoryRepo.save(category);
  }

  async deleteAuditCategory(id: string) {
    const category = await this.auditCategoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Audit category not found');

    await this.auditCategoryRepo.delete(id);
    return { message: 'Audit category deleted successfully' };
  }
}
