import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { HelpdeskService } from './helpdesk.service';
import {
  isRegistrationRequest,
  RegistrationActionDto,
} from './registration-request-policy';

export class RegistrationRequestQuery {
  @IsUUID() branchId: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsIn(['ACTUAL', 'TEST']) recordScope?: 'ACTUAL' | 'TEST';
}
export class NewRegistrationRequestDto {
  @IsUUID() branchId: string;
  @IsIn(['ACTUAL', 'TEST']) recordScope: 'ACTUAL' | 'TEST';
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  registrationType: string;
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  authority: string;
  @IsString() @MinLength(1) @MaxLength(18000) notes: string;
}

@Controller({ path: 'registration-requests', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'CRM')
export class RegistrationRequestsController {
  constructor(private readonly svc: HelpdeskService) {}

  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() q: RegistrationRequestQuery,
  ) {
    const rows = await this.svc.listTickets(user, {
      ...q,
      category: 'COMPLIANCE',
    });
    return rows.filter(isRegistrationRequest);
  }

  @Post()
  @Roles('CLIENT')
  create(@CurrentUser() user: ReqUser, @Body() dto: NewRegistrationRequestDto) {
    if (
      !dto.registrationType.trim() ||
      !dto.authority.trim() ||
      !dto.notes.trim()
    )
      throw new BadRequestException(
        'Registration type, authority and notes are required',
      );
    const isTest = dto.recordScope === 'TEST';
    return this.svc.createTicket(user, {
      category: 'COMPLIANCE',
      subCategory: 'REGISTRATION_APPLY',
      branchId: dto.branchId,
      isTest,
      description: `[REGISTRATION_REQUEST]\nAction: APPLY\nRegistration ID: NEW\nRegistration Type: ${isTest ? 'TEST ONLY — ' : ''}${dto.registrationType.trim()}\nAuthority: ${dto.authority.trim()}\nNotes: ${dto.notes.trim()}`,
    });
  }

  @Get(':id')
  async detail(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const ticket = await this.svc.getTicket(user, id);
    if (!isRegistrationRequest(ticket))
      throw new BadRequestException('Registration request not found');
    return { ticket, messages: await this.svc.getMessages(user, id) };
  }

  @Post(':id/actions')
  action(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: RegistrationActionDto,
  ) {
    return this.svc.registrationAction(user, id, dto);
  }
}
