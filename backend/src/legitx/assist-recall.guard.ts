import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/** Assist is recalled until an explicitly approved release restores it. */
@Injectable()
export class AssistRecallGuard implements CanActivate {
  canActivate(): never {
    throw new NotFoundException();
  }
}
