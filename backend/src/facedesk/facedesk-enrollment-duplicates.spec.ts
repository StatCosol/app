import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';

function unitVectors(): { a: Float32Array; b: Float32Array; c: Float32Array } {
  const a = new Float32Array([1, 0, 0, 0]);
  const b = new Float32Array([0.99, 0.14, 0, 0]); // ~0.99 cosine with a
  const c = new Float32Array([0, 1, 0, 0]); // orthogonal
  return { a, b, c };
}

describe('FaceDeskEnrollmentService.findDuplicate', () => {
  function make(rows: Array<Record<string, unknown>>) {
    const faceService = {
      cosine: (x: Float32Array, y: Float32Array) => {
        let dot = 0;
        let nx = 0;
        let ny = 0;
        for (let i = 0; i < x.length; i++) {
          dot += x[i] * y[i];
          nx += x[i] * x[i];
          ny += y[i] * y[i];
        }
        return dot / (Math.sqrt(nx) * Math.sqrt(ny));
      },
    };
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const service = new FaceDeskEnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      faceService as any,
      {} as any,
      { enabled: false } as any,
      {} as any,
      dataSource as any,
    );
    return service;
  }

  it('flags a clear duplicate above threshold with sufficient margin', async () => {
    const { a, c } = unitVectors();
    const service = make([
      {
        employee_id: 'emp-other',
        face_template: Buffer.from(a.buffer),
        sample_embedding: null,
      },
      {
        employee_id: 'emp-far',
        face_template: Buffer.from(c.buffer),
        sample_embedding: null,
      },
    ]);
    const hit = await service.findDuplicate(
      'client-1',
      a,
      'emp-new',
      0.8,
      0.05,
    );
    expect(hit?.matchedEmployeeId).toBe('emp-other');
    expect(hit?.source).toBe('cosine');
  });

  it('does not flag when best match is ambiguous (low margin)', async () => {
    const { a, b } = unitVectors();
    const service = make([
      {
        employee_id: 'emp-a',
        face_template: Buffer.from(a.buffer),
        sample_embedding: null,
      },
      {
        employee_id: 'emp-b',
        face_template: Buffer.from(b.buffer),
        sample_embedding: null,
      },
    ]);
    const hit = await service.findDuplicate(
      'client-1',
      a,
      'emp-new',
      0.5,
      0.2,
    );
    expect(hit).toBeNull();
  });
});
