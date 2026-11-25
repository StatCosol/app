import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { UserLoginLogEntity } from '../users/entities/user-login-log.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { EssLoginDto } from './dto/ess-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import {
  CUSTOM_SERVICES_PACKAGE,
  FULL_SERVICE_PACKAGE,
  PACKAGE_MODULES,
  SERVICE_MODULE_CODES,
} from '../service-entitlements/service-entitlements.constants';

// Per-account login lockout. Complements the IP-based ThrottlerGuard with a
// per-email lockout that blunts low-and-slow credential-stuffing across
// rotating IPs. Threshold: 5 failures within 15 min → locked for 15 min.
// Resets on successful login.
//
// The state lives in Postgres (login_lockouts) so every backend replica sees
// the same count and a deploy does not wipe it. With the old in-memory map
// and up to 3 replicas, an attacker got up to 15 tries per window and a
// fresh 5 after every restart. The in-memory functions below remain only as
// a fallback if the table cannot be reached.
const LOGIN_LOCK_MAX_FAILS = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
type LoginAttemptState = {
  count: number;
  firstFailAt: number;
  lockedUntil: number;
};
const loginAttempts = new Map<string, LoginAttemptState>();

function getLockKey(email: string) {
  return (email || '').trim().toLowerCase();
}

function lockedError(lockedUntil: number) {
  const mins = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
  return new UnauthorizedException(
    `Account temporarily locked due to too many failed attempts. Try again in ~${mins} min.`,
  );
}

function memoryAssertNotLocked(email: string) {
  const key = getLockKey(email);
  const state = loginAttempts.get(key);
  if (state && state.lockedUntil > Date.now()) {
    throw lockedError(state.lockedUntil);
  }
}

function memoryRecordFailure(email: string) {
  const key = getLockKey(email);
  if (!key) return;
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || now - state.firstFailAt > LOGIN_LOCK_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstFailAt: now, lockedUntil: 0 });
    return;
  }
  state.count += 1;
  if (state.count >= LOGIN_LOCK_MAX_FAILS) {
    state.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
  }
}

function memoryReset(email: string) {
  loginAttempts.delete(getLockKey(email));
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  async onModuleInit() {
    // Ensure the refresh_tokens table exists (idempotent)
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          jti         VARCHAR(64)  NOT NULL,
          user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          family      UUID         NOT NULL,
          expires_at  TIMESTAMPTZ  NOT NULL,
          revoked_at  TIMESTAMPTZ,
          created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_jti    ON refresh_tokens(jti);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userid        ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family        ON refresh_tokens(family);
      `);
      this.logger.log('refresh_tokens table verified');
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS login_lockouts (
          lock_key      VARCHAR(320) PRIMARY KEY,
          fail_count    INTEGER      NOT NULL,
          first_fail_at TIMESTAMPTZ  NOT NULL,
          locked_until  TIMESTAMPTZ
        );
      `);
      this.logger.log('login_lockouts table verified');
    } catch (err) {
      this.logger.error('Failed to ensure refresh_tokens table', err);
    }
  }

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepo: Repository<RoleEntity>,
    @InjectRepository(UserLoginLogEntity)
    private readonly loginLogRepo: Repository<UserLoginLogEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  private async assertNotLocked(email: string): Promise<void> {
    const key = getLockKey(email);
    if (!key) return;
    let rows: { locked_until: Date | string }[];
    try {
      rows = await this.dataSource.query(
        `SELECT locked_until FROM login_lockouts
          WHERE lock_key = $1 AND locked_until > now()`,
        [key],
      );
    } catch (err) {
      this.logger.warn(
        `login lockout lookup fell back to memory: ${(err as Error)?.message ?? String(err)}`,
      );
      return memoryAssertNotLocked(key);
    }
    if (rows?.length) {
      throw lockedError(new Date(rows[0].locked_until).getTime());
    }
  }

  private async recordLoginFailure(email: string): Promise<void> {
    const key = getLockKey(email);
    if (!key) return;
    const windowSec = LOGIN_LOCK_WINDOW_MS / 1000;
    const lockSec = LOGIN_LOCK_DURATION_MS / 1000;
    try {
      // One atomic statement, so concurrent failures on different replicas
      // are all counted.
      await this.dataSource.query(
        `INSERT INTO login_lockouts AS l (lock_key, fail_count, first_fail_at, locked_until)
         VALUES ($1, 1, now(), NULL)
         ON CONFLICT (lock_key) DO UPDATE SET
           fail_count = CASE WHEN l.first_fail_at < now() - make_interval(secs => $2)
                             THEN 1 ELSE l.fail_count + 1 END,
           first_fail_at = CASE WHEN l.first_fail_at < now() - make_interval(secs => $2)
                                THEN now() ELSE l.first_fail_at END,
           locked_until = CASE
             WHEN l.first_fail_at < now() - make_interval(secs => $2) THEN NULL
             WHEN l.fail_count + 1 >= $3 THEN now() + make_interval(secs => $4)
             ELSE l.locked_until END`,
        [key, windowSec, LOGIN_LOCK_MAX_FAILS, lockSec],
      );
    } catch (err) {
      this.logger.warn(
        `login lockout write fell back to memory: ${(err as Error)?.message ?? String(err)}`,
      );
      memoryRecordFailure(key);
    }
  }

  private async resetLoginAttempts(email: string): Promise<void> {
    const key = getLockKey(email);
    memoryReset(key);
    try {
      await this.dataSource.query(
        `DELETE FROM login_lockouts
          WHERE lock_key = $1
             OR (first_fail_at < now() - interval '1 day'
                 AND (locked_until IS NULL OR locked_until < now()))`,
        [key],
      );
    } catch (err) {
      this.logger.warn(
        `login lockout reset failed: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const email = (dto.email || '').trim().toLowerCase();
    await this.assertNotLocked(email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoin('u.client', 'c')
      .select([
        'u.id',
        'u.roleId',
        'u.name',
        'u.email',
        'u.mobile',
        'u.passwordHash',
        'u.sessionVersion',
        'u.userType',
        'u.employeeId',
        'u.isActive',
        'u.clientId',
        'u.deletedAt',
        'c.id',
        'c.clientCode',
        'c.clientName',
        'c.logoUrl',
      ])
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    if (!user) {
      await this.recordLoginFailure(email);
      this.logLoginEvent(
        email,
        null,
        null,
        null,
        ip,
        userAgent,
        'FAILED',
        'NOT_FOUND',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Block login for inactive or soft-deleted users
    if (!user.isActive || user.deletedAt) {
      await this.recordLoginFailure(email);
      this.logLoginEvent(
        email,
        user.id,
        null,
        user.clientId,
        ip,
        userAgent,
        'FAILED',
        user.deletedAt ? 'DELETED' : 'INACTIVE',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isMatch) {
      await this.recordLoginFailure(email);
      this.logLoginEvent(
        email,
        user.id,
        null,
        user.clientId,
        ip,
        userAgent,
        'FAILED',
        'BAD_PASSWORD',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.resetLoginAttempts(email);

    const role = await this.usersService.getRoleById(user.roleId);

    // Block EMPLOYEE users – they must use the ESS portal login
    if (role.code === 'EMPLOYEE') {
      throw new UnauthorizedException(
        'Employees must log in through the ESS portal',
      );
    }

    // Resolve branch mappings for CLIENT users
    let branchIds: string[] = [];
    let isMasterUser = false;
    if (role.code === 'CLIENT') {
      const rows: { branch_id: string }[] = await this.dataSource.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [user.id],
      );
      branchIds = rows.map((r) => r.branch_id);
      isMasterUser =
        user.userType === 'MASTER' ||
        (user.userType !== 'BRANCH' && branchIds.length === 0);
    }

    const tokens = await this.issueTokens(user.id, role.code, user, branchIds);
    const servicePackage = user.clientId
      ? await this.getClientServicePackage(user.clientId)
      : null;

    // Record last login timestamp (fire-and-forget)
    this.dataSource
      .query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id])
      .catch(() => {});

    // Log successful login event
    this.logLoginEvent(
      email,
      user.id,
      role.code,
      user.clientId,
      ip,
      userAgent,
      'SUCCESS',
      null,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        roleCode: role.code,
        fullName: user.name ?? null,
        name: user.name,
        clientId: user.clientId ?? null,
        clientName: user.client?.clientName ?? null,
        clientLogoUrl: user.client?.logoUrl ?? null,
        crmId: null,
        userType:
          role.code === 'CLIENT'
            ? (user.userType ?? (isMasterUser ? 'MASTER' : 'BRANCH'))
            : (user.userType ?? null),
        isMasterUser,
        branchIds,
        employeeId: user.employeeId ?? null,
        servicePackage: servicePackage?.packageCode ?? null,
        enabledModules: servicePackage?.enabledModules ?? [],
      },
    };
  }

  /**
   * ESS-specific login: validates company code + email + password,
   * ensures role is EMPLOYEE and user belongs to the given company.
   */
  async essLogin(dto: EssLoginDto) {
    const email = (dto.email || '').trim().toLowerCase();
    const companyCode = (dto.companyCode || '').trim().toUpperCase();
    await this.assertNotLocked(email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoin('u.client', 'c')
      .select([
        'u.id',
        'u.roleId',
        'u.name',
        'u.email',
        'u.mobile',
        'u.passwordHash',
        'u.sessionVersion',
        'u.userType',
        'u.employeeId',
        'u.isActive',
        'u.clientId',
        'u.deletedAt',
        'c.id',
        'c.clientCode',
        'c.clientName',
        'c.logoUrl',
      ])
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Must be active + not deleted
    if (!user.isActive || user.deletedAt) {
      await this.recordLoginFailure(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      await this.recordLoginFailure(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify role is EMPLOYEE
    const role = await this.usersService.getRoleById(user.roleId);
    if (role.code !== 'EMPLOYEE') {
      throw new UnauthorizedException('This login is for employees only');
    }

    // Verify company code matches the user's client.
    // Accept known aliases derived from client metadata to support
    // user-facing codes like "VEDHA" for "Vedha Entech ...".
    const normalize = (value?: string | null) =>
      (value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

    const clientCode = normalize(user.client?.clientCode);
    const clientName = (user.client?.clientName || '').trim();
    const firstWord = normalize(clientName.split(/\s+/)[0] || '');
    const initials = normalize(
      clientName
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token[0])
        .join(''),
    );

    const provided = normalize(companyCode);
    const allowedCodes = new Set([clientCode, firstWord, initials]);

    if (!user.client || !allowedCodes.has(provided)) {
      await this.recordLoginFailure(email);
      throw new UnauthorizedException(
        'Company code does not match your account',
      );
    }

    await this.resetLoginAttempts(email);

    const tokens = await this.issueTokens(user.id, role.code, user);
    const servicePackage = user.clientId
      ? await this.getClientServicePackage(user.clientId)
      : null;

    // Record last login timestamp (fire-and-forget)
    this.dataSource
      .query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id])
      .catch(() => {});

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        roleCode: role.code,
        fullName: user.name ?? null,
        name: user.name,
        clientId: user.clientId ?? null,
        clientCode: user.client?.clientCode ?? null,
        clientName: user.client?.clientName ?? null,
        clientLogoUrl: user.client?.logoUrl ?? null,
        userType: user.userType ?? null,
        employeeId: user.employeeId ?? null,
        servicePackage: servicePackage?.packageCode ?? null,
        enabledModules: servicePackage?.enabledModules ?? [],
      },
    };
  }

  private async getClientServicePackage(clientId: string): Promise<{
    packageCode: string;
    enabledModules: string[];
  }> {
    let packageRows: { package_code: string; approved_at: Date | null }[] = [];
    try {
      packageRows = await this.dataSource.query(
        `SELECT package_code, approved_at
           FROM client_service_packages
          WHERE client_id = $1::uuid
          LIMIT 1`,
        [clientId],
      );
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }
    const packageRow = packageRows[0];
    const packageCode =
      packageRow?.package_code && PACKAGE_MODULES[packageRow.package_code]
        ? packageRow.package_code
        : packageRow
          ? CUSTOM_SERVICES_PACKAGE
          : FULL_SERVICE_PACKAGE;
    if (packageRow && !packageRow.approved_at) {
      return { packageCode, enabledModules: [] };
    }
    let entitlementRows: { module_code: string }[] = [];
    try {
      entitlementRows = await this.dataSource.query(
        `SELECT module_code
           FROM client_module_entitlements
          WHERE client_id = $1::uuid
            AND is_enabled = TRUE
          ORDER BY module_code`,
        [clientId],
      );
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }
    const enabledModules = this.normalizeEnabledModules(
      entitlementRows.length
        ? entitlementRows.map((r) => r.module_code)
        : (PACKAGE_MODULES[packageCode] ?? [...SERVICE_MODULE_CODES]),
    );

    return {
      packageCode,
      enabledModules,
    };
  }

  /** Drop retired modules and unknown codes from JWT / session payloads. */
  private normalizeEnabledModules(modules: string[]): string[] {
    const allowedModules = new Set(SERVICE_MODULE_CODES);
    return modules.filter(
      (module) =>
        allowedModules.has(module as (typeof SERVICE_MODULE_CODES)[number]) &&
        module !== 'MOBILE_ATTENDANCE',
    );
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const payload = await this.verifyToken(dto.refreshToken, 'refresh');

    // Check jti against the DB — reject revoked or unknown tokens
    const jti = payload.jti;
    if (!jti) {
      throw new UnauthorizedException('Invalid refresh token (no jti)');
    }

    const stored = await this.refreshTokenRepo.findOne({ where: { jti } });
    if (!stored) {
      throw new UnauthorizedException('Refresh token not recognised');
    }

    if (stored.revokedAt) {
      // Refresh token reuse detected — revoke the entire family
      this.logger.warn(
        `Refresh token reuse detected for family=${stored.family}, revoking all`,
      );
      await this.refreshTokenRepo.update(
        { family: stored.family },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Revoke the current token (one-time use / rotation)
    await this.refreshTokenRepo.update(
      { id: stored.id },
      { revokedAt: new Date() },
    );

    const user = await this.usersRepo.findOne({
      where: { id: payload.sub },
      select: {
        id: true,
        roleId: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
        clientId: true,
        userType: true,
        employeeId: true,
        sessionVersion: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if ((payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const roleCode = await this.usersService.getUserRoleCode(user.id);

    // Re-resolve branchIds for CLIENT users on refresh
    let branchIds: string[] = [];
    if (roleCode === 'CLIENT') {
      const rows: { branch_id: string }[] = await this.dataSource.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [user.id],
      );
      branchIds = rows.map((r) => r.branch_id);
    }

    // Issue new tokens in the same family
    const tokens = await this.issueTokens(
      user.id,
      roleCode,
      user,
      branchIds,
      stored.family,
    );
    const servicePackage = user.clientId
      ? await this.getClientServicePackage(user.clientId)
      : null;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        userId: user.id,
        roleCode,
        clientId: user.clientId ?? null,
        userType:
          roleCode === 'CLIENT'
            ? (user.userType ?? (branchIds.length ? 'BRANCH' : 'MASTER'))
            : (user.userType ?? null),
        isMasterUser: roleCode === 'CLIENT' ? branchIds.length === 0 : false,
        branchIds,
        servicePackage: servicePackage?.packageCode ?? null,
        enabledModules: servicePackage?.enabledModules ?? [],
      },
    };
  }

  /** Revoke the refresh token (and its entire family) on logout */
  async logout(dto: { refreshToken?: string }) {
    if (dto.refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<any>(dto.refreshToken);
        const jti = payload?.jti;
        if (jti) {
          const stored = await this.refreshTokenRepo.findOne({
            where: { jti },
          });
          if (stored) {
            // Revoke the entire token family
            await this.refreshTokenRepo.update(
              { family: stored.family },
              { revokedAt: new Date() },
            );
          }
        }
      } catch {
        // Token may already be expired/invalid — still OK
      }
    }
    return { ok: true };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const email = (dto.email || '').trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { email } });

    // Do not leak existence of the user; still return ok.
    if (!user) {
      return { ok: true };
    }

    const resetToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        type: 'reset',
        sessionVersion: user.sessionVersion ?? 0,
      },
      { expiresIn: '1h' },
    );

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
    const bodyHtml = `
      <p>You requested a password reset for your StatCo account.</p>
      <p>Click the link below to reset your password (valid for 1 hour):</p>
      <p><a href="${resetLink}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Reset Password</a></p>
      <p style="color:#888;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
    `;

    await this.emailService.send(
      user.email,
      'Password Reset — StatCo Solutions',
      'Password Reset',
      bodyHtml,
    );

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || !dto.newPassword) {
      throw new BadRequestException('Token and newPassword are required');
    }

    const payload = await this.verifyToken(dto.token, 'reset');
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if ((payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
      throw new UnauthorizedException('Reset token has already been used');
    }
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.usersRepo.update(
      { id: user.id, sessionVersion: user.sessionVersion ?? 0 },
      { passwordHash: hashed },
    );
    if (updated.affected === 0)
      throw new UnauthorizedException('Reset token has already been used');

    // Notify admin users about the password change
    this.notifyAdminsOfPasswordReset(user).catch(() => {});

    return { ok: true };
  }

  private async notifyAdminsOfPasswordReset(user: UserEntity) {
    const adminRole = await this.rolesRepo.findOne({
      where: { code: 'ADMIN' },
    });
    if (!adminRole) return;

    const admins = await this.usersRepo.find({
      where: { roleId: adminRole.id, isActive: true, deletedAt: null as any },
    });
    if (!admins.length) return;

    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    if (!adminEmails.length) return;

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
    });
    const bodyHtml = `
      <p>A user has reset their password via the <b>Forgot Password</b> flow.</p>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Name</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb">${user.name}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Login Email</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb">${user.email}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">User Code</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb">${user.userCode}</td></tr>
        <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Changed At</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb">${now}</td></tr>
      </table>
    `;

    await this.emailService.send(
      adminEmails,
      'Password Reset Notification — StatCo Solutions',
      'Password Reset Notification',
      bodyHtml,
    );
  }

  private async issueTokens(
    userId: string,
    roleCode: string,
    user?: UserEntity,
    branchIds?: string[],
    family?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = randomUUID();
    const tokenFamily = family ?? randomUUID();

    const basePayload = {
      sub: userId,
      sessionVersion: user?.sessionVersion ?? 0,
      roleCode,
      email: user?.email,
      name: user?.name,
      clientId: user?.clientId ?? null,
      branchIds: branchIds ?? [],
    } as const;

    const accessToken = await this.jwt.signAsync({
      ...basePayload,
      type: 'access',
    });

    const refreshToken = await this.jwt.signAsync(
      {
        ...basePayload,
        type: 'refresh',
        jti,
        family: tokenFamily,
      },
      { expiresIn: '14d' },
    );

    // Store the refresh token in the DB for revocation support
    await this.refreshTokenRepo.save({
      jti,
      userId,
      family: tokenFamily,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });

    return { accessToken, refreshToken };
  }

  private async verifyToken(token: string, type: 'refresh' | 'reset') {
    try {
      const payload = await this.jwt.verifyAsync<any>(token);
      if (payload?.type !== type) {
        throw new UnauthorizedException('Invalid token type');
      }
      return payload;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /** Fire-and-forget login event logger */
  private logLoginEvent(
    email: string,
    userId: string | null,
    roleCode: string | null,
    clientId: string | null,
    ip?: string,
    userAgent?: string,
    status: 'SUCCESS' | 'FAILED' = 'SUCCESS',
    failureReason?: string | null,
  ) {
    this.loginLogRepo
      .insert({
        userId: userId ?? null,
        email,
        roleCode: roleCode ?? 'UNKNOWN',
        clientId: clientId ?? null,
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
        status,
        failureReason: failureReason ?? null,
      })
      .catch(() => {}); // fire-and-forget
  }
}
