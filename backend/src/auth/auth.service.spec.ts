import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';

jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

describe('AuthService.login', () => {
  let service: AuthService;
  let usersRepo: Repository<UserEntity> & { __qb?: any };

  beforeEach(async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
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
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    (usersRepo as any).__qb = qb;
  });

  const buildUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: 'user-1',
    roleId: 'role-1',
    role: 'ADMIN',
    userCode: 'U1',
    name: 'Test User',
    email: 'test@example.com',
    mobile: null,
    passwordHash: 'hash',
    isActive: true,
    userType: null,
    clientId: null,
    client: undefined,
    deletedAt: null,
    ownerCcoId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branches: [],
    ...overrides,
  });

  it('rejects inactive users', async () => {
    usersRepo.__qb.getOne.mockResolvedValue(buildUser({ isActive: false }));

    await expect(
      service.login({ email: 'test@example.com', password: 'x' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects soft-deleted users', async () => {
    usersRepo.__qb.getOne.mockResolvedValue(
      buildUser({ deletedAt: new Date() }),
    );

    await expect(
      service.login({ email: 'test@example.com', password: 'x' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
