/** Native ESS can save authenticated bytes without exposing tokens or blob URLs. */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const bridge = (window as Window & {
    StatcoDownload?: { postMessage(message: string): void };
  }).StatcoDownload;
  if (bridge) {
    if (blob.size > 20 * 1024 * 1024) throw new Error('Download exceeds 20 MB');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read download'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    bridge.postMessage(JSON.stringify({ fileName, mimeType: blob.type || 'application/octet-stream', data }));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Let the browser consume the click before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
