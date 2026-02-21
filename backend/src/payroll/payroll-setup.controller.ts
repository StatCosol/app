import {
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

// ── Client Payroll Setup Controller ─────────────────────────
@Controller({ path: 'payroll/setup', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollSetupController {
  constructor(private readonly svc: PayrollSetupService) {}

  // ── Client Setup ────────────────────────────────────────
  @Get(':clientId')
  getSetup(@Param('clientId') clientId: string) {
    return this.svc.getSetup(clientId);
  }

  @Post(':clientId')
  upsertSetup(@Param('clientId') clientId: string, @Body() body: any) {
    return this.svc.upsertSetup(clientId, body);
  }

  // ── Components ──────────────────────────────────────────
  @Get(':clientId/components')
  listComponents(
    @Param('clientId') clientId: string,
    @Query('type') type?: string,
  ) {
    return this.svc.listComponents(clientId, type);
  }

  @Post(':clientId/components')
  createComponent(@Param('clientId') clientId: string, @Body() body: any) {
    return this.svc.createComponent(clientId, body);
  }

  @Put(':clientId/components/:componentId')
  updateComponent(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
    @Body() body: any,
  ) {
    return this.svc.updateComponent(clientId, componentId, body);
  }

  @Delete(':clientId/components/:componentId')
  deleteComponent(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.deleteComponent(clientId, componentId);
  }

  // ── Component Rules ─────────────────────────────────────
  @Get(':clientId/components/:componentId/rules')
  listRules(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.listRules(componentId);
  }

  @Post(':clientId/components/:componentId/rules')
  createRule(
    @Param('clientId') clientId: string,
    @Param('componentId') componentId: string,
    @Body() body: any,
  ) {
    return this.svc.createRule(componentId, body);
  }

  @Put(':clientId/components/:componentId/rules/:ruleId')
  updateRule(
    @Param('ruleId') ruleId: string,
    @Body() body: any,
  ) {
    return this.svc.updateRule(ruleId, body);
  }

  @Delete(':clientId/components/:componentId/rules/:ruleId')
  deleteRule(@Param('ruleId') ruleId: string) {
    return this.svc.deleteRule(ruleId);
  }

  // ── Component Slabs ─────────────────────────────────────
  @Get(':clientId/components/:componentId/rules/:ruleId/slabs')
  listSlabs(@Param('ruleId') ruleId: string) {
    return this.svc.listSlabs(ruleId);
  }

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

  @Get()
  getSetup(@Req() req: any) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.getSetup(clientId);
  }

  @Get('components')
  listComponents(@Req() req: any, @Query('type') type?: string) {
    const clientId = req.user.clientId;
    if (!clientId) throw new Error('Client context required');
    return this.svc.listComponents(clientId, type);
  }
}
