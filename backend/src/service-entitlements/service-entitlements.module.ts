import { Module } from '@nestjs/common';
import { ServiceEntitlementsController } from './service-entitlements.controller';
import { ServiceEntitlementsService } from './service-entitlements.service';

@Module({
  controllers: [ServiceEntitlementsController],
  providers: [ServiceEntitlementsService],
  exports: [ServiceEntitlementsService],
})
export class ServiceEntitlementsModule {}
