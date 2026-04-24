import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { ClientStructuresService } from './client-structures.service';
import {
  ClientPayrollCalculationService,
  CalculatePayrollInput,
} from './client-payroll-calculation.service';
import {
  CalculatePayrollDto,
  CreateClientStructureDto,
  UpdateClientStructureDto,
} from './dto/client-structure.dto';

@Controller({ path: 'payroll/client-structures', version: '1' })
@Roles('PAYROLL', 'ADMIN')
export class ClientStructuresController {
  constructor(
    private readonly structures: ClientStructuresService,
    private readonly calculation: ClientPayrollCalculationService,
  ) {}

  /** Create a new client payroll structure with components + statutory config. */
  @Post()
  create(@Body() dto: CreateClientStructureDto) {
    return this.structures.create(dto);
  }

  /** List all active structures for a client. */
  @Get('client/:clientId')
  getByClient(@Param('clientId') clientId: string) {
    return this.structures.findActiveByClient(clientId);
  }

  /** List ALL structures (active + inactive) for configuration UI. */
  @Get('client/:clientId/all')
  getAllByClient(@Param('clientId') clientId: string) {
    return this.structures.findAllByClient(clientId);
  }

  /** Get a single structure by ID. */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.structures.findOne(id);
  }

  /** Update structure meta (name, dates, etc.). */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientStructureDto) {
    return this.structures.update(id, dto);
  }

  /** Clone structure into a new version (for April/October updates). */
  @Post(':id/next-version')
  createNextVersion(
    @Param('id') id: string,
    @Body() body: { effectiveFrom: string },
  ) {
    return this.structures.createNextVersion(id, body.effectiveFrom);
  }

  /** Preview payroll calculation for a given gross + LOP + state. */
  @Post(':id/calculate')
  async calculate(
    @Param('id') id: string,
    @Body() dto: CalculatePayrollDto,
  ) {
    const structure = await this.structures.findOne(id);
    if (!structure) {
      throw new NotFoundException('Payroll structure not found');
    }

    const input: CalculatePayrollInput = {
      gross: dto.gross,
      lopDays: dto.lopDays,
      stateCode: dto.stateCode,
      month: dto.month,
      year: dto.year,
    };

    return this.calculation.calculate(structure, input);
  }
}
