import { promises as fs } from 'node:fs';
import { DataSource } from 'typeorm';
import { InvoiceFileInventoryService } from './invoice-file-inventory.service';

describe('Read-only invoice PDF inventory', () => {
  const query = jest.fn();
  const service = new InvoiceFileInventoryService({
    query,
  } as unknown as DataSource);
  const stat = (age = 400, file = true, link = false) => ({
    size: 120,
    mtimeMs: Date.now() - age * 86400000,
    isDirectory: () => !file,
    isFile: () => file,
    isSymbolicLink: () => link,
  });
  function directory(names: string[]) {
    jest.spyOn(fs, 'opendir').mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        for (const name of names) yield { name };
      },
    } as any);
  }
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('blocks non-administrators and invalid ages before filesystem or database access', async () => {
    const read = jest.spyOn(fs, 'lstat');
    await expect(service.preview('ACCOUNTS', 365)).rejects.toThrow(
      'Administrator',
    );
    for (const age of [0, -1, 1.5, 36501, NaN])
      await expect(service.preview('ADMIN', age)).rejects.toThrow('Age');
    expect(read).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('reports references, recent and unregistered files without reading or deleting contents', async () => {
    const read = jest.spyOn(fs, 'readFile');
    const remove = jest.spyOn(fs, 'unlink');
    jest
      .spyOn(fs, 'lstat')
      .mockResolvedValueOnce(stat(0, false) as any)
      .mockResolvedValueOnce(stat() as any)
      .mockResolvedValueOnce(stat(1) as any)
      .mockResolvedValueOnce(stat() as any)
      .mockResolvedValueOnce(stat(400, true, true) as any);
    directory([
      'referenced.pdf',
      'recent.pdf',
      'old.pdf',
      'link.pdf',
      'ignore.txt',
    ]);
    query.mockResolvedValue([{ pdf_path: '/uploads/invoices/referenced.pdf' }]);
    const result = await service.preview('ADMIN', 365);
    expect(result).toMatchObject({
      deletionEnabled: false,
      truncated: false,
      scanned: 4,
    });
    expect(result.items.map((f) => [f.name, f.status])).toEqual([
      ['link.pdf', 'BLOCKED'],
      ['old.pdf', 'UNREGISTERED'],
      ['recent.pdf', 'RECENT'],
      ['referenced.pdf', 'REFERENCED'],
    ]);
    expect(query.mock.calls[0][0]).toContain(
      'UNION SELECT pdf_path FROM invoice_deliveries',
    );
    expect(read).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('treats a missing root as an empty store', async () => {
    jest.spyOn(fs, 'lstat').mockRejectedValue({ code: 'ENOENT' });
    await expect(service.preview('ADMIN', 365)).resolves.toMatchObject({
      scanned: 0,
      truncated: false,
      deletionEnabled: false,
    });
  });

  it('marks a vanished first file as incomplete', async () => {
    jest
      .spyOn(fs, 'lstat')
      .mockResolvedValueOnce(stat(0, false) as any)
      .mockRejectedValueOnce({ code: 'ENOENT' });
    directory(['vanished.pdf']);
    await expect(service.preview('ADMIN', 365)).resolves.toMatchObject({
      scanned: 0,
      truncated: true,
    });
  });

  it('refuses a symlink root and hides filesystem error details', async () => {
    jest.spyOn(fs, 'lstat').mockResolvedValue(stat(0, false, true) as any);
    await expect(service.preview('ADMIN', 365)).rejects.toThrow(
      'No files were changed',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('bounds traversal to 1000 entries and labels partial results', async () => {
    jest
      .spyOn(fs, 'lstat')
      .mockResolvedValueOnce(stat(0, false) as any)
      .mockResolvedValue(stat() as any);
    directory(Array.from({ length: 1001 }, (_, i) => `sample-${i}.pdf`));
    await expect(service.preview('ADMIN', 365)).resolves.toMatchObject({
      scanned: 1000,
      truncated: true,
    });
  });
});
