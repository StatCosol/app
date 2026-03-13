import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';
import { BranchAuditorAssignmentEntity } from '../assignments/entities/branch-auditor-assignment.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AccessScopeService } from './access-scope.service';

/**
 * Central access-scoping module.
 * Import AccessModule into any feature module that needs scope enforcement.
 * It exports AccessScopeService — no need to re-register entities.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientAssignment,
      BranchAuditorAssignmentEntity,
      ClientEntity,
      BranchEntity,
    ]),
  ],
  providers: [AccessScopeService],
  exports: [AccessScopeService],
})
export class AccessModule {}
