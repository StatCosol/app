import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { ServiceEntitlementsModule } from '../service-entitlements/service-entitlements.module';
import { MonthlyCloseController } from './monthly-close.controller';
import { MonthlyCloseService } from './monthly-close.service';

@Module({
  imports: [AccessModule, ServiceEntitlementsModule],
  controllers: [MonthlyCloseController],
  providers: [MonthlyCloseService],
})
export class MonthlyCloseModule {}
