import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Phase 3c: face-evidence storage.
 *
 * Captures the raw selfie that backed an enrollment or a successful punch
 * so admins can later audit "is this really the same person?" without
 * having to trust only the embedding vector.
 *
 * Three modes via env `FACE_PHOTO_AUDIT`:
 *   - `disabled` (default): never persists the photo, returns null.
 *     Existing behaviour — keeps biometric data minimal.
 *   - `local`: writes to `<root>/<clientId>/<yyyy-mm-dd>/<empCode>-<ts>.jpg`
 *     under `FACE_PHOTO_AUDIT_DIR` (default `backend/uploads/face-evidence`).
 *     Suitable for on-prem deployments and pre-production testing.
 *   - `azure-blob`: NOT WIRED YET — requires `@azure/storage-blob` and a
 *     SAS connection string in `FACE_PHOTO_AUDIT_BLOB_CONN`. Throws on
 *     selection so we fail loud instead of silently dropping evidence.
 *
 * MUST only be enabled with explicit user consent + a privacy notice; raw
 * selfies are sensitive biometric data.
 */
@Injectable()
export class FacePhotoStorage {
  private readonly logger = new Logger(FacePhotoStorage.name);
  private readonly mode: 'disabled' | 'local' | 'azure-blob';
  private readonly rootDir: string;

  constructor() {
    const raw = (process.env.FACE_PHOTO_AUDIT || 'disabled').toLowerCase();
    this.mode =
      raw === 'local' || raw === 'azure-blob' || raw === 'disabled'
        ? raw
        : 'disabled';
    this.rootDir =
      process.env.FACE_PHOTO_AUDIT_DIR ||
      path.resolve(process.cwd(), 'uploads', 'face-evidence');
    if (this.mode !== 'disabled') {
      this.logger.log(
        `FacePhotoStorage active: mode=${this.mode} root=${this.rootDir}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.mode !== 'disabled';
  }

  /**
   * Persist the photo and return a URL/path that the caller stores in
   * face_enrollments.photo_url or biometric_punches.photo_url. Returns null
   * when storage is disabled or the input is missing/empty. Never throws —
   * audit storage failures must not break the punch flow.
   */
  async put(input: {
    clientId: string;
    employeeCode: string;
    purpose: 'enroll' | 'punch';
    timestamp: Date;
    photoB64: string | null | undefined;
  }): Promise<string | null> {
    if (this.mode === 'disabled') return null;
    if (!input.photoB64) return null;
    const buf = this.decode(input.photoB64);
    if (!buf || buf.length === 0) return null;

    try {
      if (this.mode === 'local') {
        return await this.putLocal(input, buf);
      }
      if (this.mode === 'azure-blob') {
        throw new Error(
          'FACE_PHOTO_AUDIT=azure-blob requires @azure/storage-blob; install it and wire FACE_PHOTO_AUDIT_BLOB_CONN before enabling.',
        );
      }
    } catch (e: any) {
      this.logger.warn(
        `FacePhotoStorage.put failed (${this.mode}): ${e?.message ?? e}`,
      );
    }
    return null;
  }

  private async putLocal(
    input: {
      clientId: string;
      employeeCode: string;
      purpose: 'enroll' | 'punch';
      timestamp: Date;
    },
    buf: Buffer,
  ): Promise<string> {
    const ymd = input.timestamp.toISOString().slice(0, 10);
    const ts = input.timestamp.getTime();
    const safeEmp = input.employeeCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(
      this.rootDir,
      input.clientId,
      input.purpose,
      ymd,
    );
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${safeEmp}-${ts}.jpg`);
    await fs.writeFile(file, buf);
    // Path stored is relative to backend root so deployments can move the
    // root dir without invalidating existing URLs.
    return path
      .relative(path.resolve(process.cwd()), file)
      .split(path.sep)
      .join('/');
  }

  private decode(b64: string): Buffer | null {
    try {
      const cleaned = b64.includes(',') ? b64.split(',').pop()! : b64;
      return Buffer.from(cleaned, 'base64');
    } catch {
      return null;
    }
  }
}
