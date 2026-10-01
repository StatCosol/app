import { BadRequestException } from '@nestjs/common';

/** A valid preparation request blocked by the selected form's applicability. */
export class RegisterIneligibleException extends BadRequestException {}
