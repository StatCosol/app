import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NoticesService, ReqUser } from './notices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ─── CRM / Admin Notice Controller ──────────────
@ApiTags('Notices')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/notices', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class CrmNoticesController {
  constructor(private readonly svc: NoticesService) {}

  @ApiOperation({ summary: 'Create a notice' })
  @Post()
  create(@CurrentUser() user: ReqUser, @Body() dto: CreateNoticeDto) {
    return this.svc.create(user, dto);
  }

  @ApiOperation({ summary: 'List notices' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: NoticeQueryDto) {
    return this.svc.list(user, q);
  }

  @ApiOperation({ summary: 'Get notice KPIs' })
  @Get('kpis')
  kpis(@CurrentUser() user: ReqUser, @Query('clientId') clientId?: string) {
    return this.svc.getKpis(user, clientId);
  }

  @ApiOperation({ summary: 'Get notice detail' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getOne(user, id);
  }

  @ApiOperation({ summary: 'Update notice' })
  @Patch(':id')
  update(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Upload document to notice' })
  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDoc(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
    @Body('remarks') remarks?: string,
  ) {
    const fileUrl = `/uploads/notices/${file.filename}`;
    return this.svc.uploadDocument(
      user,
      id,
      documentType || 'SUPPORTING',
      file.originalname,
      fileUrl,
      remarks,
    );
  }
}

// ─── Client Notice Controller ──────────────────
@ApiTags('Notices')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/notices', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientNoticesController {
  constructor(private readonly svc: NoticesService) {}

  @ApiOperation({ summary: 'List notices for my client' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: NoticeQueryDto) {
    return this.svc.list(user, q);
  }

  @ApiOperation({ summary: 'Get notice KPIs' })
  @Get('kpis')
  kpis(@CurrentUser() user: ReqUser) {
    return this.svc.getKpis(user);
  }

  @ApiOperation({ summary: 'Get notice detail' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getOne(user, id);
  }
}

// ─── Branch Notice Controller ──────────────────
@ApiTags('Notices')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/notices', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class BranchNoticesController {
  constructor(private readonly svc: NoticesService) {}

  @ApiOperation({ summary: 'List notices for my branch' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: NoticeQueryDto) {
    return this.svc.list(user, q);
  }

  @ApiOperation({ summary: 'Get notice KPIs' })
  @Get('kpis')
  kpis(@CurrentUser() user: ReqUser) {
    return this.svc.getKpis(user);
  }

  @ApiOperation({ summary: 'Get notice detail' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getOne(user, id);
  }
}
