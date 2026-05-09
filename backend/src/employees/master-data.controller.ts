import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { GradeEntity } from './entities/grade.entity';
import { DesignationEntity } from './entities/designation.entity';
import {
  CreateMasterDataItemDto,
  UpdateMasterDataItemDto,
} from './dto/employees.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/master-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'ADMIN', 'CRM', 'PAYROLL')
export class MasterDataController {
  constructor(private readonly ds: DataSource) {}

  /** Resolve clientId: use query param if provided, else fall back to JWT clientId */
  private resolveClientId(user: ReqUser, queryClientId?: string): string {
    const clientId = queryClientId || user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return clientId;
  }

  // ── Departments ──────────────────────────────────────────
  @ApiOperation({ summary: 'List Departments' })
  @Get('departments')
  async listDepartments(
    @CurrentUser() user: ReqUser,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    return this.ds
      .getRepository(DepartmentEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Department' })
  @Post('departments')
  async createDepartment(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(DepartmentEntity);
    try {
      return await repo.save(
        repo.create({ clientId, code: body.code, name: body.name }),
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException(
          'Department code already exists for this client',
        );
      throw e;
    }
  }

  @ApiOperation({ summary: 'Update Department' })
  @Put('departments/:id')
  async updateDepartment(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(DepartmentEntity);
    const row = await repo.findOneBy({ id, clientId });
    if (!row) throw new BadRequestException('Department not found');
    if (body.name) row.name = body.name;
    if (body.code) row.code = body.code;
    if (body.isActive !== undefined) row.isActive = body.isActive;
    return repo.save(row);
  }

  // ── Grades ────────────────────────────────────────────────
  @ApiOperation({ summary: 'List Grades' })
  @Get('grades')
  async listGrades(
    @CurrentUser() user: ReqUser,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    return this.ds
      .getRepository(GradeEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Grade' })
  @Post('grades')
  async createGrade(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(GradeEntity);
    try {
      return await repo.save(
        repo.create({ clientId, code: body.code, name: body.name }),
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException(
          'Grade code already exists for this client',
        );
      throw e;
    }
  }

  @ApiOperation({ summary: 'Update Grade' })
  @Put('grades/:id')
  async updateGrade(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(GradeEntity);
    const row = await repo.findOneBy({ id, clientId });
    if (!row) throw new BadRequestException('Grade not found');
    if (body.name) row.name = body.name;
    if (body.code) row.code = body.code;
    if (body.isActive !== undefined) row.isActive = body.isActive;
    return repo.save(row);
  }

  // ── Designations ──────────────────────────────────────────
  @ApiOperation({ summary: 'List Designations' })
  @Get('designations')
  async listDesignations(
    @CurrentUser() user: ReqUser,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    return this.ds
      .getRepository(DesignationEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Designation' })
  @Post('designations')
  async createDesignation(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(DesignationEntity);
    try {
      return await repo.save(
        repo.create({ clientId, code: body.code, name: body.name }),
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException(
          'Designation code already exists for this client',
        );
      throw e;
    }
  }

  @ApiOperation({ summary: 'Update Designation' })
  @Put('designations/:id')
  async updateDesignation(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateMasterDataItemDto,
    @Query('clientId') qClientId?: string,
  ) {
    const clientId = this.resolveClientId(user, qClientId);
    const repo = this.ds.getRepository(DesignationEntity);
    const row = await repo.findOneBy({ id, clientId });
    if (!row) throw new BadRequestException('Designation not found');
    if (body.name) row.name = body.name;
    if (body.code) row.code = body.code;
    if (body.isActive !== undefined) row.isActive = body.isActive;
    return repo.save(row);
  }
}
