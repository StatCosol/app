// Separate process: a malformed PDF or slow OCR cannot block the API event loop.
// This worker is intentionally offline, including language-model loading.
const denyNetwork = () => {
  throw Error('Network is disabled for payroll OCR');
};
require('node:http').request = denyNetwork;
require('node:http').get = denyNetwork;
require('node:https').request = denyNetwork;
require('node:https').get = denyNetwork;
globalThis.fetch = denyNetwork;
const { PDFParse } = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const language = require('@tesseract.js-data/eng');

async function main() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw Error('File limit');
    chunks.push(chunk);
  }
  const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
  let worker;
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    if (!info.total || info.total > 5)
      throw Error('OCR supports at most five pages per document');
    for (const p of info.pages) {
      if (
        !(p.width > 0 && p.height > 0) ||
        (1800 * 1800 * p.height) / p.width > 8000000
      )
        throw Error('Page size limit');
    }
    worker = await createWorker('eng', 1, {
      langPath: language.langPath,
      cacheMethod: 'none',
      gzip: true,
      errorHandler: () => {},
    });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const pages = [];
    for (let page = 1; page <= info.total; page++) {
      const shot = await parser.getScreenshot({
        partial: [page],
        desiredWidth: 1800,
        imageDataUrl: false,
      });
      const image = shot.pages[0];
      if (!image || image.width * image.height > 8000000)
        throw Error('Page size limit');
      const { data } = await worker.recognize(
        Buffer.from(image.data),
        {},
        { text: true, tsv: true },
      );
      pages.push({
        page,
        text: data.text.slice(0, 6000),
        tsv: data.tsv.slice(0, 150000),
        confidence: data.confidence,
      });
    }
    process.stdout.write(JSON.stringify(pages));
  } finally {
    if (worker) await worker.terminate();
    await parser.destroy();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
