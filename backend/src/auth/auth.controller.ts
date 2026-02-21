import {
  Body,
  Controller,
  Get,
  MethodNotAllowedException,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { EssLoginDto } from './dto/ess-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login')
  getLogin() {
    throw new MethodNotAllowedException('Use POST /api/auth/login');
  }

  @Post('login')
  @Throttle({ default: { ttl: 60, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('ess/login')
  @Throttle({ default: { ttl: 60, limit: 10 } })
  essLogin(@Body() dto: EssLoginDto) {
    return this.auth.essLogin(dto);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60, limit: 20 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshToken(dto);
  }

  @Post('password/request-reset')
  @Throttle({ default: { ttl: 300, limit: 5 } })
  requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Post('password/reset')
  @Throttle({ default: { ttl: 300, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
