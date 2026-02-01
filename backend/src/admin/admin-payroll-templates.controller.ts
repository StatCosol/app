import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { PayrollTemplate } from '../payroll/entities/payroll-template.entity';
import { PayrollTemplateComponent } from '../payroll/entities/payroll-template-component.entity';
import { PayrollClientTemplate } from '../payroll/entities/payroll-client-template.entity';

@Roles('ADMIN')
@Controller('api/admin/payroll-templates')
export class AdminPayrollTemplatesController {
  constructor(
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollTemplateComponent)
    private readonly componentRepo: Repository<PayrollTemplateComponent>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
  ) {}

  @Get()
  async listTemplates() {
    return this.templateRepo.find({ relations: ['components'] });
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string) {
    return this.templateRepo.findOne({ where: { id }, relations: ['components'] });
  }

  @Post()
  async createTemplate(@Body() dto: any) {
    const template = this.templateRepo.create({
      name: dto.name,
      version: dto.version,
      is_active: dto.is_active ?? true,
      components: dto.components,
    });
    return this.templateRepo.save(template);
  }

  @Patch(':id')
  async updateTemplate(@Param('id') id: string, @Body() dto: any) {
    await this.templateRepo.update(id, dto);
    return this.getTemplate(id);
  }

  @Post('assign')
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

  @Get('client/:clientId')
  async getClientTemplate(@Param('clientId') clientId: string) {
    return this.clientTemplateRepo.find({
      where: { client_id: clientId },
      relations: ['template'],
    });
  }
}
