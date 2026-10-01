/** Blob download requests also receive JSON errors as blobs. */
export async function downloadErrorMessage(error: any, fallback: string): Promise<string> {
  let detail = error?.error;
  if (detail instanceof Blob) {
    try {
      detail = JSON.parse(await detail.text());
    } catch {
      return fallback;
    }
  }
  return typeof detail?.message === 'string' && detail.message.trim() ? detail.message : fallback;
}
