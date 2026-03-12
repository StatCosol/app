import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { UserEntity } from '../users/entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
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
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Access token: short-lived (15 min default; override via JWT_ACCESS_EXPIRES_SEC)
        signOptions: {
          expiresIn: Number(
            config.get<string>('JWT_ACCESS_EXPIRES_SEC', '900'),
          ),
        },
      }),
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
