import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';

@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user?.userId);
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateMyProfileDto) {
    return this.usersService.updateMyProfile(req.user?.userId, dto);
  }

  @Patch('password')
  changePassword(@Req() req: any, @Body() dto: ChangeMyPasswordDto) {
    return this.usersService.changeMyPassword(
      req.user?.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
