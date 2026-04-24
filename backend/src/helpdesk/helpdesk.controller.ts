import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  HelpdeskService,
} from './helpdesk.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

// ADMIN controller: view all tickets
@ApiTags('Helpdesk')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'Dashboard stats' })
  @Get('stats')
  stats() {
    return this.svc.adminStats();
  }

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@CurrentUser() _user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.adminListTickets(q);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@CurrentUser() user: ReqUser, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(user, ticketId);
  }

  @ApiOperation({ summary: 'Assign Ticket' })
  @Patch('tickets/:ticketId/assign')
  assign(
    @Param('ticketId') ticketId: string,
    @Body() dto: import('./helpdesk.service').AssignTicketDto,
  ) {
    return this.svc.assignTicket(ticketId, dto);
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const MAX_MB = 10;

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'helpdesk');
    ensureDir(base);
    cb(null, base);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const uploadOptions = {
  storage,
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (err: Error | null, accept: boolean) => void) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new BadRequestException('File type not allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_MB * 1024 * 1024 },
};

// CLIENT controller: create and list own tickets
@Controller({ path: 'client/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.listTickets(user, q);
  }

  @ApiOperation({ summary: 'Create' })
  @Post('tickets')
  create(
    @CurrentUser() user: ReqUser,
    @Body() dto: import('./helpdesk.service').CreateTicketDto,
  ) {
    return this.svc.createTicket(user, dto);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@CurrentUser() user: ReqUser, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(user, ticketId);
  }
}

// PF_TEAM controller: view and manage assigned tickets
@Controller({ path: 'pf-team/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PF_TEAM')
export class PfTeamHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.listTickets(user, q);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@CurrentUser() user: ReqUser, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(user, ticketId);
  }
}

// ESS (Employee) controller: create and view own helpdesk tickets
@ApiTags('ESS Helpdesk')
@ApiBearerAuth('JWT')
@Controller({ path: 'ess/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EMPLOYEE')
export class EssHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'List my tickets' })
  @Get('tickets')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.essListTickets(user, q);
  }

  @ApiOperation({ summary: 'Create ticket (PF/ESI/PAYSLIP)' })
  @Post('tickets')
  create(
    @CurrentUser() user: ReqUser,
    @Body() dto: import('./helpdesk.service').CreateTicketDto,
  ) {
    return this.svc.essCreateTicket(user, dto);
  }

  @ApiOperation({ summary: 'Get my ticket' })
  @Get('tickets/:ticketId')
  getTicket(@CurrentUser() user: ReqUser, @Param('ticketId') ticketId: string) {
    return this.svc.essGetTicket(user, ticketId);
  }
}

// Messages controller: post messages, upload files
@Controller({ path: 'helpdesk/tickets/:ticketId', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'EMPLOYEE', 'PF_TEAM', 'ADMIN', 'CRM')
export class HelpdeskMessagesController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'Post Message' })
  @Post('messages')
  postMessage(
    @CurrentUser() user: ReqUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: import('./helpdesk.service').PostMessageDto,
  ) {
    return this.svc.postMessage(user, ticketId, dto);
  }

  @ApiOperation({ summary: 'Upload File' })
  @Post('files')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadFile(
    @CurrentUser() user: ReqUser,
    @Param('ticketId') ticketId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadFile(user, ticketId, file);
  }

  @ApiOperation({ summary: 'List Messages' })
  @Get('messages')
  listMessages(
    @CurrentUser() user: ReqUser,
    @Param('ticketId') ticketId: string,
  ) {
    return this.svc.getMessages(user, ticketId);
  }
}

// CRM controller: view all tickets
@Controller({ path: 'crm/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  /**
   * Compatibility alias for older clients expecting:
   * GET /api/v1/crm/helpdesk
   */
  @ApiOperation({ summary: 'List (Compatibility)' })
  @Get()
  listCompat(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.crmListTickets(user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.crmListTickets(user, q);
  }
}

// Update shared controller @Roles to include CRM
@Roles('CLIENT', 'PF_TEAM', 'ADMIN', 'CRM')
@Controller({ path: 'helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PF_TEAM', 'ADMIN', 'CRM')
export class HelpdeskManagementController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'Update Status' })
  @Patch('tickets/:id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: import('./helpdesk.service').UpdateTicketStatusDto,
  ) {
    return this.svc.updateTicketStatusScoped(user, id, dto);
  }
}
