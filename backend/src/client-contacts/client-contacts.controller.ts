import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ReqUser } from '../access/access-scope.service';
import { ClientContactsService } from './client-contacts.service';
import { portalUrl } from '../common/utils/portal-url';
import {
  CreateClientContactDto,
  UpdateClientContactDto,
} from './client-contact.dto';
import { CLIENT_CONTACT_DEPARTMENTS } from './client-department-contact.entity';
import { ClientCommsCronService } from './client-comms-cron.service';
import {
  ClientCommTemplatesService,
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
} from './client-comm-templates.service';
import { sanitizeMailHtml } from '../common/html-sanitizer';
import {
  CLIENT_COMM_TYPES,
  ClientCommType,
} from './client-comm-template.entity';

@ApiTags('Admin Client Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO')
@Controller({ path: 'admin/client-contacts', version: '1' })
export class ClientContactsController {
  constructor(
    private readonly svc: ClientContactsService,
    private readonly cron: ClientCommsCronService,
    private readonly templates: ClientCommTemplatesService,
  ) {}

  @ApiOperation({ summary: 'List supported departments' })
  @Get('departments')
  departments() {
    return CLIENT_CONTACT_DEPARTMENTS;
  }

  @ApiOperation({ summary: 'List all contacts for a client' })
  @Get('client/:clientId')
  list(@Param('clientId', new ParseUUIDPipe()) clientId: string) {
    return this.svc.listForClient(clientId);
  }

  @ApiOperation({ summary: 'Create a contact' })
  @Post()
  create(@Body() dto: CreateClientContactDto, @CurrentUser() user: ReqUser) {
    return this.svc.create(dto, user?.userId);
  }

  @ApiOperation({ summary: 'Update a contact' })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClientContactDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.svc.update(id, dto, user?.userId);
  }

  @ApiOperation({ summary: 'Delete a contact' })
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }

  // --- Manual cron triggers (admin only) ----------------------------------

  @ApiOperation({ summary: 'Trigger payroll-input request emails now' })
  @Post('trigger/payroll-input')
  triggerPayroll(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
  ) {
    return this.cron.runPayrollInputRequest({
      triggeredBy: user?.userId || 'ADMIN_MANUAL',
      manual: true,
      onlyClientId: clientId,
    });
  }

  @ApiOperation({ summary: 'Trigger MCD-data request emails now' })
  @Post('trigger/mcd-request')
  triggerMcd(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
  ) {
    return this.cron.runMcdDataRequest({
      triggeredBy: user?.userId || 'ADMIN_MANUAL',
      manual: true,
      onlyClientId: clientId,
    });
  }

  // --- Email template editor (admin only) ---------------------------------

  @ApiOperation({ summary: 'List editable mail templates with defaults' })
  @Get('templates')
  listTemplates() {
    return this.templates.listAll();
  }

  @ApiOperation({ summary: 'Update a mail template (subject + HTML body)' })
  @Patch('templates/:commType')
  async updateTemplate(
    @Param('commType') commType: string,
    @Body()
    dto: { subjectTemplate?: string; bodyTemplate?: string },
    @CurrentUser() user: ReqUser,
  ) {
    const ct = commType as ClientCommType;
    if (!CLIENT_COMM_TYPES.includes(ct)) {
      return { ok: false, error: `Unknown comm_type: ${commType}` };
    }
    const subject = (dto.subjectTemplate || '').trim();
    const rawBody = (dto.bodyTemplate || '').trim();
    if (!subject || !rawBody) {
      return {
        ok: false,
        error: 'subjectTemplate and bodyTemplate are required',
      };
    }
    // HTML is rendered into both the outgoing email and the Angular admin
    // preview pane. Sanitize on the way in so a single bad save can't seed
    // stored-XSS for every other admin who later opens the editor.
    const body = sanitizeMailHtml(rawBody);
    if (!body) {
      return {
        ok: false,
        error: 'bodyTemplate contained no allowed HTML after sanitization',
      };
    }
    await this.templates.upsert(ct, subject, body, user?.userId);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Reset a mail template to its built-in default' })
  @Post('templates/:commType/reset')
  async resetTemplate(@Param('commType') commType: string) {
    const ct = commType as ClientCommType;
    if (!CLIENT_COMM_TYPES.includes(ct)) {
      return { ok: false, error: `Unknown comm_type: ${commType}` };
    }
    await this.templates.resetToDefault(ct);
    return { ok: true, defaults: DEFAULT_TEMPLATES[ct] };
  }

  @ApiOperation({
    summary: 'Render a sample preview using the current template',
  })
  @Post('templates/:commType/preview')
  async previewTemplate(
    @Param('commType') commType: string,
    @Body()
    dto?: {
      clientName?: string;
      monthLabel?: string;
      deadlineLabel?: string;
      portalUrl?: string;
      subjectTemplate?: string;
      bodyTemplate?: string;
    },
  ) {
    const ct = commType as ClientCommType;
    if (!CLIENT_COMM_TYPES.includes(ct)) {
      return { ok: false, error: `Unknown comm_type: ${commType}` };
    }
    const vars = {
      clientName: dto?.clientName || 'Acme Industries Pvt Ltd',
      monthLabel: dto?.monthLabel || 'April 2026',
      deadlineLabel: dto?.deadlineLabel || '07-May-2026',
      portalUrl:
        dto?.portalUrl ||
        (ct === 'PAYROLL_INPUT_REQUEST'
          ? portalUrl('/client/payroll/inputs')
          : portalUrl('/contractor/mcd/upload')),
    };
    // If caller passed un-saved drafts, render those; otherwise pull from DB/default.
    if (dto?.subjectTemplate || dto?.bodyTemplate) {
      const def = DEFAULT_TEMPLATES[ct];
      const subjTpl = dto.subjectTemplate || def.subject;
      const bodyTpl = sanitizeMailHtml(dto.bodyTemplate || def.body);
      // Use the public render path via a transient resolve helper
      const escape = (s: string) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const render = (tpl: string) =>
        tpl
          .replace(/\{\{\s*clientName\s*\}\}/g, escape(vars.clientName))
          .replace(/\{\{\s*monthLabel\s*\}\}/g, escape(vars.monthLabel))
          .replace(/\{\{\s*deadlineLabel\s*\}\}/g, escape(vars.deadlineLabel))
          .replace(/\{\{\s*portalUrl\s*\}\}/g, vars.portalUrl);
      return {
        ok: true,
        subject: render(subjTpl),
        body: render(bodyTpl),
        placeholders: TEMPLATE_PLACEHOLDERS,
      };
    }
    const tpl = await this.templates.resolve(ct, vars);
    return {
      ok: true,
      subject: tpl.subject,
      body: sanitizeMailHtml(tpl.body),
      source: tpl.source,
      placeholders: TEMPLATE_PLACEHOLDERS,
    };
  }
}
