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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async login(dto: LoginDto) {
    const email = (dto.email || '').trim().toLowerCase();

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.client', 'c')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .addSelect('u.passwordHash')
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
        fullName: (user as any).fullName ?? user.name ?? null,
        name: user.name,
        clientId: user.clientId ?? null,
        clientName: user.client?.clientName ?? null,
        clientLogoUrl: (user.client as any)?.logoUrl ?? null,
        crmId: (user as any).crmId ?? null,
        userType: user.userType ?? null,
        isMasterUser,
        branchIds,
        employeeId: (user as any).employeeId ?? null,
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
      .leftJoinAndSelect('u.client', 'c')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .addSelect('u.passwordHash')
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

    // Verify company code matches the user's client
    if (
      !user.client ||
      user.client.clientCode?.toUpperCase() !== companyCode
    ) {
      throw new UnauthorizedException('Company code does not match your account');
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
        fullName: (user as any).fullName ?? user.name ?? null,
        name: user.name,
        clientId: user.clientId ?? null,
        clientCode: user.client?.clientCode ?? null,
        clientName: user.client?.clientName ?? null,
        clientLogoUrl: (user.client as any)?.logoUrl ?? null,
        userType: user.userType ?? null,
        employeeId: (user as any).employeeId ?? null,
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

    // TODO: integrate email service; for now return token for dev usage.
    return { resetToken };
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
