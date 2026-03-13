import {
  Body,
  Controller,
  Get,
  MethodNotAllowedException,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { EssLoginDto } from './dto/ess-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './public.decorator';

@ApiTags('Auth')
@ApiBearerAuth('JWT')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'GET login not allowed (use POST)' })
  @Get('login')
  getLogin() {
    throw new MethodNotAllowedException('Use POST /api/auth/login');
  }

  @Public()
  @ApiOperation({ summary: 'Login with email and password' })
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @ApiOperation({ summary: 'ESS employee login' })
  @Post('ess/login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  essLogin(@Body() dto: EssLoginDto) {
    return this.auth.essLogin(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshToken(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Request a password reset link' })
  @Post('password/request-reset')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Reset password using token' })
  @Post('password/reset')
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
