import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

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
    return !!(process.env.AWS_S3_FACE_BUCKET);
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
    // Stub: integrate @aws-sdk/client-s3 PutObjectCommand here.
    const bucket = process.env.AWS_S3_FACE_BUCKET!;
    const key = `faces/${clientId}/${subjectId}/${randomUUID()}.jpg`;
    this.logger.log(`S3 upload stub: s3://${bucket}/${key}`);
    // TODO: actual SDK call
    return `s3://${bucket}/${key}`;
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
