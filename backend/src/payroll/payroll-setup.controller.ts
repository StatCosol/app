import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollSetupService } from './payroll-setup.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ── Client Payroll Setup Controller ─────────────────────────
@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/setup', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollSetupController {
  constructor(private readonly svc: PayrollSetupService) {}

  // ── Client Setup ────────────────────────────────────────
  @ApiOperation({ summary: 'Get Setup' })
  @Get(':clientId')
  getSetup(@Param('clientId') clientId: string) {
    return this.svc.getSetup(clientId);
  }

  @ApiOperation({ summary: 'Upsert Setup' })
  @Post(':clientId')
  upsertSetup(@Param('clientId') clientId: string, @Body() body: any) {
    return this.svc.upsertSetup(clientId, body);
  }

  // ── Components ──────────────────────────────────────────
  @ApiOperation({ summary: 'List Components' })
  @Get(':clientId/components')
  listComponents(
    @Param('clientId') clientId: string,
    @Query('type') type?: string,
  ) {
    return this.svc.listComponents(clientId, type);
  }

  @ApiOperation({ summary: 'Create Component' })
  @Post(':clientId/components')
  createComponent(@Param('clientId') clientId: string, @Body() body: any) {
    return this.svc.createComponent(clientId, body);
  }

  @ApiOperation({ summary: 'Update Component' })
  @Put(':clientId/components/:componentId')
  updateComponent(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
    @Body() body: any,
  ) {
    return this.svc.updateComponent(clientId, componentId, body);
  }

  @ApiOperation({ summary: 'Delete Component' })
  @Delete(':clientId/components/:componentId')
  deleteComponent(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.deleteComponent(clientId, componentId);
  }

  // ── Component Rules ─────────────────────────────────────
  @ApiOperation({ summary: 'List Rules' })
  @Get(':clientId/components/:componentId/rules')
  listRules(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.listRules(componentId);
  }

  @ApiOperation({ summary: 'Create Rule' })
  @Post(':clientId/components/:componentId/rules')
  createRule(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
    @Body() body: any,
  ) {
    return this.svc.createRule(componentId, body);
  }

  @ApiOperation({ summary: 'Update Rule' })
  @Put(':clientId/components/:componentId/rules/:ruleId')
  updateRule(@Param('ruleId') ruleId: string, @Body() body: any) {
    return this.svc.updateRule(ruleId, body);
  }

  @ApiOperation({ summary: 'Delete Rule' })
  @Delete(':clientId/components/:componentId/rules/:ruleId')
  deleteRule(@Param('ruleId') ruleId: string) {
    return this.svc.deleteRule(ruleId);
  }

  // ── Component Slabs ─────────────────────────────────────
  @ApiOperation({ summary: 'List Slabs' })
  @Get(':clientId/components/:componentId/rules/:ruleId/slabs')
  listSlabs(@Param('ruleId') ruleId: string) {
    return this.svc.listSlabs(ruleId);
  }

  @ApiOperation({ summary: 'Save Slabs' })
  @Post(':clientId/components/:componentId/rules/:ruleId/slabs')
  saveSlabs(@Param('ruleId') ruleId: string, @Body() body: any) {
    return this.svc.saveSlabs(ruleId, body);
  }
}

// ── Client-facing Payroll Setup (read-only + limited write) ─
@Controller({ path: 'client/payroll/setup', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientPayrollSetupController {
  constructor(private readonly svc: PayrollSetupService) {}

  @ApiOperation({ summary: 'Get Setup' })
  @Get()
  getSetup(@Req() req: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.getSetup(clientId);
  }

  @ApiOperation({ summary: 'List Components' })
  @Get('components')
  listComponents(@Req() req: any, @Query('type') type?: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.listComponents(clientId, type);
  }
}
