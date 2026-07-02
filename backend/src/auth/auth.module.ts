import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserLoginLogEntity } from '../users/entities/user-login-log.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccessPolicyService } from './policies/access-policy.service';
import { BranchAccessService } from './branch-access.service';
import { LegitxReadOnlyGuard } from './policies/legitx-readonly.guard';
import { EmailModule } from '../email/email.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    EmailModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      RefreshTokenEntity,
      UserLoginLogEntity,
    ]),
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Single source of truth: JWT_ACCESS_EXPIRES_SEC (in seconds), also
        // returned to the frontend by /auth/session-config. The legacy
        // JWT_EXPIRES_IN env (e.g. "12h") is no longer honored — having two
        // knobs caused prod to issue 12h tokens while the UI idle timer
        // assumed 15m.
        const sec = Number(config.get<string>('JWT_ACCESS_EXPIRES_SEC', '900'));
        const expiresIn = Number.isFinite(sec) && sec > 0 ? sec : 900;
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AccessPolicyService,
    BranchAccessService,
    LegitxReadOnlyGuard,
  ],
  exports: [
    JwtModule,
    AccessPolicyService,
    BranchAccessService,
    LegitxReadOnlyGuard,
  ],
})
export class AuthModule {}
