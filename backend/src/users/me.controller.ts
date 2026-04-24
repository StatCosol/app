import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @Get()
  getMe(@CurrentUser() user: ReqUser) {
    return this.usersService.getMe(user?.userId);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @Patch('profile')
  updateProfile(@CurrentUser() user: ReqUser, @Body() dto: UpdateMyProfileDto) {
    return this.usersService.updateMyProfile(user?.userId, dto);
  }

  @ApiOperation({ summary: 'Change current user password' })
  @Patch('password')
  changePassword(
    @CurrentUser() user: ReqUser,
    @Body() dto: ChangeMyPasswordDto,
  ) {
    return this.usersService.changeMyPassword(
      user?.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
