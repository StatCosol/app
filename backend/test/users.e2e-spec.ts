import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ConfigService } from '@nestjs/config';

describe('UsersController (e2e) - /api/admin/users/list', () => {
  let app: INestApplication;

  const mockUsers = [
    {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      roleCode: 'CRM',
      isActive: true,
    },
    {
      id: 2,
      name: 'Bob',
      email: 'bob@example.com',
      roleCode: 'AUDITOR',
      isActive: true,
    },
  ];

  const usersServiceMock = {
    listUsersWithRoleCode: jest.fn().mockResolvedValue(mockUsers),
  };

  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns user list with roleCode', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users/list')
      .expect(200);
    expect(res.body).toEqual(mockUsers);
  });
});
