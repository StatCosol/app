import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  HelpdeskService,
  AssignTicketDto,
  CreateTicketDto,
  PostMessageDto,
  UpdateTicketStatusDto,
} from './helpdesk.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ADMIN controller: view all tickets
@ApiTags('Helpdesk')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/helpdesk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminHelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listTickets(req.user, q);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(req.user, ticketId);
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const MAX_MB = 10;

const storage = diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(process.cwd(), 'uploads', 'helpdesk');
    ensureDir(base);
    cb(null, base);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const uploadOptions = {
  storage,
  fileFilter: (req: any, file: any, cb: any) => {
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
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listTickets(req.user, q);
  }

  @ApiOperation({ summary: 'Create' })
  @Post('tickets')
  create(
    @Req() req: any,
    @Body() dto: import('./helpdesk.service').CreateTicketDto,
  ) {
    return this.svc.createTicket(req.user, dto);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(req.user, ticketId);
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
  list(@Req() req: any, @Query() q: any) {
    return this.svc.crmListTickets(req.user, q);
  }

  @ApiOperation({ summary: 'Get Ticket' })
  @Get('tickets/:ticketId')
  getTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.svc.getTicket(req.user, ticketId);
  }
}

// Messages controller: post messages, upload files
@Controller({ path: 'helpdesk/tickets/:ticketId', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'PF_TEAM', 'ADMIN', 'CRM')
export class HelpdeskMessagesController {
  constructor(private readonly svc: HelpdeskService) {}

  @ApiOperation({ summary: 'Post Message' })
  @Post('messages')
  postMessage(
    @Req() req: any,
    @Param('ticketId') ticketId: string,
    @Body() dto: import('./helpdesk.service').PostMessageDto,
  ) {
    return this.svc.postMessage(req.user, ticketId, dto);
  }

  @ApiOperation({ summary: 'Upload File' })
  @Post('files')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadFile(
    @Req() req: any,
    @Param('ticketId') ticketId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadFile(req.user, ticketId, file);
  }

  @ApiOperation({ summary: 'List Messages' })
  @Get('messages')
  listMessages(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.svc.getMessages(req.user, ticketId);
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
  listCompat(@Req() req: any, @Query() q: any) {
    return this.svc.crmListTickets(req.user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tickets')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.crmListTickets(req.user, q);
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
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: import('./helpdesk.service').UpdateTicketStatusDto,
  ) {
    return this.svc.updateTicketStatusScoped(req.user, id, dto);
  }
}
