import { NotFoundException } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { ReqUser } from '../access/access-scope.service';

describe('News detail visibility', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  let findOne: jest.Mock;
  let controller: NewsController;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    findOne = jest.fn();
    controller = new NewsController({ findOne } as unknown as NewsService);
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    null,
    { isActive: false, expiresAt: null },
    { isActive: true, expiresAt: new Date('2026-09-26T12:00:00Z') },
    { isActive: true, expiresAt: now },
  ])('hides unavailable news from ordinary readers: %j', async (item) => {
    findOne.mockResolvedValue(item);
    await expect(
      controller.getOne('news-id', { roleCode: 'CLIENT' } as ReqUser),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([null, new Date('2026-09-28T12:00:00Z')])(
    'returns active news with expiry %s',
    async (expiresAt) => {
      const item = { isActive: true, expiresAt };
      findOne.mockResolvedValue(item);
      expect(
        await controller.getOne('news-id', { roleCode: 'CLIENT' } as ReqUser),
      ).toBe(item);
    },
  );

  it('preserves admin preview of inactive and expired news', async () => {
    const item = { isActive: false, expiresAt: now };
    findOne.mockResolvedValue(item);
    expect(
      await controller.getOne('news-id', { roleCode: 'ADMIN' } as ReqUser),
    ).toBe(item);
  });
});
