import { GlobalExceptionFilter } from './http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/test', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle HttpException', () => {
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        method: 'GET',
      }),
    );
  });

  it('should handle QueryFailedError with code 23505', () => {
    const exception = new QueryFailedError('', [], {
      code: '23505',
      message: 'duplicate',
    } as any);
    filter.catch(exception, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'A record with the same key already exists.',
      }),
    );
  });

  it('should handle QueryFailedError with code 23502', () => {
    const exception = new QueryFailedError('', [], {
      code: '23502',
      message: 'not null',
    } as any);
    filter.catch(exception, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'A required field is missing.',
      }),
    );
  });

  it('should handle unknown errors', () => {
    filter.catch(new Error('unknown'), mockHost);
    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Internal server error',
      }),
    );
  });
});
