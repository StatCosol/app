import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

/**
 * Composite decorator for POST/creation endpoints: 201 / 400 / 401 / 403 / 409 / 500
 */
export function ApiStandardCreatedResponse() {
  return applyDecorators(
    ApiResponse({ status: 201, description: 'Created' }),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Internal Server Error',
      type: ApiErrorResponseDto,
    }),
  );
}
