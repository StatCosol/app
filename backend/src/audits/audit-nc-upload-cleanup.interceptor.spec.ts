import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { access, mkdir, readdir, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import * as path from 'path';
import request from 'supertest';
import { lastValueFrom, throwError } from 'rxjs';
import { AuditNcUploadCleanupInterceptor } from './audit-nc-upload-cleanup.interceptor';
import {
  BranchAuditNcController,
  ContractorAuditNcController,
} from './audits.controller';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('Rejected audit correction disk uploads', () => {
  let app: INestApplication;
  const folder = path.resolve(process.cwd(), 'uploads', 'audit-nc');
  const ownedFiles = new Set<string>();
  const uploadCorrectedFile = jest.fn();
  const ncId = randomUUID();
  beforeAll(async () => {
    await mkdir(folder, { recursive: true });
    const module = await Test.createTestingModule({
      controllers: [ContractorAuditNcController, BranchAuditNcController],
      providers: [
        { provide: AuditsService, useValue: { uploadCorrectedFile } },
        AuditNcUploadCleanupInterceptor,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: 'sample-user',
            roleCode: req.url.includes('/branch/') ? 'CLIENT' : 'CONTRACTOR',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    uploadCorrectedFile.mockReset();
    for (const filename of ownedFiles) {
      await unlink(filename).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    ownedFiles.clear();
  });
  afterAll(async () => {
    await app?.close();
  });
  const send = (role: string, id: string = ncId) =>
    request(app.getHttpServer())
      .post(`/api/v1/${role}/audit-non-compliances/${id}/upload`)
      .attach('file', Buffer.from('%PDF-1.4\nfictional correction'), {
        filename: 'proof.pdf',
        contentType: 'application/pdf',
      });

  describe.each(['contractor', 'branch'])('%s endpoint', (role) => {
    it.each([400, 403, 404, 500])(
      'removes saved files after a %s service failure',
      async (status) => {
        let saved = '';
        uploadCorrectedFile.mockImplementation(async (_user, _id, file) => {
          saved = file.path;
          ownedFiles.add(saved);
          await access(saved);
          if (status === 400)
            throw new BadRequestException('NC is not awaiting upload');
          if (status === 403) throw new ForbiddenException('Not your NC');
          if (status === 404) throw new NotFoundException('Missing NC');
          throw new Error('Transaction failed');
        });
        await send(role).expect(status);
        expect(saved).toBeTruthy();
        await expect(access(saved)).rejects.toMatchObject({ code: 'ENOENT' });
      },
    );

    it('cleans files even when UUID validation rejects before the controller', async () => {
      const before = await readdir(folder);
      await send(role, 'invalid').expect(400);
      expect(uploadCorrectedFile).not.toHaveBeenCalled();
      expect(await readdir(folder)).toEqual(before);
    });

    it('retains the accepted file and deletes only the losing duplicate', async () => {
      let accepted = '',
        rejected = '';
      uploadCorrectedFile.mockImplementation(async (_user, _id, file) => {
        ownedFiles.add(file.path);
        if (!accepted) {
          accepted = file.path;
          return { status: 'REUPLOADED' };
        }
        rejected = file.path;
        throw new BadRequestException('NC is not awaiting upload');
      });
      const results = await Promise.all([send(role), send(role)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      await expect(access(accepted)).resolves.toBeUndefined();
      await expect(access(rejected)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('never deletes paths outside the audit-NC upload directory', async () => {
    const outside = path.resolve(
      process.cwd(),
      'uploads',
      `sample-${randomUUID()}.pdf`,
    );
    await writeFile(outside, 'fictional test');
    ownedFiles.add(outside);
    const error = new BadRequestException('Rejected');
    const interceptor = new AuditNcUploadCleanupInterceptor();
    const result = interceptor.intercept(
      {
        switchToHttp: () => ({
          getRequest: () => ({
            file: { path: outside, filename: path.basename(outside) },
          }),
        }),
      } as any,
      { handle: () => throwError(() => error) },
    );
    await expect(lastValueFrom(result)).rejects.toBe(error);
    await expect(access(outside)).resolves.toBeUndefined();
  });
});
