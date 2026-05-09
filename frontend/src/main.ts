import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

const CHUNK_RECOVERY_KEY = 'statco:chunk-recovery-ts';

function isChunkLoadError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return (
    message.includes('loading chunk') ||
    message.includes('chunkloaderror') ||
    message.includes('failed to fetch dynamically imported module')
  );
}

function recoverFromChunkError(): void {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || '0');

    // Avoid reload loops if a different runtime error occurs.
    if (now - last < 10000) {
      return;
    }

    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

window.addEventListener('error', (event: ErrorEvent) => {
  if (isChunkLoadError(event.error || event.message)) {
    recoverFromChunkError();
  }
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    recoverFromChunkError();
  }
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
