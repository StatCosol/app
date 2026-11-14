import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { from, lastValueFrom, Observable } from 'rxjs';
import { withPayrollRunLock } from './engine/payroll-period-lock';

/** Hold input changes and their nested recalculation against CCO decisions. */
@Injectable()
export class PayrollRunWriteLockInterceptor implements NestInterceptor {
  constructor(private readonly ds: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; params?: { runId?: string } }>();
    const runId = request.params?.runId;
    if (
      !runId ||
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())
    )
      return next.handle();
    return from(
      withPayrollRunLock(this.ds, runId, () => lastValueFrom(next.handle())),
    );
  }
}
