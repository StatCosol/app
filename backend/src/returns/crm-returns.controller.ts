import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReturnsService } from './returns.service';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@Controller({ path: 'crm/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('filings')
  list(@Req() req: any, @Query() q: any) {
    return this.returns.listForCrm(req.user, q);
  }

  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @Patch('filings/:id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(req.user, id, dto);
  }
}
