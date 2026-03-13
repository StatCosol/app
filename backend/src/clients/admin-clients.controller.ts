import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ClientsService } from './clients.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateClientDto } from './dto/create-client.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get('clients')
  list(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @ApiOperation({ summary: 'List With Aggregates' })
  @Get('clients/with-aggregates')
  listWithAggregates(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @ApiOperation({ summary: 'Find One' })
  @Get('clients/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const include = includeDeleted === 'true';
    return this.clientsService.findById(id, include);
  }

  @ApiOperation({ summary: 'Create' })
  @Post('clients')
  create(@Body() dto: CreateClientDto, @Req() req: any) {
    const fallbackCode =
      dto.clientName
        ?.split(' ')
        .filter((word) => word.trim().length > 0)
        .map((word) => word[0]?.toUpperCase())
        .join('') || 'CLI';

    const payload: CreateClientDto = {
      ...dto,
      clientCode: dto.clientCode?.trim() || fallbackCode,
    };

    return this.clientsService.create(
      payload,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @ApiOperation({ summary: 'Update' })
  @Put('clients/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientDto,
    @Req() req: any,
  ) {
    return this.clientsService.update(
      id,
      dto,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @ApiOperation({ summary: 'Readiness Check' })
  @Get('clients/:id/readiness')
  readinessCheck(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getReadinessCheck(id);
  }

  @ApiOperation({ summary: 'Soft Delete' })
  @Delete('clients/:id')
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    // Client deletion requires CEO approval
    return this.usersService.createDeletionRequest(
      'CLIENT',
      id,
      req.user?.userId,
      'CEO',
      null,
    );
  }

  @ApiOperation({ summary: 'Restore' })
  @Post('clients/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.clientsService.restore(
      id,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @ApiOperation({ summary: 'List Client Users With Client' })
  @Get('client-users-with-client')
  listClientUsersWithClient() {
    return this.clientsService.listClientUsersWithClient();
  }

  @ApiOperation({ summary: 'List Client Users' })
  @Get('clients/:id/users')
  listClientUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.listClientUsers(id);
  }

  @ApiOperation({ summary: 'Add Client User' })
  @Post('clients/:id/users')
  addClientUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.addClientUser(id, userId);
  }

  @ApiOperation({ summary: 'Remove Client User' })
  @Delete('clients/:clientId/users/:userId')
  removeClientUser(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.removeClientUser(clientId, userId);
  }

  // ── Client Logo Upload ──────────────────────────────────
  @ApiOperation({ summary: 'File Interceptor' })
  @Post('clients/:id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'logos');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${(req.params as any).id}${ext}`);
        },
      }),
      fileFilter: (req: any, file: any, cb: any) => {
        const allowed = [
          'image/png',
          'image/jpeg',
          'image/svg+xml',
          'image/webp',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only PNG, JPG, SVG, or WebP images are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    }),
  )
  async uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const logoUrl = `/uploads/logos/${file.filename}`;
    return this.clientsService.updateLogo(id, logoUrl);
  }

  // ── Client Logo SVG Code Upload ─────────────────────────
  @ApiOperation({ summary: 'Upload Svg Code' })
  @Post('clients/:id/logo-svg')
  async uploadSvgCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('svgCode') svgCode: string,
  ) {
    if (!svgCode || typeof svgCode !== 'string') {
      throw new BadRequestException('svgCode is required');
    }

    const trimmed = svgCode.trim();

    // Basic size limit (2 MB)
    if (Buffer.byteLength(trimmed, 'utf8') > 2 * 1024 * 1024) {
      throw new BadRequestException('SVG code must be under 2 MB');
    }

    // Must start with <svg
    if (!trimmed.toLowerCase().startsWith('<svg')) {
      throw new BadRequestException('SVG code must start with <svg');
    }

    // Security: reject scripts, event handlers, and javascript: URIs
    const dangerous =
      /<script/i.test(trimmed) ||
      /javascript\s*:/i.test(trimmed) ||
      /on[a-z]+\s*=/i.test(trimmed);
    if (dangerous) {
      throw new BadRequestException(
        'SVG contains disallowed content (scripts or event handlers)',
      );
    }

    // Write to disk
    const dir = path.join(process.cwd(), 'uploads', 'logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.svg`);
    fs.writeFileSync(filePath, trimmed, 'utf8');

    const logoUrl = `/uploads/logos/${id}.svg`;
    return this.clientsService.updateLogo(id, logoUrl);
  }
}
