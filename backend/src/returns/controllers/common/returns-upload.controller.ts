import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';

@ApiTags('Returns Upload')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'returns/upload', version: '1' })
export class ReturnsUploadController {
  @Post('proof')
  @ApiOperation({ summary: 'Upload proof file for returns/renewals' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = path.join(
            process.cwd(),
            'uploads',
            'returns-proofs',
          );
          fs.mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          const base = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9\-_]/g, '_');
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${base}-${unique}${ext}`);
        },
      }),
      limits: {
        fileSize: 15 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname) {
          return cb(new BadRequestException('Invalid file'), false);
        }
        const ALLOWED_MIME = new Set([
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ]);
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              'File type not allowed. Accepted: PDF, PNG, JPEG, Excel',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return {
      fileName: file.filename,
      originalName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }
}
