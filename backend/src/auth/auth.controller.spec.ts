import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService = {
    login: jest.fn().mockResolvedValue({ accessToken: 'tok' }),
    essLogin: jest.fn().mockResolvedValue({ accessToken: 'tok' }),
    refreshToken: jest.fn().mockResolvedValue({ accessToken: 'new-tok' }),
    logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
    requestPasswordReset: jest.fn().mockResolvedValue({ message: 'sent' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'reset' }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(), getOrThrow: jest.fn() },
        },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login should return token', async () => {
    const result = await controller.login({
      email: 'a@b.com',
      password: 'pass',
    } as any, { headers: {}, ip: '127.0.0.1' } as any);
    expect(result).toEqual({ accessToken: 'tok' });
  });

  it('refresh should return new token', async () => {
    const result = await controller.refresh({ refreshToken: 'ref' } as any);
    expect(result).toEqual({ accessToken: 'new-tok' });
  });

  it('logout should succeed', async () => {
    const result = await controller.logout({ refreshToken: 'ref' } as any);
    expect(result).toEqual({ message: 'Logged out' });
  });
});
