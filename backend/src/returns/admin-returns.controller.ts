import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReturnsService } from './returns.service';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { DeleteReturnDto } from './dto/delete-return.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Returns')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @ApiOperation({ summary: 'List' })
  @Get('filings')
  list(@Query() q: Record<string, string>) {
    return this.returns.listForAdmin(q);
  }

  @ApiOperation({ summary: 'Types' })
  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch('filings/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReturnStatusDto) {
    return this.returns.updateStatusAsAdmin(id, dto);
  }

  @ApiOperation({ summary: 'Soft Delete' })
  @Patch('filings/:id/delete')
  softDelete(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: DeleteReturnDto,
  ) {
    return this.returns.softDeleteAsAdmin(
      id,
      user?.userId ?? null,
      dto?.reason,
    );
  }

  @ApiOperation({ summary: 'Restore' })
  @Patch('filings/:id/restore')
  restore(@Param('id') id: string) {
    return this.returns.restoreAsAdmin(id);
  }
}
