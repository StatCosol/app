import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollStatutorySlabEntity } from './entities/payroll-statutory-slab.entity';
import { StateSlabService } from './services/state-slab.service';

/**
 * PT / LWF slab resolution, shared by employee and contractor payroll.
 *
 * It has its own module because two feature modules need it and neither should
 * reach into the other. Before this, ContractorComputationService carried a
 * private copy of the same fallback chain and band match — so a rule added to
 * one and not the other meant contractor and employee payroll deducting
 * different PT for the same state, which is the kind of divergence nobody
 * notices until a filing disagrees with a payslip.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PayrollStatutorySlabEntity])],
  providers: [StateSlabService],
  exports: [StateSlabService],
})
export class StateSlabModule {}
