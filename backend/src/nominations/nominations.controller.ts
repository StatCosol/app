import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NominationsService } from './nominations.service';
import { SaveNominationDto } from './dto/save-nomination.dto';
import { GenerateFormDto } from './dto/generate-form.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Nominations')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/nominations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class NominationsController {
  constructor(private readonly service: NominationsService) {}

  @ApiOperation({ summary: 'Save' })
  @Post('save')
  save(@Req() req: any, @Body() dto: SaveNominationDto) {
    return this.service.saveNomination(req.user, dto);
  }

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(
    @Req() req: any,
    @Query('employeeId') employeeId: string,
    @Query('type') type: string,
  ) {
    return this.service.getNomination(req.user, employeeId, type);
  }

  @ApiOperation({ summary: 'List All' })
  @Get('all')
  listAll(@Req() req: any, @Query('employeeId') employeeId: string) {
    return this.service.listNominations(req.user, employeeId);
  }

  @ApiOperation({ summary: 'List Forms' })
  @Get('forms')
  listForms(@Req() req: any, @Query('employeeId') employeeId: string) {
    return this.service.listForms(req.user, employeeId);
  }

  @ApiOperation({ summary: 'Generate' })
  @Post('generate')
  generate(@Req() req: any, @Body() dto: GenerateFormDto) {
    return this.service.generateForm(req.user, dto);
  }
}
