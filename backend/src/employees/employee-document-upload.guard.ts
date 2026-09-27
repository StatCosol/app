import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { EmployeeDocumentService } from './employee-document.service';

@Injectable()
export class EmployeeDocumentUploadGuard implements CanActivate {
  constructor(private readonly documents: EmployeeDocumentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const employeeId = request.params?.employeeId;
    if (!isUUID(employeeId))
      throw new BadRequestException('Invalid employee id');
    // Guards run before Multer writes any uploaded document to disk.
    await this.documents.assertCanAccessEmployee(employeeId, request.user);
    return true;
  }
}
