import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ApprovalEntity } from './entities/approval.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { DeletionAuditEntity } from './entities/deletion-audit.entity';

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    @InjectRepository(ApprovalEntity)
    private readonly approvalRepo: Repository<ApprovalEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(DeletionAuditEntity)
    private readonly auditRepo: Repository<DeletionAuditEntity>,
  ) {}

  async approveClientDeletion(
    approvalId: number,
    ceoUserId: string,
    manager: EntityManager,
  ) {
    // Start transaction
    await manager.transaction(async (transactionalEntityManager) => {
      // 1. Find approval
      const approval = await transactionalEntityManager.findOne(
        ApprovalEntity,
        {
          where: {
            id: approvalId,
            status: 'PENDING',
            action: 'DELETE_CLIENT',
            entityType: 'CLIENT',
          },
          relations: ['requestedBy', 'requestedTo'],
        },
      );
      if (!approval)
        throw new NotFoundException('Approval not found or already processed');

      // 2. Update approval status
      approval.status = 'APPROVED';
      // approvals table stores only updated_at; set updatedAt by saving.
      await transactionalEntityManager.save(ApprovalEntity, approval);

      // 3. Soft delete client
      await transactionalEntityManager.update(ClientEntity, approval.entityId, {
        status: 'INACTIVE',
        isActive: false,
        deletedAt: new Date(),
      });

      // 4. Soft delete users for client
      await transactionalEntityManager
        .createQueryBuilder()
        .update(UserEntity)
        .set({ deletedAt: new Date(), isActive: false })
        .where('clientId = :clientId', { clientId: approval.entityId })
        .execute();

      // 5. Insert into deletion_audit
      await transactionalEntityManager.save(DeletionAuditEntity, {
        entityType: 'CLIENT',
        entityId: approval.entityId,
        performedBy: { id: ceoUserId },
        remarks: `Deleted via approval #${approvalId}`,
      });
    });
  }
}
