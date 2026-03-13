import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @Get()
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user?.userId);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateMyProfileDto) {
    return this.usersService.updateMyProfile(req.user?.userId, dto);
  }

  @ApiOperation({ summary: 'Change current user password' })
  @Patch('password')
  changePassword(@Req() req: any, @Body() dto: ChangeMyPasswordDto) {
    return this.usersService.changeMyPassword(
      req.user?.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
