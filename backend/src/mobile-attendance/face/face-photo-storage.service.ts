import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Handles face photo persistence.
 * - If S3 env vars are set → upload to S3.
 * - Otherwise → save under the app uploads dir (UPLOADS_PATH, the persistent
 *   AzureFile mount in production) and return a same-origin `/uploads/...`
 *   URL. The /uploads route is Bearer-token protected, so the portal must
 *   open these via ProtectedFileService, never a bare <a href>/<img src>.
 *
 * Legacy note: photos stored before this fix used LOCAL_FACE_PHOTO_DIR
 * (default /tmp inside the container) with dead `local://` URLs — those
 * files are gone with their containers and the links cannot be recovered.
 */
@Injectable()
export class FacePhotoStorageService {
  private readonly logger = new Logger(FacePhotoStorageService.name);
  private readonly uploadsDir: string =
    process.env.UPLOADS_PATH ?? join(process.cwd(), 'uploads');

  private get useS3(): boolean {
    return !!process.env.AWS_S3_FACE_BUCKET;
  }

  private buildS3Client(): S3Client {
    return new S3Client({
      region: process.env.AWS_REGION ?? 'ap-south-1',
      ...(process.env.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      }),
    });
  }

  async uploadPhoto(
    photoB64: string,
    clientId: string,
    subjectId: string,
  ): Promise<string> {
    if (this.useS3) {
      return this.uploadToS3(photoB64, clientId, subjectId);
    }
    return this.saveLocally(photoB64, clientId, subjectId);
  }

  private async uploadToS3(
    photoB64: string,
    clientId: string,
    subjectId: string,
  ): Promise<string> {
    const bucket = process.env.AWS_S3_FACE_BUCKET!;
    const key = `faces/${clientId}/${subjectId}/${randomUUID()}.jpg`;
    const body = Buffer.from(photoB64, 'base64');

    const client = this.buildS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256',
      }),
    );

    this.logger.log(`Face photo uploaded to s3://${bucket}/${key}`);
    return `s3://${bucket}/${key}`;
  }

  /**
   * Delete a stored face photo by the URL previously returned from
   * uploadPhoto. Unknown schemes are ignored (logged) so retention sweeps
   * never crash on legacy rows.
   */
  async deletePhoto(url: string): Promise<boolean> {
    try {
      if (url.startsWith('s3://')) {
        const [, , bucket, ...keyParts] = url.split('/');
        const client = this.buildS3Client();
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: keyParts.join('/') }),
        );
        return true;
      }
      if (url.startsWith('/uploads/face-photos/')) {
        const relative = url.slice('/uploads/'.length);
        await unlink(join(this.uploadsDir, relative)).catch((err) => {
          if (err?.code !== 'ENOENT') throw err;
        });
        return true;
      }
      if (url.startsWith('local://')) {
        await unlink(url.slice('local://'.length)).catch((err) => {
          if (err?.code !== 'ENOENT') throw err;
        });
        return true;
      }
      this.logger.warn(`deletePhoto: unknown URL scheme, skipping: ${url}`);
      return false;
    } catch (err) {
      this.logger.warn(
        `deletePhoto failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async saveLocally(
    photoB64: string,
    clientId: string,
    subjectId: string,
  ): Promise<string> {
    const relativeDir = join('face-photos', clientId, subjectId);
    const dir = join(this.uploadsDir, relativeDir);
    mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    const fullPath = join(dir, filename);
    const buffer = Buffer.from(photoB64, 'base64');

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(fullPath);
      ws.write(buffer, (err) => {
        if (err) reject(err);
        else ws.end(resolve);
      });
    });

    // Same-origin web path (served by the token-protected /uploads route);
    // forward slashes regardless of host OS.
    return `/uploads/face-photos/${clientId}/${subjectId}/${filename}`;
  }
}
