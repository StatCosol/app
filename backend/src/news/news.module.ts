import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsItemEntity } from './entities/news-item.entity';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [TypeOrmModule.forFeature([NewsItemEntity])],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
