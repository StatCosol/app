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

@Controller('api/auth')
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
}
