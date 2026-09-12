import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { OcrPage } from './ocr-table';

let active = false;
export async function runLocalOcr(buffer: Buffer): Promise<OcrPage[]> {
  if (active) throw new Error('OCR busy; retry comparison shortly');
  active = true;
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          '--max-old-space-size=384',
          path.resolve(__dirname, '../../..', 'scripts/payroll-ocr-worker.cjs'),
        ],
        {
          timeout: 45000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          killSignal: 'SIGKILL',
        },
        (error, stdout) => {
          if (error)
            return reject(
              new Error('OCR could not finish within its processing limits'),
            );
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Invalid OCR result'));
          }
        },
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(buffer);
    });
  } finally {
    active = false;
  }
}
