import { UnauthorizedException } from '@nestjs/common';
import { assertEsslSource } from './essl-source-policy';
import { EsslService } from './essl.service';
import { EsslIclockController } from './essl-iclock.controller';

describe('eSSL source network policy', () => {
  const config = JSON.stringify({
    'TEST-SERIAL': ['192.0.2.10', '2001:db8::10'],
  });
  const original = process.env.ESSL_DEVICE_IP_ALLOWLIST;
  beforeEach(() => {
    process.env.ESSL_DEVICE_IP_ALLOWLIST = config;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ESSL_DEVICE_IP_ALLOWLIST;
    else process.env.ESSL_DEVICE_IP_ALLOWLIST = original;
  });

  it.each([
    '192.0.2.10',
    '::ffff:192.0.2.10',
    '2001:db8::10',
    '2001:0db8:0:0:0:0:0:0010',
  ])('accepts approved address %s', (ip) => {
    expect(() => assertEsslSource('TEST-SERIAL', ip, config)).not.toThrow();
  });
  it.each([
    '192.0.2.11',
    '2001:db8::11',
    '192.0.2.10, 192.0.2.11',
    '',
    undefined,
  ])('rejects an unapproved or forged address %s', (ip) => {
    expect(() => assertEsslSource('TEST-SERIAL', ip, config)).toThrow(
      UnauthorizedException,
    );
  });
  it.each([
    '',
    '{}',
    '{',
    'null',
    '[]',
    '{"TEST-SERIAL":[]}',
    '{"TEST-SERIAL":["0.0.0.0/0"]}',
    '{"TEST-SERIAL":["192.0.2.10","not-an-ip"]}',
  ])('fails closed for missing or invalid policy %s', (policy) => {
    expect(() => assertEsslSource('TEST-SERIAL', '192.0.2.10', policy)).toThrow(
      UnauthorizedException,
    );
  });
  it('does not allow another serial to reuse an approved source', () => {
    expect(() =>
      assertEsslSource('OTHER-SERIAL', '192.0.2.10', config),
    ).toThrow(UnauthorizedException);
  });

  function service(enabled = true) {
    const qb: any = { execute: jest.fn(async () => ({})) };
    for (const key of ['update', 'set', 'where'])
      qb[key] = jest.fn().mockReturnValue(qb);
    const repo = {
      findOne: jest.fn(async () => ({
        id: 'test-device',
        serialNumber: 'TEST-SERIAL',
        clientId: 'test-client',
        branchId: 'test-branch',
        enabled,
        meta: null,
      })),
      createQueryBuilder: jest.fn(() => qb),
    };
    const biometric = {
      ingest: jest.fn(async () => ({
        inserted: 1,
        duplicates: 0,
        unknownEmployees: [],
        ambiguousEmployees: [],
      })),
    };
    return {
      svc: new EsslService(repo as any, biometric as any),
      repo,
      biometric,
      qb,
    };
  }
  it.each(['handshake', 'touch', 'ingestAttlog'])(
    'rejects %s before database access or attendance writes',
    async (method) => {
      const { svc, repo, biometric } = service();
      const args =
        method === 'ingestAttlog'
          ? ['TEST-SERIAL', 'TEST\t2026-11-27 09:00:00\t0', '192.0.2.11']
          : ['TEST-SERIAL', '192.0.2.11'];
      await expect(svc[method](...args)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(biometric.ingest).not.toHaveBeenCalled();
    },
  );
  it('still rejects a disabled registered device from an approved IP', async () => {
    const { svc, biometric, qb } = service(false);
    await expect(
      svc.ingestAttlog(
        'TEST-SERIAL',
        'TEST\t2026-11-27 09:00:00\t0',
        '192.0.2.10',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(biometric.ingest).not.toHaveBeenCalled();
    expect(qb.execute).not.toHaveBeenCalled();
  });
  it('preserves punch parsing and tenant scope for an approved device', async () => {
    const { svc, biometric } = service();
    await expect(
      svc.ingestAttlog(
        'TEST-SERIAL',
        'TEST\t2026-11-27 09:00:00\t0',
        '192.0.2.10',
      ),
    ).resolves.toBe(1);
    expect(biometric.ingest).toHaveBeenCalledWith(
      'test-client',
      [
        expect.objectContaining({
          employeeCode: 'TEST',
          punchTime: '2026-11-27T03:30:00.000Z',
          branchId: 'test-branch',
        }),
      ],
      true,
      undefined,
      expect.objectContaining({ id: 'test-device' }),
    );
  });
  it('uses the trusted-proxy resolved IP, not a caller-supplied forwarding header', async () => {
    const svc = {
      handshake: jest.fn(),
      touch: jest.fn(),
      ingestAttlog: jest.fn(async () => 1),
    };
    const controller = new EsslIclockController(svc as any);
    const req = {
      ip: '192.0.2.11',
      headers: { 'x-forwarded-for': '192.0.2.10' },
    };
    await controller.handshake('TEST-SERIAL', req);
    await controller.getRequest('TEST-SERIAL', req);
    await controller.deviceCmd('TEST-SERIAL', req);
    await controller.pushData('TEST-SERIAL', 'ATTLOG', '1', 'TEST', req);
    await controller.pushData('TEST-SERIAL', 'OPERLOG', '1', 'TEST', req);
    expect(svc.handshake).toHaveBeenCalledWith('TEST-SERIAL', '192.0.2.11');
    expect(svc.touch).toHaveBeenCalledTimes(3);
    expect(svc.touch).toHaveBeenCalledWith('TEST-SERIAL', '192.0.2.11');
    expect(svc.ingestAttlog).toHaveBeenCalledWith(
      'TEST-SERIAL',
      'TEST',
      '192.0.2.11',
    );
  });
});
