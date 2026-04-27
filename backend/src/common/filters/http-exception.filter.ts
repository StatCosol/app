import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Global exception filter that standardises every error response to:
 * { statusCode, message, error, path, timestamp }
 *
 * Handles:
 *  - HttpException (NestJS validation, guards, manual throws)
 *  - QueryFailedError (TypeORM / Postgres constraint violations)
 *  - Unknown runtime errors (500)
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = HttpStatus[status] ?? 'Error';
      } else {
        const obj = body as Record<string, any>;
        message = obj.message ?? exception.message;
        error = obj.error ?? HttpStatus[status] ?? 'Error';
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.CONFLICT;
      error = 'Database Error';
      const pg = exception.driverError as Record<string, unknown>;
      // Unique-violation (23505)
      if (pg?.code === '23505') {
        // Try to extract the duplicate field name from the PostgreSQL detail string
        // e.g. 'Key (email)=(foo@bar.com) already exists.'
        const detail = typeof pg?.detail === 'string' ? pg.detail : '';
        const fieldMatch = detail.match(/Key \(([^)]+)\)=/);
        const fieldName = fieldMatch ? fieldMatch[1] : null;
        if (fieldName === 'email') {
          message = 'Email already in use. Please use a different email address.';
        } else if (fieldName === 'client_code' || fieldName === 'clientCode') {
          message = 'Client code already exists. Please use a unique code.';
        } else if (fieldName) {
          message = `A record with the same ${fieldName} already exists.`;
        } else {
          message = 'A record with the same key already exists.';
        }
      } else if (pg?.code === '23503') {
        message = 'Cannot complete because related records exist.';
      } else if (pg?.code === '23502') {
        message = 'A required field is missing.';
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';
      } else {
        message = 'A database error occurred.';
      }
      const pgCode =
        typeof pg?.code === 'string' || typeof pg?.code === 'number'
          ? String(pg.code)
          : 'unknown';
      this.logger.error(
        `QueryFailedError [${pgCode}]: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'Internal server error';
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error('Unknown error', String(exception));
      }
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
      path: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }
}
