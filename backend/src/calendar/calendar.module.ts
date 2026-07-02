import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { AssignmentsModule } from '../assignments/assignments.module';
import { CompliancesModule } from '../compliances/compliances.module';

@Module({
  imports: [AssignmentsModule, CompliancesModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
