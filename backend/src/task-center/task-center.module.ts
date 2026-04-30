import { Module } from '@nestjs/common';
import { TaskCenterController } from './task-center.controller';
import { TaskCenterService } from './task-center.service';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [AccessModule],
  controllers: [TaskCenterController],
  providers: [TaskCenterService],
  exports: [TaskCenterService],
})
export class TaskCenterModule {}
