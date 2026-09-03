import { describe, it, expect } from 'vitest';
import { describeApiError } from './api-error.util';

describe('describeApiError', () => {
  it('joins the array NestJS ValidationPipe returns', () => {
    const err = {
      status: 400,
      error: {
        message: [
          'property matchConfidencePct should not exist',
          'property duplicatePct should not exist',
        ],
      },
    };
    expect(describeApiError(err)).toBe(
      'property matchConfidencePct should not exist; property duplicatePct should not exist',
    );
  });

  it('caps a long validation list and says how many were hidden', () => {
    const err = { status: 400, error: { message: ['a', 'b', 'c', 'd', 'e'] } };
    expect(describeApiError(err)).toBe('a; b; c (+2 more)');
  });

  it('passes a plain string message through', () => {
    expect(describeApiError({ status: 409, error: { message: 'Already enrolled' } })).toBe(
      'Already enrolled',
    );
  });

  it('handles a bare string body', () => {
    expect(describeApiError({ status: 500, error: 'Internal Server Error' })).toBe(
      'Internal Server Error',
    );
  });

  it('distinguishes a request that never landed from a server refusal', () => {
    expect(describeApiError({ status: 0, error: null })).toBe('Could not reach the server.');
  });

  it('falls back to the status when there is no usable body', () => {
    expect(describeApiError({ status: 403, error: null })).toBe('Please try again. (HTTP 403)');
  });

  it('ignores an array of blanks rather than showing empty text', () => {
    expect(describeApiError({ status: 400, error: { message: ['', '  '] } })).toBe(
      'Please try again.',
    );
  });

  it('survives junk', () => {
    expect(describeApiError(undefined)).toBe('Please try again.');
    expect(describeApiError({})).toBe('Please try again.');
  });
});
