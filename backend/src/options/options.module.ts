import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AdminOptionsController } from './admin-options.controller';
import { CrmOptionsController } from './crm-options.controller';
import { ClientOptionsController } from './client-options.controller';
import { BranchOptionsController } from './branch-options.controller';
import { PaydekOptionsController } from './paydek-options.controller';
import { PayrollOptionsController } from './payroll-options.controller';
import { AuditorOptionsController } from './auditor-options.controller';

/**
 * Bundles all FilterBar option endpoints (one controller per portal role).
 * Each controller delegates to AccessScopeService for scope enforcement.
 */
@Module({
  imports: [AccessModule],
  controllers: [
    AdminOptionsController,
    CrmOptionsController,
    ClientOptionsController,
    BranchOptionsController,
    PaydekOptionsController,
    PayrollOptionsController,
    AuditorOptionsController,
  ],
})
export class OptionsModule {}
