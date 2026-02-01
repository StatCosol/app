import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Like, IsNull } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { DeletionRequestEntity } from './entities/deletion-request.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';
import { ClientEntity } from '../clients/entities/client.entity';
import { ClientUserEntity } from '../clients/entities/client-user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
// BranchContractorEntity removed from directory query (table absent); use user_branches join table instead

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

export type UserListItem = {
  id: string;
  roleId: string;
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
  async findContractorsByBranchIds(branchIds: string[]): Promise<any[]> {
    if (!branchIds || branchIds.length === 0) return [];

    const rows = await this.usersRepo.manager.query(
      `
    SELECT
      bc."branchId" as "branchId",
      u.id as "id",
      u.name as "name",
      u.email as "email",
      u.mobile as "mobile",
      u."isActive" as "isActive"
    FROM branch_contractor bc
    JOIN users u ON u.id = bc."contractorUserId"
    WHERE bc."branchId" = ANY($1::uuid[])
    ORDER BY u.name ASC
    `,
      [branchIds],
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      mobile: r.mobile,
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
  ) {}

  async onModuleInit() {
    // Ensure base roles exist
    await this.seedRolesIfEmpty();
    // Ensure there is at least one admin user for initial login
    await this.seedAdminIfMissing();
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
    ];

    await this.rolesRepo.save(roles.map((r) => this.rolesRepo.create(r)));
  }

  async seedAdminIfMissing() {
    const adminEmail = 'admin@statcosol.com';

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
      return;
    }

    // Dev convenience: allow seeding a default admin only in non-production
    // In production, require DEFAULT_SEED_PASSWORD to be explicitly provided.
    const isProd = process.env.NODE_ENV === 'production';
    const seedPass = process.env.DEFAULT_SEED_PASSWORD ?? 'Admin@123';
    if (isProd && !process.env.DEFAULT_SEED_PASSWORD) {
      // Avoid silently creating an insecure default account in production.
      return;
    }

    const passwordHash = await bcrypt.hash(seedPass, 10);

    const admin = this.usersRepo.create({
      userCode: 'SSA', // Statco System Admin
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

  async listRoles(): Promise<RoleEntity[]> {
    return this.rolesRepo.find({ order: { id: 'ASC' } });
  }



  private initials(name: string) {
    return (name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w[0] || '').toUpperCase())
      .join('');
  }

  private async nextSequence(prefix: string): Promise<number> {
    // Find highest numeric suffix for codes like SCRM1, SA2, SCCO3 etc.
    const rows = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.userCode', 'userCode')
      .where('u.userCode LIKE :p', { p: `${prefix}%` })
      .getRawMany<{ userCode: string }>();

    let max = 0;
    for (const r of rows) {
      const code = r.userCode || '';
      const m = code.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m?.[1]) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }

  private async ensureUnique(base: string): Promise<string> {
    // If base exists, append -2, -3 ...
    let candidate = base;
    let i = 2;
    while (await this.usersRepo.exist({ where: { userCode: candidate } })) {
      candidate = `${base}-${i}`;
      i++;
    }
    return candidate;
  }

  private async generateUserCode(
    roleCode: string,
    name: string,
    clientId: string | null,
  ): Promise<string> {
    // Based on your required examples:
    // SSA  = Statco System Admin
    // SCRM1= Statco CRM 1
    // SA1  = Statco Auditor 1
    // Client code = initials
    // Contractor code = starts with C + initials

    if (roleCode === 'ADMIN') return this.ensureUnique('SSA');
    if (roleCode === 'CEO') return this.ensureUnique('SCEO');

    if (roleCode === 'CCO') {
      const n = await this.nextSequence('SCCO');
      return this.ensureUnique(`SCCO${n}`);
    }

    if (roleCode === 'CRM') {
      const n = await this.nextSequence('SCRM');
      return this.ensureUnique(`SCRM${n}`);
    }

    if (roleCode === 'AUDITOR') {
      const n = await this.nextSequence('SA');
      return this.ensureUnique(`SA${n}`);
    }

    if (roleCode === 'CONTRACTOR') {
      const base = `C${this.initials(name) || 'CON'}`;
      return this.ensureUnique(base);
    }

    if (roleCode === 'CLIENT') {
      const base = this.initials(name) || 'CLIENT';
      return this.ensureUnique(base);
    }

    const base = `U${this.initials(name) || 'USER'}`;
    return this.ensureUnique(base);
  }

  async createUser(dto: CreateUserDto) {
    const role = await this.rolesRepo.findOne({ where: { id: dto.roleId } });
    if (!role) throw new BadRequestException('Invalid roleId');

    await this.enforceLimits(role.code);

    // Validate clientId for CLIENT and CONTRACTOR role users (client-scoped logins)
    if (role.code === 'CLIENT' || role.code === 'CONTRACTOR') {
      if (!dto.clientId) {
        throw new BadRequestException('clientId is required for this role');
      }
      // Note: We don't have access to ClientsService here, so validation happens at controller level
      // or we need to inject ClientsService if needed
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
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userCode = await this.generateUserCode(role.code, dto.name, dto.clientId ?? null);

    const user = this.usersRepo.create({
      userCode,
      roleId: dto.roleId,
      name: dto.name,
      email: dto.email.toLowerCase(),
      mobile: dto.mobile ?? null,
      passwordHash,
      isActive: true,
      clientId: dto.clientId ?? null,
      ownerCcoId: dto.ownerCcoId ?? null,
    });

    const saved = await this.usersRepo.save(user);
    return { id: saved.id, message: 'User created' };
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
      name: string;
      email: string;
      roleCode: string | null;
      isActive: boolean;
    }[]
  > {
    const res = await this.listUsersPaged({ page: 1, pageSize: 1000 });
    const roles = await this.rolesRepo.find();
    const roleMap = new Map<string, string>();
    roles.forEach((r) => roleMap.set(r.id, r.code));

    return res.items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleCode: roleMap.get(u.roleId) ?? null,
      isActive: u.isActive,
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

    qb.andWhere('u.deletedAt IS NULL');

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

    // Hide soft-deleted users (email tagged with #deleted#)
    qb.andWhere('u.email NOT LIKE :deletedPattern', {
      deletedPattern: '%#deleted#%',
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
    const roleCode = role?.code;

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

    user.isActive = isActive;
    await this.usersRepo.save(user);
    return { message: 'User status updated' };
  }

  // ---- Auth helpers ----
  async findByEmail(email: string) {
    if (!email) return null;
    return this.usersRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });
  }

  async findById(id: string) {
    return this.usersRepo.findOne({ where: { id } });
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
    const skip = (page - 1) * limit;

    const roleCode = String(q.roleCode ?? '').trim();
    const clientId = q.clientId ? String(q.clientId) : undefined;
    const status = String(q.status ?? 'all').toUpperCase();
    const search = String(q.search ?? '').trim();
    const groupByClient = String(q.groupByClient || '').toLowerCase() === 'true';

    // Preload role map so we can reliably derive roleCode even if
    // the raw query alias is missing or null for older data.
    const roles = await this.rolesRepo.find();
    const roleCodeById = new Map<string, string>();
    roles.forEach((r) => roleCodeById.set(r.id, r.code));

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoin(RoleEntity, 'r', 'r.id = u.roleId')
      .leftJoin(ClientEntity, 'c_direct', 'c_direct.id = u.clientId')
      .select('u.id', 'id')
      .addSelect('u.user_code', 'userCode')
      .addSelect('u.name', 'name')
      .addSelect('u.email', 'email')
      .addSelect('u.mobile', 'mobile')
      .addSelect('u.isActive', 'isActive')
      .addSelect('u.createdAt', 'createdAt')
      .addSelect('r.code', 'roleCode')
      .addSelect('r.name', 'roleName')
      .addSelect('COALESCE(c_direct.id, u.clientId)', 'clientId')
      .addSelect('COALESCE(c_direct.clientName, null)', 'clientName');

    // Hide soft-deleted users (email tagged with #deleted#)
    qb.andWhere('u.email NOT LIKE :deletedPattern', {
      deletedPattern: '%#deleted#%',
    });

    // Filters
    if (roleCode && roleCode !== 'all') {
      qb.andWhere('r.code = :roleCode', { roleCode });
    }

    if (status !== 'ALL') {
      qb.andWhere('u.isActive = :isActive', { isActive: status === 'ACTIVE' });
    }

    if (clientId) {
      qb.andWhere('COALESCE(c_direct.id, u.clientId) = :clientId', { clientId });
    }

    if (search) {
      const s = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.name) LIKE :s OR LOWER(u.email) LIKE :s OR LOWER(COALESCE(u.mobile, \'\')) LIKE :s)',
        { s }
      );
    }

    // Page over distinct users because joins can create multiple rows per user
    const idQb = qb
      .clone()
      .select('u.id', 'id')
      .distinct(true)
      .orderBy('u.id', 'DESC')
      .skip(skip)
      .take(limit);

    const idRows = await idQb.getRawMany();
    const ids = idRows.map((row: any) => String(row.id));

    const totalQb = qb.clone().select('COUNT(DISTINCT u.id)', 'cnt');
    const totalRow = await totalQb.getRawOne();
    const total = Number(totalRow?.cnt || 0);

    if (ids.length === 0) {
      if (!groupByClient) {
        return { items: [], page, limit, total };
      }
      return { groups: [], page, limit, total };
    }

    const dataRows = await qb
      .clone()
      .andWhere('u.id IN (:...ids)', { ids })
      .orderBy('u.id', 'DESC')
      .getRawMany();

    // Shape into user objects
    const items = dataRows.map((r: any) => ({
      id: r.id ?? r.u_id ?? r.user_id,
      userCode: r.userCode ?? null,
      name: r.name ?? r.u_name,
      email: r.email ?? r.u_email,
      mobile: r.mobile ?? r.u_mobile,
      isActive: r.isActive ?? r.u_is_active,
      roleCode: r.roleCode ?? r.r_code,
      roleName: r.roleName ?? r.r_name,
      clientId: r.clientId ?? r.client_id ?? null,
      clientName: r.clientName ?? r.client_name ?? null,
    }));

    if (!groupByClient) {
      console.log(
        `[getUserDirectory] Returning ${items.length} users`,
        items.map(u => ({ id: u.id, userCode: u.userCode, name: u.name, email: u.email, roleCode: u.roleCode }))
      );
      return { items, page, limit, total };
    }

    // Group by client for summary view
    const groupsMap = new Map<string, any>();

    for (const u of items) {
      // Use clientId and clientName for grouping, fallback to unlinked
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
      if (u.roleCode === 'CONTRACTOR') {
        g.counts.contractors++;
      }
      if (u.roleCode === 'CLIENT') {
        g.counts.clientUsers++;
      }
      g.items.push(u);
    }

    const groups = Array.from(groupsMap.values());
    console.log(
      `[getUserDirectory] Returning ${groups.length} groups`,
      groups.map(g => ({ client: g.client, userCount: g.items.length }))
    );
    return { groups, page, limit, total };
  }

  // ✅ NEW: Used for dropdown lists (CCO screen)
  async listActiveUsersByRoleCode(roleCode: string, clientId?: string) {
    console.log(
      `[listActiveUsersByRoleCode] Looking for role: ${roleCode}, clientId: ${clientId}`,
    );
    const role = await this.rolesRepo.findOne({ where: { code: roleCode } });
    if (!role) throw new NotFoundException(`Role not found: ${roleCode}`);

    const where: any = { roleId: role.id, isActive: true, deletedAt: IsNull() };

    // For contractor dropdowns, optionally scope by clientId
    if (roleCode === 'CONTRACTOR' && clientId) {
      where.clientId = clientId;
    }

    const users = await this.usersRepo.find({
      where,
      order: { id: 'DESC' },
      withDeleted: false,
    });

    console.log(
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
    console.log(
      `[listActiveUsersByRoleCode] Returning ${result.length} users`,
      result.map(u => ({ id: u.id, name: u.name, email: u.email, roleCode: u.roleCode }))
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
    qb.andWhere('u.deletedAt IS NULL');

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
    const roleCode = role?.code;

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

    // Soft-delete user to preserve references (assignments, client links)
    // but free up the email/mobile for reuse.
    const timestamp = Date.now();
    u.isActive = false;
    u.email = `${u.email}#deleted#${timestamp}`;
    u.mobile = null;
    await this.usersRepo.save(u);

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
      if (!user.ownerCcoId) {
        throw new BadRequestException(
          'CRM has no assigned CCO. Assign owner CCO first.',
        );
      }

      requiredApproverRole = 'CCO';
      requiredApproverUserId = user.ownerCcoId;
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
      .where('r.status = :status', { status: 'PENDING' })
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
    const result: any[] = [];
    for (const r of rows) {
      let entityLabel: string | null = null;
      if (r.entityType === 'USER') {
        const u = await this.usersRepo.findOne({ where: { id: r.entityId } });
        if (u) {
          entityLabel = `${u.name} (${u.email})`;
        }
      } else if (r.entityType === 'CLIENT') {
        const c = await this.clientsRepo.findOne({ where: { id: r.entityId } });
        if (c) {
          entityLabel = `${c.clientName} (${c.clientCode})`;
        }
      }
      const requestedBy = await this.usersRepo.findOne({
        where: { id: r.requestedByUserId },
      });

      result.push({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        requestedByUserId: r.requestedByUserId,
        requiredApproverRole: r.requiredApproverRole,
        requiredApproverUserId: r.requiredApproverUserId,
        status: r.status,
        requestedAt: r.requestedAt,
        resolvedAt: r.status !== 'PENDING' ? r.updatedAt : null,
        remarks: r.remarks ?? null,
        entityLabel,
        requestedByUserName: requestedBy?.name ?? null,
        requestedByUserEmail: requestedBy?.email ?? null,
      });
    }
    return result;
  }
  // --- My Profile (api/me) ---
  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.rolesRepo.findOne({ where: { id: user.roleId } });

    return {
      id: user.id,
      roleId: user.roleId,
      roleCode: role?.code ?? null,
      name: user.name,
      email: user.email,
      mobile: user.mobile ?? null,
      clientId: user.clientId ?? null,
      isActive: user.isActive,
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
      client.status = 'INACTIVE';
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
}
