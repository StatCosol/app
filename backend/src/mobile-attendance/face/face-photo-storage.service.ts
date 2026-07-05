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
 * - If S3 env vars are set → upload to S3 (stub — extend with @aws-sdk/client-s3).
 * - Otherwise → save to LOCAL_FACE_PHOTO_DIR (defaults to /tmp/face-photos).
 */
@Injectable()
export class FacePhotoStorageService {
  private readonly logger = new Logger(FacePhotoStorageService.name);
  private readonly localDir: string =
    process.env.LOCAL_FACE_PHOTO_DIR ?? '/tmp/face-photos';

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
    const dir = join(this.localDir, clientId, subjectId);
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

    return `local://${fullPath}`;
  }
}
