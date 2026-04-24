import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Like, IsNull, DataSource, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { DeletionRequestEntity } from './entities/deletion-request.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';


export type ListUsersPagedArgs = {
  q?: string;
  roleId?: string;
  status?: 'active' | 'inactive';
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export interface ContractorRow {
  id: string;
  name: string;
  email: string;
  mobile: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: string;
}

export type UserListItem = {
  id: string;
  roleId: string;
  userCode: string | null;
  name: string;
  email: string;
  mobile: string | null;
  isActive: boolean;
  createdAt: Date;
};

// Extended user item that includes roleCode for API consumers
export type UserListItemWithRole = UserListItem & { roleCode?: string | null };

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  async resetCeoPassword(dto: { email: string; newPassword: string }) {
    const ceoRole = await this.rolesRepo.findOne({ where: { code: 'CEO' } });
    if (!ceoRole) throw new NotFoundException('CEO role not found');
    const user = await this.usersRepo.findOne({
      where: {
        email: dto.email.toLowerCase(),
        roleId: ceoRole.id,
        isActive: true,
      },
    });
    if (!user)
      throw new NotFoundException('Active CEO user not found with this email');
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.save(user);
    return { message: 'CEO password reset successfully' };
  }

  /**
   * Find all contractors linked to the given branch IDs (for client view)
   */
  async findContractorsByBranchIds(branchIds: string[]): Promise<ContractorRow[]> {
    if (!branchIds || branchIds.length === 0) return [];

    const rows = await this.usersRepo.manager.query(
      `
    SELECT
      bc."branch_id" as "branchId",
      u.id as "id",
      u.name as "name",
      u.email as "email",
      u.mobile as "mobile",
      u."is_active" as "isActive"
    FROM branch_contractor bc
    JOIN users u ON u.id = bc."contractor_user_id"
    WHERE bc."branch_id" = ANY($1::uuid[])
      AND u.deleted_at IS NULL
      AND u.email NOT LIKE '%#deleted#%'
      AND u.email NOT LIKE '%#branch-deleted#%'
    ORDER BY u.name ASC
    `,
      [branchIds],
    );

    return rows.map((r: { id: string; name: string; email: string; mobile: string; isActive: boolean; branchId: string }) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      mobile: r.mobile,
      isActive: !!r.isActive,
      status: r.isActive ? 'ACTIVE' : 'INACTIVE',
      branchId: r.branchId,
    }));
  }
  constructor(
    @InjectRepository(RoleEntity) private rolesRepo: Repository<RoleEntity>,
    @InjectRepository(UserEntity) private usersRepo: Repository<UserEntity>,
    @InjectRepository(DeletionRequestEntity)
    private deletionRepo: Repository<DeletionRequestEntity>,
    @InjectRepository(ClientEntity)
    private clientsRepo: Repository<ClientEntity>,
    @InjectRepository(BranchEntity)
    private branchesRepo: Repository<BranchEntity>,
    private dataSource: DataSource,
    private auditLogs: AuditLogsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('SKIP_BOOTSTRAP_SEED') === 'true') {
      return;
    }

    // Seeding (roles + admin) is handled in main.ts bootstrap — not duplicated here.
    // One-time: regenerate all user codes to new format (fire-and-forget, non-blocking)
    this.regenerateUserCodesOnce().catch((err) => {
      this.logger.warn(
        'Failed to regenerate user codes on startup',
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  async seedRolesIfEmpty() {
    const count = await this.rolesRepo.count();
    if (count > 0) return;

    const roles = [
      {
        code: 'ADMIN',
        name: 'Admin',
        description: 'System owner and user management',
      },
      {
        code: 'CEO',
        name: 'Chief Escalation Officer',
        description: 'Ultimate escalation authority',
      },
      {
        code: 'CCO',
        name: 'Chief Compliance Officer',
        description: 'Supervises CRMs and Auditors',
      },
      {
        code: 'CRM',
        name: 'Client Relationship Manager',
        description: 'Executes client compliance',
      },
      {
        code: 'AUDITOR',
        name: 'Auditor',
        description: 'Audits compliance and raises observations',
      },
      {
        code: 'CLIENT',
        name: 'Client',
        description: 'Uploads payroll/documents and views status',
      },
      {
        code: 'CONTRACTOR',
        name: 'Contractor',
        description:
          'Uploads monthly compliance docs and corrects observations',
      },
      {
        code: 'EMPLOYEE',
        name: 'Employee Self-Service',
        description: 'View payslips, apply leave, manage nominations',
      },
      {
        code: 'PAYROLL',
        name: 'Payroll Manager',
        description:
          'Processes payroll, generates PF/ESI returns, manages payslips',
      },
      {
        code: 'PF_TEAM',
        name: 'PF & ESI Team',
        description:
          'Manages PF ECR generation, ESI returns, and statutory submissions',
      },
    ];

    await this.rolesRepo.save(roles.map((r) => this.rolesRepo.create(r)));
  }

  async seedAdminIfMissing() {
    const adminEmail = 'it_admin@statcosol.com';
    const explicitPass = this.config.get<string>('DEFAULT_SEED_PASSWORD');

    const adminRole = await this.rolesRepo.findOne({
      where: { code: 'ADMIN' },
    });
    if (!adminRole) {
      return;
    }

    const existing = await this.usersRepo.findOne({
      where: { email: adminEmail.toLowerCase() },
    });
    if (existing) {
      // Recovery path: when explicitly configured, rotate/reset the admin password.
      if (explicitPass) {
        const passwordHash = await bcrypt.hash(explicitPass, 10);
        await this.usersRepo.update(
          { id: existing.id },
          { passwordHash, isActive: true, deletedAt: null },
        );
      }
      return;
    }

    // Dev convenience: allow seeding a default admin only in non-production
    // In production, require DEFAULT_SEED_PASSWORD to be explicitly provided.
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (!explicitPass) {
      if (isProd) {
        // Avoid silently creating an insecure default account in production.
        return;
      }
      // In dev/test, generate a random one-time password and log it once.
      const randomPass = require('crypto')
        .randomBytes(12)
        .toString('base64url');
      const passwordHash = await bcrypt.hash(randomPass, 10);
      const admin = this.usersRepo.create({
        userCode: 'SAAD01',
        roleId: adminRole.id,
        name: 'System Admin',
        email: adminEmail.toLowerCase(),
        mobile: null,
        passwordHash,
        isActive: true,
        clientId: null,
        ownerCcoId: null,
      });
      await this.usersRepo.save(admin);
      this.logger.warn(
        `[SEED] Admin account created: ${adminEmail} (one-time password written to .seed-admin-password — or set DEFAULT_SEED_PASSWORD env var)`,
      );
      // Write password to a local file instead of logging it, to avoid credential leakage in shared logs.
      try {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(process.cwd(), '.seed-admin-password');
        fs.writeFileSync(filePath, `${adminEmail}\n${randomPass}\n`, {
          mode: 0o600,
        });
        this.logger.warn(
          `[SEED] Password written to ${filePath} — read it and delete the file.`,
        );
      } catch {
        // If file write fails (e.g. read-only container), fall back to a masked hint.
        this.logger.warn(
          '[SEED] Could not write password file. Set DEFAULT_SEED_PASSWORD env var to control the password.',
        );
      }
      return;
    }

    const passwordHash = await bcrypt.hash(explicitPass, 10);

    const admin = this.usersRepo.create({
      userCode: 'SAAD01', // System Admin - AD(min) - 01
      roleId: adminRole.id,
      name: 'System Admin',
      email: adminEmail.toLowerCase(),
      mobile: null,
      passwordHash,
      isActive: true,
      clientId: null,
      ownerCcoId: null,
    });

    await this.usersRepo.save(admin);
  }

  /**
   * One-time regeneration of all user codes to the new format:
   *   <Name Initials><Role 2-char>[<Company Abbrev>]<2-digit seq>
   *
   * Detects whether codes have already been migrated by checking if any
   * code matches the new format (2+ uppercase letters followed by 2 digits).
   * The old format used patterns like SSA, SCRM1, SA2, CJD which don't end
   * with a zero-padded 2-digit number.
   */
  private async regenerateUserCodesOnce() {
    try {
      // Quick check: if at least one user already has the new format, skip.
      const sample: { userCode: string | null }[] = await this.usersRepo.manager.query(
        `SELECT user_code AS "userCode" FROM users WHERE user_code IS NOT NULL LIMIT 50`,
      );

      const newFormatRegex = /^[A-Z]{2,}\d{2,}$/;
      const alreadyMigrated = sample.some(
        (r) => r.userCode && newFormatRegex.test(r.userCode),
      );
      if (alreadyMigrated || sample.length === 0) return;

      this.logger.log('Regenerating user codes to new format...');

      // Raw SQL avoids query-builder column-mapping issues
      const rows: Array<{
        id: string;
        name: string;
        roleCode: string;
        clientName: string | null;
      }> = await this.usersRepo.manager.query(`
        SELECT
          u.id,
          u.name,
          r.code        AS "roleCode",
          c.client_name AS "clientName"
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN clients c ON c.id = u.client_id
        ORDER BY u.created_at ASC
      `);

      const counters = new Map<string, number>();

      for (const row of rows) {
        const nameInit = this.initials(row.name) || 'XX';
        const rolePfx = this.rolePrefix(row.roleCode);

        let companyPart = '';
        if (
          (row.roleCode === 'CONTRACTOR' || row.roleCode === 'CLIENT') &&
          row.clientName
        ) {
          companyPart = this.companyAbbrev(row.clientName);
        }

        const prefix = `${nameInit}${rolePfx}${companyPart}`;
        const seq = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, seq);

        const newCode = `${prefix}${String(seq).padStart(2, '0')}`;

        await this.usersRepo.manager.query(
          `UPDATE users SET user_code = $1 WHERE id = $2`,
          [newCode, row.id],
        );
      }

      this.logger.log(`Regenerated ${rows.length} user codes.`);
    } catch (err) {
      // Log but never crash the app — code regeneration is non-critical
      this.logger.error('Failed to regenerate user codes:', err);
    }
  }

  private async enforceLimits(roleCode: string) {
    if (roleCode === 'CEO') {
      const existing = await this.usersRepo.count({
        where: {
          roleId: await this.getRoleId('CEO'),
          isActive: true,
          email: Not(Like('%#deleted#%')),
        },
      });
      if (existing >= 1)
        throw new BadRequestException('Only one CEO user is allowed.');
    }
    if (roleCode === 'CCO') {
      const existing = await this.usersRepo.count({
        where: { roleId: await this.getRoleId('CCO') },
      });
      if (existing >= 5)
        throw new BadRequestException('Only five CCO users are allowed.');
    }
  }

  async getRoleId(code: string): Promise<string> {
    const role = await this.rolesRepo.findOne({ where: { code } });
    if (!role) throw new NotFoundException(`Role not found: ${code}`);
    return role.id;
  }

  async getRoleById(roleId: string) {
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role not found for id: ${roleId}`);
    return role;
  }

  async findRoleByCode(code: string): Promise<RoleEntity | null> {
    return this.rolesRepo.findOne({ where: { code } });
  }

  /**
   * Create an ESS (EMPLOYEE) user record linked to an employee.
   */
  async createEssUser(dto: {
    userCode: string;
    roleId: string;
    roleCode: string;
    name: string;
    email: string;
    passwordHash: string;
    clientId: string;
    employeeId: string;
  }): Promise<UserEntity> {
    const user = this.usersRepo.create({
      userCode: dto.userCode,
      roleId: dto.roleId,
      role: dto.roleCode,
      name: dto.name,
      email: dto.email.toLowerCase(),
      mobile: null,
      passwordHash: dto.passwordHash,
      isActive: true,
      clientId: dto.clientId,
      employeeId: dto.employeeId,
      userType: null,
    });
    const saved = await this.usersRepo.save(user);

    // employee_id is hidden from regular ORM writes in some environments,
    // so persist the ESS link explicitly for auth/ESS lookups.
    await this.usersRepo.manager.query(
      `UPDATE users SET employee_id = $1 WHERE id = $2`,
      [dto.employeeId, saved.id],
    );

    const created = await this.findById(saved.id);
    if (!created) throw new Error('Failed to retrieve created user');
    return created;
  }

  async listRoles(): Promise<RoleEntity[]> {
    return this.rolesRepo.find({ order: { id: 'ASC' } });
  }

  /** Extract first letter of each word from a name */
  private initials(name: string): string {
    return (name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w[0] || '').toUpperCase())
      .join('');
  }

  /** Words to exclude when abbreviating company/client names */
  private static readonly COMPANY_SUFFIXES = new Set([
    'pvt',
    'ltd',
    'private',
    'limited',
    'inc',
    'corp',
    'corporation',
    'llp',
    'llc',
    'co',
    'company',
  ]);

  /** First letter of each word in company name, excluding common suffixes */
  private companyAbbrev(companyName: string): string {
    return (companyName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !UsersService.COMPANY_SUFFIXES.has(w.toLowerCase()))
      .map((w) => (w[0] || '').toUpperCase())
      .join('');
  }

  /** Role code → 2-character prefix for user codes */
  private rolePrefix(roleCode: string): string {
    const map: Record<string, string> = {
      ADMIN: 'AD',
      CEO: 'CE',
      CCO: 'CC',
      CRM: 'CR',
      AUDITOR: 'AU',
      CLIENT: 'CL',
      CONTRACTOR: 'CO',
      ACCOUNTS: 'AC',
    };
    return map[roleCode] ?? roleCode.substring(0, 2).toUpperCase();
  }

  /**
   * Find the next 2-digit sequence number for a given prefix.
   * E.g. if MKCR01 and MKCR02 exist, returns 3.
   */
  private async nextSequence2(prefix: string): Promise<number> {
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.userCode', 'userCode')
      .where('u.userCode LIKE :p', { p: `${prefix}%` })
      .getRawMany<{ userCode: string }>();

    let max = 0;
    for (const r of rows) {
      const code = r.userCode || '';
      const suffix = code.substring(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return max + 1;
  }

  /**
   * Generate a human-readable user code.
   *
   * Format: <Name Initials><Role 2-char>[<Company Abbrev>]<2-digit seq>
   *
   * Examples:
   *   Madan Kumar  + CRM                           → MKCR01
   *   Manoj Kumar  + CRM                           → MKCR02
   *   Venu Gopal   + CONTRACTOR to Vedha Entech India Pvt Ltd → VGCOVEI01
   *   Raj Patel    + AUDITOR                       → RPAU01
   *   Admin User   + ADMIN                         → AUAD01
   */
  private async generateUserCode(
    roleCode: string,
    name: string,
    clientId: string | null,
  ): Promise<string> {
    const nameInit = this.initials(name) || 'XX';
    const rolePfx = this.rolePrefix(roleCode);

    let companyPart = '';
    // For CONTRACTOR and CLIENT roles, include abbreviated client/company name
    if ((roleCode === 'CONTRACTOR' || roleCode === 'CLIENT') && clientId) {
      const client = await this.clientsRepo.findOne({
        where: { id: clientId },
        select: ['id', 'clientName'],
      });
      if (client?.clientName) {
        companyPart = this.companyAbbrev(client.clientName);
      }
    }

    const prefix = `${nameInit}${rolePfx}${companyPart}`;
    const seq = await this.nextSequence2(prefix);
    const code = `${prefix}${String(seq).padStart(2, '0')}`;
    return code;
  }

  async createUser(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const mobile = dto.mobile ? dto.mobile.trim() : null;

    const role = await this.rolesRepo.findOne({ where: { id: dto.roleId } });
    if (!role) throw new BadRequestException('Invalid roleId');

    // CLIENT MASTER users must be created via the Client Registration flow (createMasterUserForClient)
    // CLIENT BRANCH users are allowed here (auto-created when adding a branch)
    if (role.code === 'CLIENT' && dto.userType !== 'BRANCH') {
      throw new BadRequestException(
        'Client master users cannot be created from this endpoint. Use the Client Registration page instead.',
      );
    }

    await this.enforceLimits(role.code);

    // Validate clientId for CLIENT and CONTRACTOR role users (client-scoped logins)
    if (role.code === 'CLIENT' || role.code === 'CONTRACTOR') {
      if (!dto.clientId) {
        throw new BadRequestException('clientId is required for this role');
      }
      const client = await this.clientsRepo.findOne({
        where: {
          id: dto.clientId,
          isDeleted: false,
          deletedAt: IsNull(),
          isActive: true,
        },
      });
      if (!client) {
        throw new BadRequestException('Client not found or inactive');
      }
    }

    // For CRM users, enforce ownerCcoId and validate it refers to an active CCO user
    if (role.code === 'CRM') {
      if (!dto.ownerCcoId) {
        throw new BadRequestException('ownerCcoId is required for CRM users');
      }

      const ownerCco = await this.usersRepo.findOne({
        where: { id: dto.ownerCcoId },
      });
      if (!ownerCco) {
        throw new BadRequestException('Owner CCO user not found');
      }

      const ownerRole = await this.rolesRepo.findOne({
        where: { id: ownerCco.roleId },
      });
      if (!ownerRole || ownerRole.code !== 'CCO') {
        throw new BadRequestException('ownerCcoId must refer to a CCO user');
      }

      if (!ownerCco.isActive) {
        throw new BadRequestException('Owner CCO user must be active');
      }
    }

    const existing = await this.usersRepo.findOne({
      where: { email, deletedAt: IsNull() },
    });
    if (existing) throw new BadRequestException('Email already exists');

    // Auto-generate password if not provided: Us@<4-digit random><year>
    const plainPassword =
      dto.password ||
      `Us@${Math.floor(1000 + Math.random() * 9000)}${new Date().getFullYear()}`;
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const userCode = await this.generateUserCode(
      role.code,
      name,
      dto.clientId ?? null,
    );

    // CLIENT user type: MASTER vs BRANCH
    let userType: string | null = null;
    if (role.code === 'CLIENT') {
      userType = dto.userType || 'MASTER';

      // Enforce: only one MASTER per client
      if (userType === 'MASTER' && dto.clientId) {
        const existingMaster = await this.usersRepo.findOne({
          where: {
            clientId: dto.clientId,
            userType: 'MASTER',
            isActive: true,
          },
        });
        if (existingMaster) {
          throw new BadRequestException(
            'A master user already exists for this client. Each client can have only one master user.',
          );
        }
      }

      // BRANCH users must have at least one branchId
      if (
        userType === 'BRANCH' &&
        (!dto.branchIds || dto.branchIds.length === 0)
      ) {
        throw new BadRequestException(
          'Branch users must be assigned to at least one branch',
        );
      }
    }

    const user = this.usersRepo.create({
      userCode,
      roleId: dto.roleId,
      role: role.code, // legacy column required by DB constraint
      name,
      email,
      mobile,
      passwordHash,
      isActive: true,
      clientId: dto.clientId ?? null,
      ownerCcoId: dto.ownerCcoId ?? null,
      userType,
    });

    const saved = await this.usersRepo.save(user);

    // Persist userType via raw SQL (entity has insert:false/update:false)
    if (userType) {
      await this.usersRepo.manager.query(
        `UPDATE users SET user_type = $1 WHERE id = $2`,
        [userType, saved.id],
      );
    }

    // Assign branches for BRANCH CLIENT users via user_branches join table
    if (
      role.code === 'CLIENT' &&
      userType === 'BRANCH' &&
      dto.branchIds?.length
    ) {
      const branchIds = dto.branchIds;
      const branches = await this.branchesRepo.find({
        where: {
          id: In(branchIds),
          clientId: dto.clientId,
          isDeleted: false,
          deletedAt: IsNull(),
          isActive: true,
        },
      });

      if (branches.length !== branchIds.length) {
        throw new BadRequestException(
          'One or more branches are invalid or not linked to the client',
        );
      }

      await this.usersRepo
        .createQueryBuilder()
        .relation(UserEntity, 'branches')
        .of(saved.id)
        .add(branchIds);
    }

    // Audit log for user creation
    await this.auditLogs.log({
      entityType: 'USER',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: null,
      performedRole: 'ADMIN',
      afterJson: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: role.code,
        userType,
        clientId: dto.clientId ?? null,
      },
    });

    return {
      id: saved.id,
      message: 'User created',
      userType,
      // Return auto-generated password so admin can share credentials
      ...(dto.password ? {} : { generatedPassword: plainPassword }),
    };
  }

  /**
   * Create a MASTER CLIENT user within an existing transaction.
   * Used by ClientsService.create() to atomically create client + master user.
   */
  async createMasterUserForClient(
    manager: import('typeorm').EntityManager,
    args: {
      name: string;
      email: string;
      mobile?: string | null;
      password: string;
      clientId: string;
    },
  ): Promise<{ id: string; email: string; userCode: string }> {
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();

    // Resolve CLIENT role
    const clientRole = await this.rolesRepo.findOne({
      where: { code: 'CLIENT' },
    });
    if (!clientRole) throw new NotFoundException('CLIENT role not found');

    // Check duplicate email within the transaction
    const existingEmail = await manager.findOne(UserEntity, {
      where: { email, deletedAt: IsNull() },
    });
    if (existingEmail) throw new BadRequestException('Email already exists');

    // Enforce single MASTER per client
    const existingMaster = await manager.findOne(UserEntity, {
      where: { clientId: args.clientId, userType: 'MASTER', isActive: true },
    });
    if (existingMaster) {
      throw new BadRequestException(
        'A master user already exists for this client. Each client can have only one master user.',
      );
    }

    const passwordHash = await bcrypt.hash(args.password, 10);
    const userCode = await this.generateUserCode('CLIENT', name, args.clientId);

    const user = manager.create(UserEntity, {
      userCode,
      roleId: clientRole.id,
      role: 'CLIENT',
      name,
      email,
      mobile: args.mobile ?? null,
      passwordHash,
      isActive: true,
      clientId: args.clientId,
      userType: 'MASTER',
    });

    const saved = await manager.save(UserEntity, user);

    // Persist userType via raw SQL (entity has insert:false/update:false)
    await manager.query(
      `UPDATE users SET user_type = $1 WHERE id = $2`,
      ['MASTER', saved.id],
    );

    // Audit log for master user creation
    await this.auditLogs.log({
      entityType: 'USER',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: null,
      performedRole: 'ADMIN',
      afterJson: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: 'CLIENT',
        userType: 'MASTER',
        clientId: args.clientId,
      },
    });

    return { id: saved.id, email: saved.email, userCode: saved.userCode };
  }

  // ✅ SAFE: no passwordHash exposure
  async listUsers(): Promise<UserListItem[]> {
    const res = await this.listUsersPaged({ page: 1, pageSize: 1000 });
    return res.items;
  }

  // Returns users with roleCode for simple dropdowns / list endpoints
  async listUsersWithRoleCode(): Promise<
    {
      id: string;
      userCode: string | null;
      name: string;
      email: string;
      roleCode: string | null;
      isActive: boolean;
      createdAt: Date;
    }[]
  > {
    const res = await this.listUsersPaged({ page: 1, pageSize: 1000 });
    const roles = await this.rolesRepo.find();
    const roleMap = new Map<string, string>();
    roles.forEach((r) => roleMap.set(r.id, r.code));

    return res.items.map((u) => ({
      id: u.id,
      userCode: u.userCode,
      name: u.name,
      email: u.email,
      roleCode: roleMap.get(u.roleId) ?? null,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  }

  async listUsersPaged(
    args: ListUsersPagedArgs,
  ): Promise<PagedResult<UserListItemWithRole>> {
    const q = (args.q || '').trim().toLowerCase();
    const roleId = args.roleId;
    const status = args.status;
    const pageSize = Math.min(200, Math.max(1, Number(args.pageSize || 20)));
    const page = Math.max(1, Number(args.page || 1));

    const qb = this.usersRepo.createQueryBuilder('u');

    // Critical: Filter out soft-deleted users
    qb.andWhere('u.deleted_at IS NULL');

    const sortBy = (args.sortBy || 'id').toLowerCase();
    const sortDir: 'ASC' | 'DESC' =
      (args.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const sortMap: Record<string, string> = {
      id: 'u.id',
      name: 'u.name',
      email: 'u.email',
      roleid: 'u.roleId',
      status: 'u.isActive',
      createdat: 'u.createdAt',
    };

    qb.orderBy(sortMap[sortBy] || 'u.id', sortDir);

    // Hide soft-deleted users (email tagged with #deleted# or #branch-deleted#)
    qb.andWhere('u.email NOT LIKE :deletedPattern', {
      deletedPattern: '%#deleted#%',
    });
    qb.andWhere('u.email NOT LIKE :branchDeletedPattern', {
      branchDeletedPattern: '%#branch-deleted#%',
    });

    if (roleId) {
      qb.andWhere('u.roleId = :roleId', { roleId });
    }

    if (status === 'active') {
      qb.andWhere('u.isActive = :a', { a: true });
    } else if (status === 'inactive') {
      qb.andWhere('u.isActive = :a', { a: false });
    }

    if (q) {
      // search in name/email/mobile/id
      qb.andWhere(
        "(LOWER(u.name) LIKE :q OR LOWER(u.email) LIKE :q OR LOWER(COALESCE(u.mobile, '')) LIKE :q OR CAST(u.id AS TEXT) LIKE :qid)",
        { q: `%${q}%`, qid: `%${q}%` },
      );
    }

    const [users, total]: [UserEntity[], number] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    // include roleCode in items for easier frontend use
    const roles = await this.rolesRepo.find();
    const roleMap = new Map<string, string>();
    roles.forEach((r) => roleMap.set(r.id, r.code));

    return {
      items: users.map((u) => ({
        id: u.id,
        roleId: u.roleId,
        userCode: u.userCode,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        isActive: u.isActive,
        createdAt: u.createdAt,
        roleCode: roleMap.get(u.roleId) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async updateUserStatus(
    userId: string,
    isActive: boolean,
    currentUserId?: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });
    if (!role) throw new NotFoundException('Role not found for user');
    const roleCode = role.code;

    // Prevent changing status of ADMIN or CEO users entirely
    if (roleCode === 'ADMIN' || roleCode === 'CEO') {
      throw new BadRequestException(
        'Admin or CEO users cannot be activated/deactivated',
      );
    }

    // Prevent changing your own status (extra safety)
    if (currentUserId && userId === currentUserId) {
      throw new BadRequestException('You cannot change your own status');
    }

    // Block deactivating CRM/AUDITOR users who have active client assignments
    if (!isActive && (roleCode === 'CRM' || roleCode === 'AUDITOR')) {
      const activeAssignments: Array<{ cnt: string }> =
        await this.dataSource.query(
          `SELECT COUNT(*) AS cnt FROM client_assignments_current
           WHERE assigned_to_user_id = $1`,
          [userId],
        );
      const count = Number(activeAssignments[0]?.cnt ?? 0);
      if (count > 0) {
        throw new BadRequestException(
          `Cannot deactivate ${roleCode} user — they have ${count} active client assignment(s). Unassign them first.`,
        );
      }
    }

    const previousStatus = user.isActive;
    user.isActive = isActive;
    await this.usersRepo.save(user);

    // Audit log
    await this.auditLogs.log({
      entityType: 'USER',
      entityId: userId,
      action: 'STATUS_CHANGE',
      performedBy: currentUserId ?? null,
      performedRole: 'ADMIN',
      beforeJson: { isActive: previousStatus },
      afterJson: { isActive, roleCode, name: user.name },
    });

    return { message: 'User status updated' };
  }

  /**
   * Update user profile fields (name, email, mobile).
   * Does NOT allow password change or role change from here.
   */
  async updateUser(
    userId: string,
    dto: { name?: string; email?: string; mobile?: string },
    currentUserId?: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });
    if (!role) throw new NotFoundException('Role not found for user');
    const roleCode = role.code;

    // Prevent editing ADMIN or CEO users by other admins
    if (
      (roleCode === 'ADMIN' || roleCode === 'CEO') &&
      currentUserId !== userId
    ) {
      throw new BadRequestException(
        'Admin or CEO users can only be edited by themselves',
      );
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email.toLowerCase();
    if (dto.mobile !== undefined) user.mobile = dto.mobile ?? null;

    const saved = await this.usersRepo.save(user);

    // Audit log
    await this.auditLogs.log({
      entityType: 'USER',
      entityId: userId,
      action: 'UPDATE',
      performedBy: currentUserId ?? null,
      performedRole: 'ADMIN',
      beforeJson: { name: user.name, email: user.email, mobile: user.mobile },
      afterJson: { name: saved.name, email: saved.email, mobile: saved.mobile },
    });

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      mobile: saved.mobile,
      message: 'User updated',
    };
  }

  /**
   * Admin-triggered password reset. Generates a new password for the user.
   * Cannot be used for CEO or ADMIN users.
   */
  async adminResetPassword(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });
    if (!role) throw new NotFoundException('Role not found for user');
    const roleCode = role.code;

    if (roleCode === 'ADMIN' || roleCode === 'CEO') {
      throw new BadRequestException(
        'Cannot reset ADMIN or CEO password from Admin panel',
      );
    }

    // Auto-generate a password
    const newPassword = `Reset@${Math.floor(1000 + Math.random() * 9000)}`;
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(newPassword, 10);

    user.passwordHash = hashed;
    await this.usersRepo.save(user);

    // Audit log
    await this.auditLogs.log({
      entityType: 'USER',
      entityId: userId,
      action: 'PASSWORD_RESET',
      performedBy: null,
      performedRole: 'ADMIN',
      afterJson: { resetFor: user.email, roleCode },
    });

    return { message: 'Password reset', userId, newPassword };
  }

  // ---- Auth helpers ----
  async findByEmail(email: string) {
    if (!email) return null;
    return this.usersRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.userType')
      .addSelect('user.employeeId')
      .where('user.id = :id', { id })
      .getOne();
  }

  async validateLogin(email: string, plainPassword: string) {
    if (!email || !plainPassword) {
      throw new UnauthorizedException('Email and password are required');
    }

    // Find user by email
    const user = await this.findByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('User is inactive');

    const ok = await bcrypt.compare(plainPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const role = await this.getRoleById(user.roleId);

    return {
      userId: user.id,
      roleId: user.roleId,
      roleCode: role.code,
      name: user.name,
      email: user.email,
      clientId: user.clientId ?? null,
    };
  }

  // ✅ Used for validating CRM/AUDITOR assignment
  async getUserRoleCode(userId: string): Promise<string> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User not found: ${userId}`);

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });
    if (!role)
      throw new NotFoundException(`Role not found for user: ${userId}`);

    return role.code;
  }

  async getAssignedClientIds(userId: string): Promise<string[]> {
    const rows: { client_id: string }[] = await this.dataSource.query(
      `SELECT client_id FROM client_assignments_current
       WHERE assigned_to_user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.client_id);
  }

  async getPayrollAssignedClientIds(userId: string): Promise<string[]> {
    const rows: { client_id: string }[] = await this.dataSource.query(
      `SELECT client_id FROM payroll_client_assignments
       WHERE payroll_user_id = $1 AND status = 'ACTIVE' AND end_date IS NULL`,
      [userId],
    );
    return rows.map((r) => r.client_id);
  }

  // Ensure a user is scoped to a single client. If clientId is not set, assign it;
  // if already set to a different client, throw.
  async ensureUserClientScope(userId: string, clientId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User not found: ${userId}`);

    if (user.clientId == null) {
      user.clientId = clientId;
      await this.usersRepo.save(user);
      return;
    }

    if (user.clientId !== clientId) {
      throw new BadRequestException(
        `User ${userId} is already scoped to client ${user.clientId} and cannot be used for client ${clientId}`,
      );
    }
  }

  // Advanced directory: global search + filters + pagination + optional grouping by client
  async getUserDirectory(q: UserDirectoryQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page || 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit || 25)));
    const offset = (page - 1) * limit;

    const roleCode = String(q.roleCode ?? '')
      .trim()
      .toUpperCase();
    const clientId = q.clientId ? String(q.clientId) : undefined;
    const status = String(q.status ?? 'all').toUpperCase();
    const search = String(q.search ?? '').trim();
    const groupByClient =
      String(q.groupByClient || '').toLowerCase() === 'true';

    // Build raw SQL to avoid any TypeORM column-resolution issues
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // CRITICAL: Always exclude soft-deleted users
    conditions.push('u.deleted_at IS NULL');
    conditions.push("u.email NOT LIKE '%#deleted#%'");
    conditions.push("u.email NOT LIKE '%#branch-deleted#%'");

    // Role filter
    if (roleCode && roleCode !== 'ALL') {
      conditions.push(`r.code = $${paramIdx}`);
      params.push(roleCode);
      paramIdx++;
    }

    // Status filter
    if (status === 'ACTIVE') {
      conditions.push('u.is_active = true');
    } else if (status === 'INACTIVE') {
      conditions.push('u.is_active = false');
    }
    // status 'ALL' = show active + inactive, but never deleted

    // Client filter
    if (clientId) {
      conditions.push(`COALESCE(c.id, u.client_id) = $${paramIdx}`);
      params.push(clientId);
      paramIdx++;
    }

    // Search filter
    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      conditions.push(
        `(LOWER(u.name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(COALESCE(u.mobile, '')) LIKE $${paramIdx})`,
      );
      params.push(searchPattern);
      paramIdx++;
    }

    const whereClause =
      conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT u.id)::int AS total
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN clients c ON c.id = u.client_id
      ${whereClause}
    `;
    const countResult = await this.dataSource.query(countSql, params);
    const total = countResult?.[0]?.total ?? 0;

    if (total === 0) {
      if (!groupByClient) {
        return { items: [], page, limit, total: 0 };
      }
      return { groups: [], page, limit, total: 0 };
    }

    // Data query
    const dataSql = `
      SELECT
        u.id,
        u.user_code   AS "userCode",
        u.name,
        u.email,
        u.mobile,
        u.is_active   AS "isActive",
        u.created_at  AS "createdAt",
        u.deleted_at  AS "deletedAt",
        r.code        AS "roleCode",
        r.name        AS "roleName",
        COALESCE(c.id, u.client_id)          AS "clientId",
        COALESCE(c.client_name, NULL)         AS "clientName"
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN clients c ON c.id = u.client_id
      ${whereClause}
      ORDER BY u.id DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    const dataParams = [...params, limit, offset];

    this.logger.debug(
      '[getUserDirectory] SQL:',
      dataSql.replace(/\s+/g, ' ').trim(),
    );
    this.logger.debug('[getUserDirectory] Params:', dataParams);

    const dataRows: { id: string; userCode: string | null; name: string; email: string; mobile: string | null; isActive: boolean; createdAt: string; deletedAt: string | null; roleCode: string | null; roleName: string | null; clientId: string | null; clientName: string | null }[] = await this.dataSource.query(dataSql, dataParams);

    this.logger.debug(
      `[getUserDirectory] DB returned ${dataRows.length} rows, total=${total}`,
    );

    // Final safety net: filter in JS (should be no-op if SQL is correct)
    const items = dataRows
      .filter((r) => {
        if (r.deletedAt) return false;
        if (
          r.email?.includes('#deleted#') ||
          r.email?.includes('#branch-deleted#')
        )
          return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        userCode: r.userCode ?? null,
        name: r.name,
        email: r.email,
        mobile: r.mobile ?? null,
        isActive: r.isActive,
        createdAt: r.createdAt,
        roleCode: r.roleCode ?? null,
        roleName: r.roleName ?? null,
        clientId: r.clientId ?? null,
        clientName: r.clientName ?? null,
      }));

    if (dataRows.length !== items.length) {
      this.logger.warn(
        `[getUserDirectory] JS filter removed ${dataRows.length - items.length} deleted users that SQL missed!`,
      );
    }

    if (!groupByClient) {
      return { items, page, limit, total };
    }

    // Group by client for summary view
    const groupsMap = new Map<
      string,
      {
        client: { id: string; name: string };
        counts: { contractors: number; clientUsers: number };
        items: typeof items;
      }
    >();

    for (const u of items) {
      const cid: string = u.clientId ?? '__unlinked__';
      const cname: string = u.clientName ?? 'Unlinked';
      if (!groupsMap.has(cid)) {
        groupsMap.set(cid, {
          client: { id: cid, name: cname },
          counts: { contractors: 0, clientUsers: 0 },
          items: [],
        });
      }

      const g = groupsMap.get(cid);
      if (!g) continue;
      if (u.roleCode === 'CONTRACTOR') {
        g.counts.contractors++;
      }
      if (u.roleCode === 'CLIENT') {
        g.counts.clientUsers++;
      }
      g.items.push(u);
    }

    const groups = Array.from(groupsMap.values());
    return { groups, page, limit, total };
  }

  // ✅ NEW: Used for dropdown lists (CCO screen)
  async listActiveUsersByRoleCode(roleCode: string, clientId?: string) {
    this.logger.debug(
      `[listActiveUsersByRoleCode] Looking for role: ${roleCode}, clientId: ${clientId}`,
    );
    const role = await this.rolesRepo.findOne({ where: { code: roleCode } });
    if (!role) throw new NotFoundException(`Role not found: ${roleCode}`);

    const where: { roleId: string; isActive: true; deletedAt: ReturnType<typeof IsNull>; clientId?: string } = { roleId: role.id, isActive: true, deletedAt: IsNull() };

    // For contractor dropdowns, optionally scope by clientId
    if (roleCode === 'CONTRACTOR' && clientId) {
      where.clientId = clientId;
    }

    const users = await this.usersRepo.find({
      where,
      order: { id: 'DESC' },
      withDeleted: false,
    });

    this.logger.debug(
      `[listActiveUsersByRoleCode] Found ${users.length} users with roleCode=${roleCode}`,
    );
    const result = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      roleCode,
      isActive: u.isActive,
    }));
    this.logger.debug(
      `[listActiveUsersByRoleCode] Returning ${result.length} users`,
      result.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleCode: u.roleCode,
      })),
    );
    return result;
  }
  async listAuditorsPaged(params: {
    q?: string;
    status?: 'active' | 'inactive';
    page?: number;
    pageSize?: number;
  }) {
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 25)));
    const page = Math.max(1, Number(params.page || 1));
    const q = (params.q || '').trim().toLowerCase();
    const roleId = await this.getRoleId('AUDITOR');

    const qb = this.usersRepo.createQueryBuilder('u');
    qb.andWhere('u.roleId = :roleId', { roleId });
    qb.andWhere('u.deleted_at IS NULL');
    qb.andWhere('u.email NOT LIKE :deletedPattern', {
      deletedPattern: '%#deleted#%',
    });
    qb.andWhere('u.email NOT LIKE :branchDeletedPattern', {
      branchDeletedPattern: '%#branch-deleted#%',
    });

    if (params.status === 'active') {
      qb.andWhere('u.isActive = :a', { a: true });
    } else if (params.status === 'inactive') {
      qb.andWhere('u.isActive = :a', { a: false });
    }

    if (q) {
      qb.andWhere(
        "(LOWER(u.name) LIKE :q OR LOWER(u.email) LIKE :q OR LOWER(COALESCE(u.mobile, '')) LIKE :q OR CAST(u.id AS TEXT) LIKE :qid)",
        { q: `%${q}%`, qid: `%${q}%` },
      );
    }

    qb.orderBy('u.isActive', 'DESC')
      .addOrderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      page,
      pageSize,
      totalCount: total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async deleteUser(id: string, currentUserId?: string) {
    const u = await this.usersRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: u.roleId } });
    if (!role) throw new NotFoundException('Role not found for user');
    const roleCode = role.code;

    // Prevent deleting any ADMIN or CEO user, or deleting yourself
    if (roleCode === 'ADMIN') {
      throw new BadRequestException('Admin users cannot be deleted');
    }
    if (roleCode === 'CEO') {
      throw new BadRequestException('CEO users cannot be deleted');
    }
    if (currentUserId && id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Soft-delete user: deactivate, mark deleted_at, free email/mobile, and unlink branches
    const timestamp = Date.now();
    u.isActive = false;
    u.deletedAt = new Date();
    u.email = `${u.email}#deleted#${timestamp}`;
    u.mobile = null;
    await this.usersRepo.save(u);

    // Remove branch mappings to keep directory and access in sync
    await this.dataSource.query(
      `DELETE FROM user_branches WHERE user_id = $1`,
      [id],
    );

    return { ok: true };
  }

  // ---- Deletion requests + approvals ----

  /**
   * Generic helper to create a deletion request record.
   */
  async createDeletionRequest(
    entityType: string,
    entityId: string,
    requestedByUserId: string,
    requiredApproverRole: string,
    requiredApproverUserId: string | null,
  ) {
    const req = this.deletionRepo.create({
      entityType,
      entityId,
      requestedByUserId,
      requiredApproverRole,
      requiredApproverUserId,
      status: 'PENDING',
    });

    const saved = await this.deletionRepo.save(req);
    return {
      id: saved.id,
      message: 'Deletion request created',
      status: saved.status,
    };
  }

  /**
   * Create a deletion request for a USER entity. For CRM users, route to the
   * assigned owner CCO (user-level). For other users, route to CCO role queue.
   */
  async createUserDeletionRequest(
    targetUserId: string,
    requestedByUserId: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: targetUserId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleCode = await this.getUserRoleCode(user.id);

    // CEO users are not deletable at all
    if (roleCode === 'CEO') {
      throw new BadRequestException('CEO user cannot be deleted');
    }

    let requiredApproverRole = 'CCO';
    let requiredApproverUserId: string | null = null;

    if (roleCode === 'CRM') {
      requiredApproverRole = 'CCO';
      // Prefer user-level routing to owner CCO when available.
      // Fallback to role-queue so deletion does not fail for legacy/unassigned CRM users.
      requiredApproverUserId = user.ownerCcoId ?? null;
    } else if (roleCode === 'CCO') {
      // CCO deletions must be approved by CEO (role-based queue)
      requiredApproverRole = 'CEO';
      requiredApproverUserId = null;
    } else {
      // Other user deletions: route to CCO role queue (no specific user)
      requiredApproverRole = 'CCO';
      requiredApproverUserId = null;
    }

    return this.createDeletionRequest(
      'USER',
      targetUserId,
      requestedByUserId,
      requiredApproverRole,
      requiredApproverUserId,
    );
  }

  /**
   * List pending deletion requests visible to a given approver (CCO/CEO).
   * If requiredApproverUserId is set, only that specific user sees it;
   * otherwise fallback to role-based routing.
   */
  async listPendingDeletionRequestsForApprover(
    userId: string,
    roleCode: string,
  ) {
    const qb = this.deletionRepo
      .createQueryBuilder('r')
      .andWhere(
        `(
          (r.requiredApproverUserId IS NULL AND r.requiredApproverRole = :role)
          OR
          (r.requiredApproverUserId = :uid)
        )`,
        { role: roleCode, uid: userId },
      )
      .orderBy('r.requestedAt', 'DESC');

    const rows = await qb.getMany();

    // Enrich with friendly labels for UI (entity + requester)
    const cleanEmail = (e: string) =>
      e ? e.replace(/#deleted#\d+/g, '').replace(/#deleted#/g, '') : e;
    const result: { id: number; entityType: string; entityId: string; status: string; remarks: string | null; entityLabel: string | null; requestedBy: { id: string; name: string; email: string } | null; createdAt: Date; updatedAt: Date | null }[] = [];
    for (const r of rows) {
      let entityLabel: string | null = null;
      if (r.entityType === 'USER') {
        const u = await this.usersRepo.findOne({ where: { id: r.entityId } });
        if (u) {
          entityLabel = `${u.name} (${cleanEmail(u.email)})`;
        }
      } else if (r.entityType === 'CLIENT') {
        const c = await this.clientsRepo.findOne({ where: { id: r.entityId } });
        if (c) {
          entityLabel = `${c.clientName} (${c.clientCode})`;
        }
      }
      const requestedByUser = await this.usersRepo.findOne({
        where: { id: r.requestedByUserId },
      });

      result.push({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        status: r.status,
        remarks: r.remarks ?? null,
        entityLabel,
        requestedBy: requestedByUser
          ? {
              id: requestedByUser.id,
              name: requestedByUser.name,
              email: cleanEmail(requestedByUser.email),
            }
          : null,
        createdAt: r.requestedAt,
        updatedAt: r.updatedAt ?? null,
      });
    }
    return result;
  }
  // --- My Profile (api/me) ---
  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['client'],
    });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });
    const roleCode = role?.code ?? null;

    // For CLIENT users, return branch info
    let branchIds: string[] = [];
    let userType: string | null = user.userType ?? null;
    let isMasterUser = false;

    if (roleCode === 'CLIENT') {
      const rows: { branch_id: string }[] = await this.dataSource.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      branchIds = rows.map((r) => r.branch_id);
      isMasterUser = branchIds.length === 0;
      // Ensure userType is consistent
      if (!userType) {
        userType = isMasterUser ? 'MASTER' : 'BRANCH';
      }
    }

    return {
      id: user.id,
      roleId: user.roleId,
      roleCode,
      name: user.name,
      email: user.email,
      mobile: user.mobile ?? null,
      clientId: user.clientId ?? null,
      clientName: user.client?.clientName ?? null,
      clientLogoUrl: user.client?.logoUrl ?? null,
      isActive: user.isActive,
      userType,
      branchIds,
      isMasterUser,
      createdAt: user.createdAt,
    };
  }

  async updateMyProfile(
    userId: string,
    dto: { name?: string; mobile?: string | null },
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.name != null) user.name = String(dto.name).trim();
    if (dto.mobile !== undefined) user.mobile = dto.mobile;

    await this.usersRepo.save(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile ?? null,
    };
  }

  async changeMyPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException(
        'New password must be at least 6 characters',
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);

    return { ok: true };
  }
  async approveDeletionRequest(
    requestId: string,
    approverUserId: string,
    approverRoleCode: string,
  ) {
    const reqId = Number(requestId);
    if (isNaN(reqId)) {
      throw new BadRequestException('Invalid request ID');
    }
    const req = await this.deletionRepo.findOne({ where: { id: reqId } });
    if (!req || req.status !== 'PENDING') {
      throw new BadRequestException('Invalid request');
    }

    const isUserSpecific = !!req.requiredApproverUserId;

    if (isUserSpecific) {
      if (req.requiredApproverUserId !== approverUserId) {
        throw new UnauthorizedException('Not your approval request');
      }
    } else {
      if (req.requiredApproverRole !== approverRoleCode) {
        throw new UnauthorizedException('Not allowed');
      }
    }

    // Execute soft delete based on entity type
    if (req.entityType === 'USER') {
      await this.deleteUser(req.entityId, approverUserId);
    } else if (req.entityType === 'CLIENT') {
      const client = await this.clientsRepo.findOne({
        where: { id: req.entityId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }
      client.isDeleted = true;
      client.isActive = false;
      client.status = 'INACTIVE';
      client.deletedAt = new Date();
      client.deletedBy = approverUserId;
      await this.clientsRepo.save(client);
    }

    req.status = 'APPROVED';
    await this.deletionRepo.save(req);

    return { ok: true };
  }

  async rejectDeletionRequest(
    requestId: string,
    approverUserId: string,
    approverRoleCode: string,
    remarks: string,
  ) {
    const reqId = Number(requestId);
    if (isNaN(reqId)) {
      throw new BadRequestException('Invalid request ID');
    }
    const req = await this.deletionRepo.findOne({ where: { id: reqId } });

    if (!req || req.status !== 'PENDING') {
      throw new BadRequestException('Invalid request');
    }

    const isUserSpecific = !!req.requiredApproverUserId;

    if (isUserSpecific) {
      if (req.requiredApproverUserId !== approverUserId) {
        throw new UnauthorizedException('Not your approval request');
      }
    } else {
      if (req.requiredApproverRole !== approverRoleCode) {
        throw new UnauthorizedException('Not allowed');
      }
    }

    req.status = 'REJECTED';
    req.remarks = remarks || null;

    await this.deletionRepo.save(req);

    return { ok: true };
  }

  async updateUserFromPortal(
    userId: string,
    dto: {
      fullName?: string;
      email?: string;
      role?: string;
      password?: string;
      isActive?: boolean;
      mobile?: string;
    },
    currentUserId?: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const currentRole = await this.rolesRepo.findOne({
      where: { id: user.roleId },
    });
    const currentRoleCode = currentRole?.code ?? null;

    if (
      (currentRoleCode === 'ADMIN' || currentRoleCode === 'CEO') &&
      currentUserId !== userId
    ) {
      throw new BadRequestException(
        'Admin or CEO users can only be edited by themselves',
      );
    }

    const before = {
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      roleId: user.roleId,
      role: user.role,
      isActive: user.isActive,
    };

    if (dto.fullName !== undefined) {
      user.name = dto.fullName.trim();
    }

    if (dto.email !== undefined) {
      user.email = dto.email.trim().toLowerCase();
    }

    if (dto.mobile !== undefined) {
      user.mobile = dto.mobile?.trim() || null;
    }

    if (dto.role !== undefined) {
      const nextRoleCode = dto.role.trim().toUpperCase();
      const nextRole = await this.rolesRepo.findOne({
        where: { code: nextRoleCode },
      });
      if (!nextRole) {
        throw new BadRequestException(`Invalid role: ${dto.role}`);
      }
      user.roleId = nextRole.id;
      user.role = nextRole.code;
    }

    if (dto.password !== undefined && dto.password.trim()) {
      const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
      user.passwordHash = passwordHash;
    }

    if (typeof dto.isActive === 'boolean') {
      user.isActive = dto.isActive;
    }

    const saved = await this.usersRepo.save(user);

    await this.auditLogs.log({
      entityType: 'USER',
      entityId: saved.id,
      action: 'UPDATE',
      performedBy: currentUserId ?? null,
      performedRole: 'ADMIN',
      beforeJson: before,
      afterJson: {
        name: saved.name,
        email: saved.email,
        mobile: saved.mobile,
        roleId: saved.roleId,
        role: saved.role,
        isActive: saved.isActive,
      },
    });

    return {
      id: saved.id,
      fullName: saved.name,
      email: saved.email,
      mobile: saved.mobile,
      role: saved.role,
      isActive: saved.isActive,
      message: 'User updated',
    };
  }
}
