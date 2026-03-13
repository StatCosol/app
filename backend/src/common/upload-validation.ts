import { BadRequestException } from '@nestjs/common';

/**
 * Whitelist of allowed file extensions (lowercase, with dot).
 */
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.xls',
  '.xlsx',
  '.doc',
  '.docx',
  '.csv',
  '.txt',
]);

/**
 * Map of magic bytes → expected extension(s).
 * Used to verify file content matches the claimed extension.
 */
const MAGIC_BYTES: Array<{ bytes: number[]; exts: string[] }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], exts: ['.pdf'] }, // %PDF
  { bytes: [0x89, 0x50, 0x4e, 0x47], exts: ['.png'] }, // PNG
  { bytes: [0xff, 0xd8, 0xff], exts: ['.jpg', '.jpeg'] }, // JPEG
  {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    exts: ['.xlsx', '.docx', '.zip'], // ZIP-based (Office Open XML)
  },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], exts: ['.xls', '.doc'] }, // OLE2 (legacy Office)
];

/**
 * Validate an uploaded file's extension and (optionally) magic bytes.
 *
 * @param originalname  The original filename from the client
 * @param buffer        The file buffer (only needed for magic-byte check)
 * @param allowedExts   Optional override of allowed extensions
 */
export function validateUploadedFile(
  originalname: string,
  buffer?: Buffer,
  allowedExts?: Set<string>,
): void {
  const ext = getExtension(originalname);
  const whitelist = allowedExts ?? ALLOWED_EXTENSIONS;

  if (!whitelist.has(ext)) {
    throw new BadRequestException(
      `File extension "${ext}" is not allowed. Allowed: ${[...whitelist].join(', ')}`,
    );
  }

  // Magic-byte validation (only if a buffer is available)
  if (buffer && buffer.length >= 4) {
    const matchingMagic = MAGIC_BYTES.find((m) =>
      m.bytes.every((b, i) => buffer[i] === b),
    );

    if (matchingMagic && !matchingMagic.exts.includes(ext)) {
      throw new BadRequestException(
        `File content does not match the "${ext}" extension. ` +
          `File appears to be: ${matchingMagic.exts.join(' / ')}`,
      );
    }
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}
