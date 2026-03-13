import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { GradeEntity } from './entities/grade.entity';
import { DesignationEntity } from './entities/designation.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/master-data', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'ADMIN', 'CRM')
export class MasterDataController {
  constructor(private readonly ds: DataSource) {}

  // ── Departments ──────────────────────────────────────────
  @ApiOperation({ summary: 'List Departments' })
  @Get('departments')
  async listDepartments(@Req() req: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.ds
      .getRepository(DepartmentEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Department' })
  @Post('departments')
  async createDepartment(@Req() req: any, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.code || !body.name)
      throw new BadRequestException('code and name required');
    const repo = this.ds.getRepository(DepartmentEntity);
    return repo.save(
      repo.create({ clientId, code: body.code, name: body.name }),
    );
  }

  @ApiOperation({ summary: 'Update Department' })
  @Put('departments/:id')
  async updateDepartment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
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
  async listGrades(@Req() req: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.ds
      .getRepository(GradeEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Grade' })
  @Post('grades')
  async createGrade(@Req() req: any, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.code || !body.name)
      throw new BadRequestException('code and name required');
    const repo = this.ds.getRepository(GradeEntity);
    return repo.save(
      repo.create({ clientId, code: body.code, name: body.name }),
    );
  }

  @ApiOperation({ summary: 'Update Grade' })
  @Put('grades/:id')
  async updateGrade(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
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
  async listDesignations(@Req() req: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.ds
      .getRepository(DesignationEntity)
      .find({ where: { clientId }, order: { name: 'ASC' } });
  }

  @ApiOperation({ summary: 'Create Designation' })
  @Post('designations')
  async createDesignation(@Req() req: any, @Body() body: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.code || !body.name)
      throw new BadRequestException('code and name required');
    const repo = this.ds.getRepository(DesignationEntity);
    return repo.save(
      repo.create({ clientId, code: body.code, name: body.name }),
    );
  }

  @ApiOperation({ summary: 'Update Designation' })
  @Put('designations/:id')
  async updateDesignation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const repo = this.ds.getRepository(DesignationEntity);
    const row = await repo.findOneBy({ id, clientId });
    if (!row) throw new BadRequestException('Designation not found');
    if (body.name) row.name = body.name;
    if (body.code) row.code = body.code;
    if (body.isActive !== undefined) row.isActive = body.isActive;
    return repo.save(row);
  }
}
