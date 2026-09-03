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
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import {
  makeSafeUploadOptions,
  assertSafeFile,
} from '../../../common/safe-upload';

const returnsProofOptions = makeSafeUploadOptions({
  folder: 'returns-proofs',
  maxMb: 15,
  allowedMimes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
});

@ApiTags('Returns Upload')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'ADMIN')
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
  @UseInterceptors(FileInterceptor('file', returnsProofOptions))
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    assertSafeFile(file);

    return {
      fileName: file.filename,
      originalName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }
}
