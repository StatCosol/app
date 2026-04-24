import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import { ReqUser } from '../access/access-scope.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CrmContractorRegistrationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async registerContractor(
    crmUser: ReqUser,
    dto: {
      name: string;
      email: string;
      mobile?: string;
      password: string;
      clientId: string;
      branchIds?: string[];
    },
  ) {
    // Verify CRM is assigned to this client
    const assignment =
      await this.assignmentsService.getActiveAssignmentForClient(dto.clientId);
    if (!assignment || assignment.assignedToUserId !== crmUser.userId) {
      throw new ForbiddenException('You are not assigned to this client');
    }

    // Check if email already exists
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Get CONTRACTOR role
    const contractorRole = await this.roleRepo.findOne({
      where: { code: 'CONTRACTOR' },
    });
    if (!contractorRole) {
      throw new BadRequestException('CONTRACTOR role not found in system');
    }

    // Generate user code
    const lastUser = await this.userRepo.findOne({
      where: { roleId: contractorRole.id },
      order: { userCode: 'DESC' },
    });
    const lastNum = lastUser?.userCode
      ? parseInt(lastUser.userCode.replace(/\D/g, '')) || 0
      : 0;
    const userCode = `CONTR${String(lastNum + 1).padStart(4, '0')}`;

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create contractor user
    const contractor = this.userRepo.create({
      roleId: contractorRole.id,
      userCode,
      name: dto.name,
      email: dto.email,
      mobile: dto.mobile || null,
      passwordHash,
      clientId: dto.clientId,
      isActive: true,
    });

    const savedContractor = await this.userRepo.save(contractor);

    // Link contractor to branches if provided
    if (dto.branchIds && dto.branchIds.length > 0) {
      const branchLinks = dto.branchIds.map((branchId) =>
        this.branchContractorRepo.create({
          clientId: dto.clientId,
          branchId,
          contractorUserId: savedContractor.id,
        }),
      );
      await this.branchContractorRepo.save(branchLinks);
    }

    return {
      message: 'Contractor registered successfully',
      contractor: {
        id: savedContractor.id,
        userCode: savedContractor.userCode,
        name: savedContractor.name,
        email: savedContractor.email,
        mobile: savedContractor.mobile,
      },
      credentials: {
        email: savedContractor.email,
        password: dto.password, // Return plaintext password for CRM to share with contractor
      },
    };
  }

  async listContractorsForCrm(crmUser: ReqUser) {
    // Get all clients assigned to this CRM
    const assignments =
      await this.assignmentsService.getActiveAssignmentsForCrm(crmUser.userId);
    const clientIds = assignments.map((a) => a.clientId);

    if (clientIds.length === 0) {
      return [];
    }

    // Get all contractors for these clients
    const contractors = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.client', 'c')
      .leftJoin('roles', 'r', 'r.id = u.role_id')
      .where('r.code = :code', { code: 'CONTRACTOR' })
      .andWhere('u.client_id IN (:...clientIds)', { clientIds })
      .andWhere('u.deleted_at IS NULL')
      .select([
        'u.id',
        'u.userCode',
        'u.name',
        'u.email',
        'u.mobile',
        'u.isActive',
        'u.clientId',
        'c.clientName',
      ])
      .orderBy('u.name', 'ASC')
      .getMany();

    return contractors;
  }
}
