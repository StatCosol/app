import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { AccessModule } from '../access/access.module';
import { CompliancesModule } from '../compliances/compliances.module';

@Module({
  imports: [AccessModule, CompliancesModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
