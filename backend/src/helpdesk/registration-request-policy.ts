import { BadRequestException } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export function isRegistrationRequest(ticket: {
  category?: string;
  subCategory?: string | null;
}) {
  return (
    ticket.category === 'COMPLIANCE' &&
    [
      'REGISTRATION_APPLY',
      'REGISTRATION_AMEND',
      'REGISTRATION_RENEW',
      'REGISTRATION_CLOSE',
    ].includes(ticket.subCategory || '')
  );
}

/** Scope is explicit and immutable; incidental words in customer notes never classify a ticket. */
export function requestScopeSql(scope = 'ACTUAL') {
  if (!['ACTUAL', 'TEST'].includes(scope))
    throw new BadRequestException('Invalid request record scope');
  return scope === 'TEST' ? 't.is_test = TRUE' : 't.is_test = FALSE';
}

export class RegistrationActionDto {
  @IsIn(['REVIEW', 'CORRECTION', 'RESUBMIT', 'APPROVE'])
  action: 'REVIEW' | 'CORRECTION' | 'RESUBMIT' | 'APPROVE';
  @IsIn(['ACTUAL', 'TEST']) recordScope: 'ACTUAL' | 'TEST';
  @IsIn(['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED'])
  expectedStatus: string;
  @IsString() @MinLength(1) @MaxLength(20000) remarks: string;
}
