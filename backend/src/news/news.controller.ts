import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
  ParseUUIDPipe,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UseGuards } from '@nestjs/common';
import { CacheControl } from '../common/decorators/cache-control.decorator';
import { NewsService } from './news.service';
import { CreateNewsDto, UpdateNewsDto, NEWS_CATEGORIES } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'news', version: '1' })
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  /** Public-ish: all authenticated users can read active news */
  @ApiOperation({ summary: 'Get active news (pinned first, excludes expired)' })
  @Get()
  @CacheControl(60)
  async getActiveNews() {
    return this.newsService.findActive();
  }

  /** Admin: paginated list with search, category & status filters */
  @ApiOperation({ summary: 'Admin: paginated news list with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false, enum: NEWS_CATEGORIES })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'expired', 'all'],
  })
  @Roles('ADMIN')
  @Get('admin/all')
  async getAllNews(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.newsService.findAllAdmin({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search,
      category,
      status,
    });
  }

  /** Admin: upload a news image */
  @ApiOperation({ summary: 'Upload news image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Roles('ADMIN')
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'news');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const base = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9\-_]/g, '_');
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${base}-${unique}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ALLOWED = new Set([
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/gif',
          'image/webp',
          'application/pdf',
        ]);
        if (!ALLOWED.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only image or PDF files are allowed (PNG, JPEG, GIF, WEBP, PDF)',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { imageUrl: `/uploads/news/${file.filename}` };
  }

  /** Single news item (for detail page) */
  @ApiOperation({ summary: 'Get news item by id' })
  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.newsService.findOne(id);
    if (!item) throw new NotFoundException('News item not found');
    return item;
  }

  /** Admin: create a news item */
  @ApiOperation({ summary: 'Create news item' })
  @Roles('ADMIN')
  @Post()
  async create(@Body() dto: CreateNewsDto, @CurrentUser() user: ReqUser) {
    const userId = user?.userId ?? user?.id;
    return this.newsService.create(dto, userId);
  }

  /** Admin: update a news item */
  @ApiOperation({ summary: 'Update news item' })
  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentUser() user: ReqUser,
  ) {
    const userId = user?.userId ?? user?.id;
    const item = await this.newsService.update(id, dto, userId);
    if (!item) throw new NotFoundException('News item not found');
    return item;
  }

  /** Admin: soft-delete a news item */
  @ApiOperation({ summary: 'Soft-delete news item' })
  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.newsService.remove(id);
    return { deleted: true };
  }
}
