import { ApiProperty } from '@nestjs/swagger';

export class ApiSuccessResponseDto<T = any> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty()
  data: T;

  @ApiProperty({ example: '2025-03-07T00:00:00.000Z' })
  timestamp: string;
}
