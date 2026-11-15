import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CcoEscalationsComponent } from '../../pages/cco/escalations/cco-escalations.component';
import { CcoEscalationsApi } from '../../core/api/cco-escalations.api';

const row = (id = 'TEST-A', status = 'OPEN'): any => ({
  id, clientId: 'TEST-C', branchId: 'TEST-B', status, reason: 'Synthetic only',
  client: { clientName: 'Synthetic client' }, branch: { branchName: 'Synthetic branch' },
  riskScore: 83, slaOverdueCount: 2, createdAt: '2026-11-01',
});
function fixture() {
  const reads: Subject<any>[] = [], writes: Subject<any>[] = [];
  const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
  const api = { list: vi.fn((_q: any) => request(reads)), updateStatus: vi.fn((_r: any, _s: any) => request(writes)) };
  let answer!: (yes: boolean) => void;
  const dialog = { confirm: vi.fn(() => new Promise<boolean>(r => { answer = r; })) };
  const c = new CcoEscalationsComponent(api as any, dialog as any, { markForCheck: vi.fn() } as any);
  const respond = (items = [row()], total = items.length) => reads.at(-1)!.next({ items, total, page: c.page, limit: 25 });
  c.ngOnInit();
  return { c, api, reads, writes, dialog, respond, answer: (yes: boolean) => answer(yes) };
}

describe('CCO escalation contract and recovery', () => {
  it('uses the scoped paged endpoint with search and ACK status', () => {
    const get = vi.fn(), api = new CcoEscalationsApi({ get } as any);
    api.list({ page: 2, limit: 25, status: 'ACK', q: 'synthetic' });
    expect(get.mock.calls[0][0]).toMatch(/\/cco\/escalations$/);
    const p = get.mock.calls[0][1].params;
    expect(['page', 'limit', 'status', 'q'].map(k => p.get(k))).toEqual(['2', '25', 'ACK', 'synthetic']);
  });
  it('includes the record client in status writes', () => {
    const patch = vi.fn(), api = new CcoEscalationsApi({ patch } as any);
    api.updateStatus(row(), 'ACK');
    expect(patch.mock.calls[0][1]).toEqual({ clientId: 'TEST-C', status: 'ACK' });
  });
  it('keeps matching total separate from counts on the displayed page', () => {
    const f = fixture(); f.respond([row(), row('TEST-B', 'ACK'), row('TEST-C', 'CLOSED')], 53);
    expect([f.c.total, f.c.pageCount, f.c.openCount, f.c.ackCount, f.c.closedCount]).toEqual([53, 3, 1, 1, 1]);
  });
  it('loads later pages without losing the applied search', () => {
    const f = fixture(); f.c.search = '  synthetic  '; f.c.applyFilters(); f.respond([row()], 26);
    f.c.search = 'unsent draft'; f.c.changePage(2);
    expect(f.api.list.mock.lastCall?.[0]).toEqual({ page: 2, limit: 25, status: '', q: 'synthetic' });
  });
  it('resets pagination for a new status or search', () => {
    const f = fixture(); f.respond([row()], 26); f.c.changePage(2); f.respond();
    f.c.statusFilter = 'ACK'; f.c.search = 'branch'; f.c.applyFilters();
    expect(f.api.list.mock.lastCall?.[0]).toEqual({ page: 1, limit: 25, status: 'ACK', q: 'branch' });
  });
  it('ignores obsolete responses after filter switching', () => {
    const f = fixture(); f.c.statusFilter = 'ACK'; f.c.applyFilters(); f.respond([row('CURRENT', 'ACK')]);
    f.reads[0].next({ items: [row('STALE')], total: 1 });
    expect(f.c.items[0].id).toBe('CURRENT');
  });
  it('clears stale counts while loading and distinguishes failed reads from empty', () => {
    const f = fixture(); f.respond(); f.c.load();
    expect([f.c.total, f.c.items.length, f.c.loaded]).toEqual([0, 0, false]);
    f.reads.at(-1)!.error(Error('Synthetic outage'));
    expect(f.c.loadError).toBeTruthy(); expect(f.c.loaded).toBe(false);
    f.c.load(); f.respond([]); expect(f.c.loaded).toBe(true); expect(f.c.loadError).toBe('');
  });
  it('clamps a page after its last matching record is closed', () => {
    const f = fixture(); f.respond([row()], 26); f.c.changePage(2); f.respond([row()], 26);
    f.c.updateStatus(f.c.items[0], 'CLOSED'); f.writes[0].next(row('TEST-A', 'CLOSED'));
    f.respond([], 25); expect(f.api.list.mock.lastCall?.[0].page).toBe(1);
    f.respond([row('NEXT')], 25); expect(f.c.items[0].id).toBe('NEXT');
  });
  it('blocks repeated and competing actions during a save', async () => {
    const f = fixture(); f.respond(); const r = f.c.items[0];
    f.c.updateStatus(r, 'ACK'); f.c.updateStatus(r, 'CLOSED'); await f.c.closeEscalation(r);
    expect(f.writes).toHaveLength(1); expect(f.dialog.confirm).not.toHaveBeenCalled();
  });
  it('reconciles a completed action with the current filters', () => {
    const f = fixture(); f.respond(); f.c.updateStatus(f.c.items[0], 'ACK');
    f.c.statusFilter = 'ACK'; f.c.applyFilters(); f.writes[0].next(row('TEST-A', 'ACK'));
    expect(f.api.list.mock.lastCall?.[0].status).toBe('ACK');
    f.respond([row('TEST-A', 'ACK')]); expect(f.c.ackCount).toBe(1);
  });
  it('requires a fresh read after an uncertain status write', () => {
    const f = fixture(); f.respond(); const r = f.c.items[0]; f.c.updateStatus(r, 'ACK');
    f.writes[0].error(Error('Synthetic lost reply')); f.c.updateStatus(r, 'CLOSED');
    expect(f.writes).toHaveLength(1); expect(f.c.isUncertain(r.id)).toBe(true);
    f.c.load(); f.respond([row('TEST-A', 'ACK')]); expect(f.c.canAct(f.c.items[0], 'CLOSED')).toBe(true);
  });
  it('does not accept a pre-error read as confirmation', () => {
    const f = fixture(); f.respond(); f.c.updateStatus(f.c.items[0], 'ACK'); f.c.load();
    f.writes[0].error(Error('lost')); f.reads.at(-1)!.next({ items: [row()], total: 1 });
    expect(f.c.items).toEqual([]); expect(f.c.loadError).toContain('confirm'); expect(f.c.loaded).toBe(false);
  });
  for (const reason of ['closed', 'same', 'stale', 'missing-client', 'unsupported']) {
    it('guards ' + reason + ' actions', () => {
      const f = fixture(); f.respond(); const r = reason === 'stale' ? row('OTHER') : f.c.items[0];
      if (reason === 'closed') r.status = 'CLOSED';
      if (reason === 'same') r.status = 'ACK';
      if (reason === 'missing-client') r.clientId = '';
      f.c.updateStatus(r, reason === 'unsupported' ? 'IN_PROGRESS' as any : 'ACK');
      expect(f.writes).toHaveLength(0);
    });
  }
  it('honors cancelled close confirmation', async () => {
    const f = fixture(); f.respond(); const done = f.c.closeEscalation(f.c.items[0]);
    f.answer(false); await done; expect(f.writes).toHaveLength(0);
  });
  it('does not close an obsolete selection after filtering', async () => {
    const f = fixture(); f.respond(); const done = f.c.closeEscalation(f.c.items[0]);
    f.c.applyFilters(); f.respond(); f.answer(true); await done; expect(f.writes).toHaveLength(0);
  });
  it('blocks competing actions while confirmation is open and saves after confirmation', async () => {
    const f = fixture(); f.respond(); const r = f.c.items[0], done = f.c.closeEscalation(r);
    f.c.updateStatus(r, 'ACK'); await f.c.closeEscalation(r); expect(f.dialog.confirm).toHaveBeenCalledTimes(1);
    f.answer(true); await done; expect(f.api.updateStatus).toHaveBeenCalledWith(r, 'CLOSED');
  });
  it('cancels reads/writes and ignores confirmation after leaving', async () => {
    const f = fixture(); f.respond(); const done = f.c.closeEscalation(f.c.items[0]);
    f.c.ngOnDestroy(); f.answer(true); await done; expect(f.writes).toHaveLength(0);
    expect(f.reads.every(s => !s.observed)).toBe(true);
  });
});
