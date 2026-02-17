import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { AdminReturnsController } from '../src/returns/admin-returns.controller';
import { ReturnsService } from '../src/returns/returns.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

// Focused controller-level test to ensure delete/restore wiring and soft-delete checks

describe('AdminReturnsController (e2e) - delete/restore', () => {
  let app: INestApplication;

  const sampleId = 'return-123';
  const actorId = 'admin-1';

  const returnsServiceMock = {
    listForAdmin: jest.fn(),
    getReturnTypes: jest.fn(),
    updateStatusAsAdmin: jest.fn(),
    softDeleteAsAdmin: jest.fn().mockResolvedValue({ id: sampleId, isDeleted: true }),
    restoreAsAdmin: jest.fn().mockResolvedValue({ id: sampleId, isDeleted: false }),
  } as Partial<ReturnsService>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminReturnsController],
      providers: [{ provide: ReturnsService, useValue: returnsServiceMock }],
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
    jest.clearAllMocks();
    await app.close();
  });

  it('soft deletes a return with reason and actor', async () => {
    const reason = 'cleanup';
    await request(app.getHttpServer())
      .patch(`/admin/returns/filings/${sampleId}/delete`)
      .send({ reason })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ id: sampleId, isDeleted: true });
      });

    expect(returnsServiceMock.softDeleteAsAdmin).toHaveBeenCalledWith(
      sampleId,
      null,
      reason,
    );
  });

  it('restores a soft-deleted return', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/returns/filings/${sampleId}/restore`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ id: sampleId, isDeleted: false });
      });

    expect(returnsServiceMock.restoreAsAdmin).toHaveBeenCalledWith(sampleId);
  });

  it('bubbles not-found from restore', async () => {
    const notFound = new NotFoundException('Return not found or not deleted');
    (returnsServiceMock.restoreAsAdmin as jest.Mock).mockRejectedValueOnce(notFound);

    await request(app.getHttpServer())
      .patch(`/admin/returns/filings/${sampleId}/restore`)
      .expect(404);
  });
});
