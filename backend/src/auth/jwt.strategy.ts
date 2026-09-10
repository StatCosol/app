import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

type JwtPayload = {
  sub: string; // userId
  /**
   * Which credential this is: 'access', 'refresh' or 'reset'.
   *
   * All three are signed with the same JWT_SECRET, so without checking this a
   * refresh token — good for 14 days — worked as an API credential on every
   * protected route, and so did a password-reset token, which is emailed and
   * therefore sits in mail logs, browser history and referrer headers.
   */
  type?: string;
  roleId?: string;
  roleCode?: string; // ADMIN/CCO/...
  email?: string;
  name?: string;
  clientId?: string | null;
  branchIds?: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private maskId(id?: string) {
    if (!id) return '';
    // show only first 4 + last 4
    return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  }
  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    Logger.log(
      `[JwtStrategy] validate start roleCode=${payload.roleCode}`,
      'JwtStrategy',
    );
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Only an access token authenticates an API call. issueTokens() has stamped
    // type on every token since it was written, and access tokens live 15
    // minutes, so nothing valid is in flight without it. The /uploads
    // middleware in main.ts already made exactly this check; the strategy
    // guarding every other route did not.
    if (payload.type !== 'access') {
      Logger.warn(
        `JwtStrategy: rejecting token - wrong type "${payload.type ?? 'missing'}"`,
        'JwtStrategy',
      );
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      Logger.warn(
        `JwtStrategy: rejecting token - user not found`,
        'JwtStrategy',
      );
      throw new UnauthorizedException('User not found');
    }

    if (user.isActive === false) {
      Logger.warn(
        `JwtStrategy: rejecting token - inactive user`,
        'JwtStrategy',
      );
      throw new UnauthorizedException('User is inactive');
    }

    if (user.deletedAt != null) {
      Logger.warn(`JwtStrategy: rejecting token - deleted user`, 'JwtStrategy');
      throw new UnauthorizedException('User is deleted');
    }

    const roleCode = await this.usersService.getUserRoleCode(user.id);
    const branchIds = ['CLIENT', 'BRANCH_DESK'].includes(roleCode)
      ? await this.usersService.getUserBranchIds(user.id)
      : (payload.branchIds ?? []);
    const userType =
      roleCode === 'CLIENT'
        ? (user.userType ?? (branchIds.length ? 'BRANCH' : 'MASTER'))
        : (user.userType ?? null);

    const normalized = {
      id: payload.sub,
      email: payload.email ?? user.email,
      roleCode,
      clientId: payload.clientId ?? user.clientId ?? null,
      userType,
      employeeId: user.employeeId ?? null,
      branchIds,
      assignedClientIds: [] as string[],
    };

    // CRM, AUDITOR and PAYDEK are all granted access per client through
    // `client_assignments_current`, so all three need the list loaded —
    // ScopeGuard denies a clientId that is not in it, and an unpopulated list
    // would lock the user out of their own clients.
    if (roleCode === 'CRM' || roleCode === 'AUDITOR' || roleCode === 'PAYDEK') {
      normalized.assignedClientIds =
        await this.usersService.getAssignedClientIds(payload.sub);
    }

    if (roleCode === 'PAYROLL') {
      normalized.assignedClientIds =
        await this.usersService.getPayrollAssignedClientIds(payload.sub);
    }

    Logger.log(
      `[JwtStrategy] validate done roleCode=${normalized.roleCode} clientId=${this.maskId(normalized.clientId ?? undefined)}`,
      'JwtStrategy',
    );

    // Attach to req.user
    return { ...normalized, userId: normalized.id };
  }
}
