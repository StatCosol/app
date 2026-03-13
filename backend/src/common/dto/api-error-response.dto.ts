import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: '/api/v1/users' })
  path: string;

  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ example: '2025-03-07T00:00:00.000Z' })
  timestamp: string;
}
