import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollClientSettings } from '../../payroll/entities/payroll-client-settings.entity';

/**
 * Allows CLIENT master users always.
 * Allows CLIENT branch users only when allowBranchPayrollAccess
 * is enabled in payroll_client_settings for their client.
 */
@Injectable()
export class ClientPayrollToggleGuard implements CanActivate {
  constructor(
    @InjectRepository(PayrollClientSettings)
    private readonly settingsRepo: Repository<PayrollClientSettings>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: any }>();
    const user = req.user;

    if (!user || user.roleCode !== 'CLIENT' || !user.clientId) {
      throw new ForbiddenException(
        'Only client users can access this resource',
      );
    }

    // Master users always allowed
    if (user.userType === 'MASTER') {
      return true;
    }

    // Branch users — check toggle
    const row = await this.settingsRepo.findOne({
      where: { clientId: user.clientId },
    });
    const settings = row?.settings || {};

    if (settings.allowBranchPayrollAccess !== true) {
      throw new ForbiddenException(
        'Payroll access has not been enabled for branch users',
      );
    }

    return true;
  }
}
