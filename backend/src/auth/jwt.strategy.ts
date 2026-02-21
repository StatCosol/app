import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

type JwtPayload = {
  sub: string; // userId
  roleId?: string;
  roleCode?: string; // ADMIN/CCO/...
  email?: string;
  name?: string;
  clientId?: string | null;
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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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

    if ((user as any).deletedAt != null) {
      Logger.warn(`JwtStrategy: rejecting token - deleted user`, 'JwtStrategy');
      throw new UnauthorizedException('User is deleted');
    }

    const roleCode = await this.usersService.getUserRoleCode(user.id);

    const normalized = {
      id: payload.sub,
      email: payload.email ?? user.email,
      roleCode,
      clientId: payload.clientId ?? user.clientId ?? null,
      userType: (user as any).userType ?? null,
      employeeId: (user as any).employeeId ?? null,
    } as const;

    Logger.log(
      `[JwtStrategy] validate done roleCode=${normalized.roleCode}`,
      'JwtStrategy',
    );

    // Attach to req.user
    return { ...normalized, userId: normalized.id };
  }
}
