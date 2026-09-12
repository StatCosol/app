import { ClientStructuresService } from './client-structures.service';
describe('client structure transactions', () => {
  it.each(['create', 'clone'])(
    'reads a newly saved %s through the same transaction',
    async (operation) => {
      const old = {
        id: 'old',
        clientId: 'client-a',
        name: 'Client A wages',
        code: 'A',
        version: 1,
        components: [],
        statutoryConfigs: [],
      };
      const result = { ...old, id: 'new' };
      const root = {
        findOne: jest.fn(async () => (operation === 'clone' ? old : null)),
      };
      const txRepo = { findOne: jest.fn(async () => result) };
      const manager = {
        update: jest.fn(),
        create: jest.fn((_type, value) => value),
        save: jest.fn(async () => result),
        getRepository: jest.fn(() => txRepo),
      };
      const ds = { transaction: jest.fn(async (work) => work(manager)) };
      const service = new ClientStructuresService(root as any, ds as any);
      const received =
        operation === 'create'
          ? await service.create({ ...old, effectiveFrom: '2026-09-01' } as any)
          : await service.createNextVersion('old', '2026-09-01');
      expect(received).toBe(result);
      expect(txRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'new' },
          relations: ['components', 'statutoryConfigs'],
        }),
      );
      expect(root.findOne.mock.calls).toHaveLength(
        operation === 'clone' ? 1 : 0,
      );
    },
  );
});
