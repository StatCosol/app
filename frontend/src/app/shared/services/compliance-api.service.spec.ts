import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ComplianceApiService } from './compliance-api.service';

describe('Client compliance evidence request', () => {
  it('sends the notes field consumed by the client evidence controller', () => {
    const post = vi.fn((_url: string, _body: FormData) => of({}));
    const service = new ComplianceApiService({ post } as unknown as HttpClient);
    const file = new File(['evidence'], 'proof.pdf', { type: 'application/pdf' });

    service.clientUploadEvidence('42', file, 'September proof');

    expect(post).toHaveBeenCalledWith('/api/v1/client/compliance/tasks/42/evidence', expect.any(FormData));
    const body = post.mock.calls[0][1] as FormData;
    expect(body.get('notes')).toBe('September proof');
    expect(body.has('note')).toBe(false);
    expect((body.get('file') as File).name).toBe('proof.pdf');
  });
});
