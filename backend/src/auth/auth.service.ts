import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { EssLoginDto } from './dto/ess-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const email = (dto.email || '').trim().toLowerCase();

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

    // Block login for inactive or soft-deleted users
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

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
      isMasterUser = branchIds.length === 0;
    }

    const tokens = await this.issueTokens(user.id, role.code, user, branchIds);

    // Record last login timestamp (fire-and-forget)
    this.dataSource.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id],
    ).catch(() => {});

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
      throw new UnauthorizedException(
        'Company code does not match your account',
      );
    }

    const tokens = await this.issueTokens(user.id, role.code, user);

    // Record last login timestamp (fire-and-forget)
    this.dataSource.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id],
    ).catch(() => {});

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
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const payload = await this.verifyToken(dto.refreshToken, 'refresh');
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
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

    const tokens = await this.issueTokens(user.id, roleCode, user, branchIds);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // Backward-compatible logout endpoint for controller wiring.
  async logout(_: { refreshToken?: string }) {
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

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.update({ id: user.id }, { passwordHash: hashed });
    return { ok: true };
  }

  private async issueTokens(
    userId: string,
    roleCode: string,
    user?: UserEntity,
    branchIds?: string[],
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const basePayload = {
      sub: userId,
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
      },
      { expiresIn: '30d' },
    );

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
}
