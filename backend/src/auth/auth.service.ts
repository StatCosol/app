import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { EssLoginDto } from './dto/ess-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../email/email.service';

/** Refresh token lifetime in seconds (30 days) */
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

type AuthUserRecord = {
  id: string;
  roleId: string;
  name: string;
  email: string;
  mobile: string | null;
  passwordHash: string;
  isActive: boolean;
  clientId: string | null;
  deletedAt: Date | null;
  clientCode: string | null;
  clientName: string | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  private async getAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoin('u.client', 'c')
      .select([
        'u.id AS "u_id"',
        'u.role_id AS "u_role_id"',
        'u.name AS "u_name"',
        'u.email AS "u_email"',
        'u.mobile AS "u_mobile"',
        'u.password_hash AS "u_password_hash"',
        'u.is_active AS "u_is_active"',
        'u.client_id AS "u_client_id"',
        'u.deleted_at AS "u_deleted_at"',
        'c.client_code AS "c_client_code"',
        'c.client_name AS "c_client_name"',
      ])
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getRawOne<any>();

    if (!row) return null;

    return {
      id: row.u_id,
      roleId: row.u_role_id,
      name: row.u_name,
      email: row.u_email,
      mobile: row.u_mobile ?? null,
      passwordHash: row.u_password_hash,
      isActive: !!row.u_is_active,
      clientId: row.u_client_id ?? null,
      deletedAt: row.u_deleted_at ? new Date(row.u_deleted_at) : null,
      clientCode: row.c_client_code ?? null,
      clientName: row.c_client_name ?? null,
    };
  }

  async login(dto: LoginDto) {
    const email = (dto.email || '').trim().toLowerCase();
    const user = await this.getAuthUserByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Block login for inactive or soft-deleted users
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = await this.usersService.getRoleById(user.roleId);

    // Resolve branch mappings for CLIENT users
    let branchIds: string[] = [];
    let isMasterUser = false;
    if (role.code === 'CLIENT') {
      const rows: { branch_id: string }[] = await this.dataSource.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [user.id],
      );
      branchIds = rows.map((r) => r.branch_id);
      isMasterUser = branchIds.length === 0;
    }

    const tokens = await this.issueTokens(user.id, role.code, user, branchIds);

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
        clientName: user.clientName ?? null,
        clientLogoUrl: null,
        crmId: (user as any).crmId ?? null,
        userType:
          role.code === 'CLIENT'
            ? (isMasterUser ? 'MASTER' : 'BRANCH')
            : null,
        isMasterUser,
        branchIds,
        employeeId: null,
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
    const user = await this.getAuthUserByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Must be active + not deleted
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    // Verify role is EMPLOYEE
    const role = await this.usersService.getRoleById(user.roleId);
    if (role.code !== 'EMPLOYEE') {
      throw new UnauthorizedException('This login is for employees only');
    }

    // Verify company code matches the user's client
    if (!user.clientCode || user.clientCode.toUpperCase() !== companyCode) {
      throw new UnauthorizedException(
        'Company code does not match your account',
      );
    }

    const tokens = await this.issueTokens(user.id, role.code, user);

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
        clientCode: user.clientCode ?? null,
        clientName: user.clientName ?? null,
        clientLogoUrl: null,
        userType: null,
        employeeId: null,
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const payload = await this.verifyToken(dto.refreshToken, 'refresh');
    const jti = payload.jti as string | undefined;
    if (!jti) {
      throw new UnauthorizedException('Invalid refresh token (no jti)');
    }

    // Look up the token record in DB
    const storedToken = await this.refreshTokenRepo.findOne({
      where: { jti },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Reuse detection: if the token was already revoked, someone is replaying it.
    // Revoke the entire family to protect the user.
    if (storedToken.revokedAt) {
      this.logger.warn(
        `Refresh-token reuse detected! family=${storedToken.family} userId=${storedToken.userId}`,
      );
      await this.revokeTokenFamily(storedToken.family);
      throw new UnauthorizedException(
        'Refresh token reuse detected — session invalidated',
      );
    }

    // Verify the token belongs to a valid user
    const user = await this.usersRepo.findOne({
      where: { id: storedToken.userId },
    });
    if (!user || !user.isActive || user.deletedAt) {
      await this.revokeTokenFamily(storedToken.family);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke the current token (rotation)
    await this.refreshTokenRepo.update(
      { id: storedToken.id },
      { revokedAt: new Date() },
    );

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

    const tokens = await this.issueTokens(
      user.id,
      roleCode,
      user,
      branchIds,
      storedToken.family, // keep the same family for rotation chain
    );
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Logout: revoke the refresh token (and its entire family).
   */
  async logout(dto: LogoutDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      const payload = await this.verifyToken(dto.refreshToken, 'refresh');
      const jti = payload.jti as string | undefined;
      if (jti) {
        const token = await this.refreshTokenRepo.findOne({ where: { jti } });
        if (token) {
          await this.revokeTokenFamily(token.family);
        }
      }
    } catch {
      // Even if the JWT is expired or malformed, that's OK — it's a logout.
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
      },
      { expiresIn: '1h' },
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
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

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.update({ id: user.id }, { passwordHash: hashed });

    // Revoke all refresh tokens — forces re-login on all devices
    await this.revokeAllUserTokens(user.id);

    return { ok: true };
  }

  private async issueTokens(
    userId: string,
    roleCode: string,
    user?: { email?: string | null; name?: string | null; clientId?: string | null },
    branchIds?: string[],
    family?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const basePayload = {
      sub: userId,
      roleCode,
      email: user?.email,
      name: user?.name,
      clientId: user?.clientId ?? null,
      branchIds: branchIds ?? [],
    } as const;

    // Access token — short-lived, expiry set by JwtModule config (default 15 min)
    const accessToken = await this.jwt.signAsync({
      ...basePayload,
      type: 'access',
    });

    // Refresh token — long-lived, stored server-side for rotation & revocation
    const jti = randomUUID();
    const tokenFamily = family ?? randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

    const refreshToken = await this.jwt.signAsync(
      {
        ...basePayload,
        type: 'refresh',
        jti,
      },
      { expiresIn: REFRESH_TOKEN_TTL_SEC },
    );

    // Persist the refresh token record
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        jti,
        userId,
        family: tokenFamily,
        expiresAt,
      }),
    );

    return { accessToken, refreshToken };
  }

  /**
   * Revoke all refresh tokens in the same rotation family.
   */
  private async revokeTokenFamily(family: string) {
    await this.refreshTokenRepo.update(
      { family, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Revoke all refresh tokens for a specific user (e.g. password change).
   */
  async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Clean up expired refresh tokens (call from a cron job or manually).
   */
  async purgeExpiredTokens() {
    const result = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    return { deleted: result.affected ?? 0 };
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
}
