import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateClientDto } from './dto/create-client.dto';

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('clients')
  list(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @Get('clients/with-aggregates')
  listWithAggregates(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @Get('clients/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const include = includeDeleted === 'true';
    return this.clientsService.findById(id, include);
  }

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

  @Delete('clients/:id')
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    return this.clientsService.softDelete(
      id,
      req.user?.userId,
      req.user?.roleCode,
      reason ?? null,
    );
  }

  @Post('clients/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.clientsService.restore(
      id,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @Get('client-users-with-client')
  listClientUsersWithClient() {
    return this.clientsService.listClientUsersWithClient();
  }

  @Get('clients/:id/users')
  listClientUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.listClientUsers(id);
  }

  @Post('clients/:id/users')
  addClientUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.addClientUser(id, userId);
  }

  @Delete('clients/:clientId/users/:userId')
  removeClientUser(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.removeClientUser(clientId, userId);
  }

  // ── Client Logo Upload ──────────────────────────────────
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
        const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Only PNG, JPG, SVG, or WebP images are allowed'), false);
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
}
