import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PayrollTemplate } from '../payroll/entities/payroll-template.entity';
import { PayrollTemplateComponent } from '../payroll/entities/payroll-template-component.entity';
import { PayrollClientTemplate } from '../payroll/entities/payroll-client-template.entity';
import { CreatePayrollTemplateDto, UpdatePayrollTemplateDto } from './dto/payroll-template.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller({ path: 'admin/payroll', version: '1' })
export class AdminPayrollTemplatesController {
  constructor(
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollTemplateComponent)
    private readonly componentRepo: Repository<PayrollTemplateComponent>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
  ) {}

  @Get(['templates', 'payroll-templates'])
  async listTemplates() {
    const items = await this.templateRepo.find({
      order: { name: 'ASC' },
      relations: ['components'],
    });
    return { items, total: items.length };
  }

  @Get(['templates/:id', 'payroll-templates/:id'])
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templateRepo.findOne({
      where: { id },
      relations: ['components'],
    });
  }

  @Post(['templates', 'payroll-templates'])
  async createTemplate(@Body() dto: CreatePayrollTemplateDto) {
    const template = this.templateRepo.create({
      name: dto.name,
      fileName: dto.fileName,
      filePath: dto.filePath,
      fileType: dto.fileType ?? null,
      version: dto.version,
      is_active: dto.is_active ?? true,
    });
    return this.templateRepo.save(template);
  }

  @Patch(['templates/:id', 'payroll-templates/:id'])
  async updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollTemplateDto) {
    const updateData: Partial<PayrollTemplate> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.fileName !== undefined) updateData.fileName = dto.fileName;
    if (dto.filePath !== undefined) updateData.filePath = dto.filePath;
    if (dto.fileType !== undefined) updateData.fileType = dto.fileType;
    if (dto.version !== undefined) updateData.version = dto.version;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    await this.templateRepo.update(id, updateData);
    return this.getTemplate(id);
  }

  @Post(['templates/assign', 'payroll-templates/assign'])
  async assignTemplateToClient(
    @Body()
    dto: {
      client_id: string;
      template_id: string;
      effective_from: string;
      effective_to?: string;
    },
  ) {
    const assignment = this.clientTemplateRepo.create(dto);
    return this.clientTemplateRepo.save(assignment);
  }

  @Get(['templates/client/:clientId', 'payroll-templates/client/:clientId'])
  async getClientTemplate(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.clientTemplateRepo.find({
      where: { client_id: clientId },
      relations: ['template'],
    });
  }

  // GET /api/admin/payroll/runs — real DB query
  @Get('runs')
  async listRuns() {
    try {
      const items = await this.templateRepo.manager.query(
        `SELECT id, client_id AS "clientId", status, period_month AS "periodMonth",
                period_year AS "periodYear", run_date AS "runDate", created_at AS "createdAt"
         FROM payroll_runs
         ORDER BY created_at DESC
         LIMIT 200`,
      );
      return { items, total: items.length };
    } catch {
      return { items: [], total: 0 };
    }
  }
}
