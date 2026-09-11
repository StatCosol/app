// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './download-blob';

describe('ESS authenticated downloads', () => {
  afterEach(() => {
    delete (window as any).StatcoDownload;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('passes file bytes to the native bridge without a blob URL or token', async () => {
    const postMessage = vi.fn();
    (window as any).StatcoDownload = { postMessage };
    await downloadBlob(new Blob(['private payslip'], { type: 'application/pdf' }), 'payslip.pdf');
    const message = JSON.parse(postMessage.mock.calls[0][0]);
    expect(message.fileName).toBe('payslip.pdf');
    expect(message.mimeType).toBe('application/pdf');
    expect(atob(message.data)).toBe('private payslip');
    expect(Object.keys(message).sort()).toEqual(['data', 'fileName', 'mimeType']);
  });

  it('rejects oversized bridge transfers before reading the blob', async () => {
    const postMessage = vi.fn();
    (window as any).StatcoDownload = { postMessage };
    await expect(downloadBlob({ size: 21 * 1024 * 1024 } as Blob, 'large.pdf')).rejects.toThrow('20 MB');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('preserves browser downloads when the installed APK has no bridge', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue('blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadBlob(new Blob(['data']), 'document.pdf');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
