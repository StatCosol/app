import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuid } from 'uuid';
import { extname, join } from 'path';
import { NoticeEntity } from './entities/notice.entity';
import { NoticeDocumentEntity } from './entities/notice-document.entity';
import { NoticeActivityLogEntity } from './entities/notice-activity-log.entity';
import { NoticesService } from './notices.service';
import {
  CrmNoticesController,
  ClientNoticesController,
  BranchNoticesController,
} from './notices.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NoticeEntity,
      NoticeDocumentEntity,
      NoticeActivityLogEntity,
    ]),
    MulterModule.register({
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'notices'),
        filename: (_req, file, cb) => {
          cb(null, `${uuid()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  ],
  controllers: [
    CrmNoticesController,
    ClientNoticesController,
    BranchNoticesController,
  ],
  providers: [NoticesService],
  exports: [TypeOrmModule, NoticesService],
})
export class NoticesModule {}
