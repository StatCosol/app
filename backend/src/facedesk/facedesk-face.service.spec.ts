import { FaceDeskFaceService } from './facedesk-face.service';
import { FaceQualityError } from '../mobile-attendance/face/face-embedding.client';

// A base64-encoded 4-dim float embedding, as the kiosk sends per frame.
const deviceEmbeddingB64 = Buffer.from(
  new Float32Array([1, 0, 0, 0]).buffer,
).toString('base64');

const frameWithPhotoAndDevice = {
  photoB64: 'photo-bytes',
  embeddingB64: deviceEmbeddingB64,
  embeddingModel: 'mobilefacenet',
  sampleType: 'FRONT' as const,
};

const makeService = (client: any) =>
  new FaceDeskFaceService(client as any);

describe('FaceDeskFaceService.resolveFrames — device-embedding fallback', () => {
  it('falls back to the device embedding when face-svc rejects the photo (no_face 422)', async () => {
    const client = {
      enabled: true,
      extractEmbedding: jest
        .fn()
        .mockRejectedValue(new Error('face-svc returned 422')),
    };
    const svc = makeService(client);

    const resolved = await svc.resolveFrames([frameWithPhotoAndDevice] as any);
    const good = svc.goodFrames(resolved);

    // The frame is kept via the on-device embedding, not dropped.
    expect(client.extractEmbedding).toHaveBeenCalled();
    expect(good).toHaveLength(1);
    expect(good[0].embedding.length).toBe(4);
    expect(good[0].model).toBe('mobilefacenet');
  });

  it('falls back on a FaceQualityError too when a device embedding is present', async () => {
    const client = {
      enabled: true,
      extractEmbedding: jest.fn().mockRejectedValue(
        new FaceQualityError({ faceScore: 0.1, reasons: ['blurry'] } as any),
      ),
    };
    const svc = makeService(client);

    const good = svc.goodFrames(
      await svc.resolveFrames([frameWithPhotoAndDevice] as any),
    );
    expect(good).toHaveLength(1);
  });

  it('records a quality-0 frame when face-svc rejects and there is NO device embedding', async () => {
    const client = {
      enabled: true,
      extractEmbedding: jest.fn().mockRejectedValue(
        new FaceQualityError({ faceScore: 0.1, reasons: ['blurry'] } as any),
      ),
    };
    const svc = makeService(client);

    const resolved = await svc.resolveFrames([
      { photoB64: 'photo-only', sampleType: 'FRONT' },
    ] as any);
    expect(resolved).toHaveLength(1);
    expect(svc.goodFrames(resolved)).toHaveLength(0);
  });

  it('prefers the face-svc embedding when it succeeds', async () => {
    const client = {
      enabled: true,
      extractEmbedding: jest.fn().mockResolvedValue({
        embedding: [0.5, 0.5, 0.5, 0.5],
        model: 'arcface',
        qualityScore: 0.9,
        quality: { faceScore: 0.9, reasons: [] },
        livenessScore: 0.8,
      }),
    };
    const svc = makeService(client);

    const good = svc.goodFrames(
      await svc.resolveFrames([frameWithPhotoAndDevice] as any),
    );
    expect(good).toHaveLength(1);
    expect(good[0].model).toBe('arcface');
    expect(good[0].qualityScore).toBe(0.9);
  });

  it('uses the device embedding directly when face-svc is disabled', async () => {
    const client = { enabled: false, extractEmbedding: jest.fn() };
    const svc = makeService(client);

    const good = svc.goodFrames(
      await svc.resolveFrames([frameWithPhotoAndDevice] as any),
    );
    expect(client.extractEmbedding).not.toHaveBeenCalled();
    expect(good).toHaveLength(1);
  });
});
