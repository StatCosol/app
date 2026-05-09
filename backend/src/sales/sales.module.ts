import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadEntity } from './entities/lead.entity';
import { LeadActivityEntity } from './entities/lead-activity.entity';
import { SalesService } from './sales.service';
import { SalesLeadsController, CeoSalesController } from './sales.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LeadEntity, LeadActivityEntity])],
  controllers: [SalesLeadsController, CeoSalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
