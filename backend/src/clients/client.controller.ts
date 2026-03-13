import {
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'client', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientController {
  constructor(
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
  ) {}

  @ApiOperation({ summary: 'Get My Company' })
  @Get('me')
  async getMyCompany(@Request() req) {
    const userId = req.user.userId;
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.clientId) {
      throw new BadRequestException('User is not linked to any client company');
    }

    const client = await this.clientsService.findById(user.clientId);
    if (!client) {
      throw new NotFoundException('Client company not found');
    }

    return {
      clientId: client.id,
      clientName: client.clientName,
      logoUrl: client.logoUrl,
    };
  }

  @ApiOperation({ summary: 'File Interceptor' })
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'logos');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadLogo(@UploadedFile() file: any, @Request() req: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    const user = await this.usersService.findById(req.user.userId);
    if (!user?.clientId) throw new BadRequestException('No client linked');
    const logoUrl = `/uploads/logos/${file.filename}`;
    return this.clientsService.updateLogo(user.clientId, logoUrl);
  }
}
