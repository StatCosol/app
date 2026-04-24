import { Module } from '@nestjs/common';
import { TaskCenterController } from './task-center.controller';
import { TaskCenterService } from './task-center.service';

@Module({
  controllers: [TaskCenterController],
  providers: [TaskCenterService],
  exports: [TaskCenterService],
})
export class TaskCenterModule {}
