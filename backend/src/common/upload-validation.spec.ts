import { validateUploadedFile } from './upload-validation';
import { BadRequestException } from '@nestjs/common';

/**
 * validateUploadedFile() enforces an extension allow-list and (when a buffer is
 * present) that the file's magic bytes match the claimed extension — a defence
 * against disguised uploads.
 */
describe('validateUploadedFile', () => {
  it('accepts an allow-listed extension (no buffer)', () => {
    expect(() => validateUploadedFile('report.pdf')).not.toThrow();
  });

  it('rejects a disallowed extension', () => {
    expect(() => validateUploadedFile('malware.exe')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a filename with no extension', () => {
    expect(() => validateUploadedFile('README')).toThrow(BadRequestException);
  });

  it('accepts when magic bytes match the extension', () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    expect(() => validateUploadedFile('doc.pdf', pdf)).not.toThrow();
  });

  it('rejects when magic bytes contradict the extension', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG signature
    expect(() => validateUploadedFile('fake.pdf', png)).toThrow(
      /does not match/,
    );
  });

  it('honours a custom allow-list', () => {
    expect(() =>
      validateUploadedFile('logo.svg', undefined, new Set(['.svg'])),
    ).not.toThrow();
  });
});
