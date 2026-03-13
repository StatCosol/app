import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

/**
 * Composite decorator: adds standard 200 / 400 / 401 / 403 / 500
 * Swagger response descriptions to any controller method.
 */
export function ApiStandardResponses() {
  return applyDecorators(
    ApiResponse({ status: 200, description: 'Success' }),
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
      status: 500,
      description: 'Internal Server Error',
      type: ApiErrorResponseDto,
    }),
  );
}
