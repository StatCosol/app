import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { UserEntity } from '../users/entities/user.entity';
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
    TypeOrmModule.forFeature([UserEntity]),
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: 60 * 60 * 24 },
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
