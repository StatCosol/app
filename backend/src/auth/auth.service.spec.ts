import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { EmailService } from '../email/email.service';

jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

describe('AuthService.login', () => {
  let service: AuthService;
  let usersRepo: Repository<UserEntity> & { __qb?: any };

  beforeEach(async () => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };

    usersRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: { getRoleById: jest.fn() } },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: EmailService, useValue: { sendMail: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    (usersRepo as any).__qb = qb;
  });

  const buildRawUser = (overrides: Record<string, any> = {}) => ({
    u_id: 'user-1',
    u_role_id: 'role-1',
    u_name: 'Test User',
    u_email: 'test@example.com',
    u_mobile: null,
    u_password_hash: 'hash',
    u_is_active: true,
    u_client_id: null,
    u_deleted_at: null,
    c_client_code: null,
    c_client_name: null,
    ...overrides,
  });

  it('rejects inactive users', async () => {
    usersRepo.__qb.getRawOne.mockResolvedValue(
      buildRawUser({ u_is_active: false }),
    );

    await expect(
      service.login({ email: 'test@example.com', password: 'x' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects soft-deleted users', async () => {
    usersRepo.__qb.getRawOne.mockResolvedValue(
      buildRawUser({ u_deleted_at: new Date().toISOString() }),
    );

    await expect(
      service.login({ email: 'test@example.com', password: 'x' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
