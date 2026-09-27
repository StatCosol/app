import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { catchError } from 'rxjs/operators';

/** Runs after Multer, covering validation and transactional failures on NC uploads. */
@Injectable()
export class AuditNcUploadCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditNcUploadCleanupInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context
      .switchToHttp()
      .getRequest<{ file?: Express.Multer.File }>();
    return next.handle().pipe(
      catchError(async (error: unknown) => {
        const file = request.file;
        if (file?.path && file.filename) {
          const root = path.resolve(process.cwd(), 'uploads', 'audit-nc');
          const candidate = path.join(root, path.basename(file.filename));
          // Delete only this request's server-generated file inside the NC upload directory.
          if (
            path.resolve(file.path) === candidate &&
            path.dirname(candidate) === root
          ) {
            try {
              await unlink(candidate);
            } catch (cleanupError) {
              if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.error(
                  'Failed to remove a rejected audit correction upload',
                );
              }
            }
          }
        }
        throw error;
      }),
    );
  }
}
