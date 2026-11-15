import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EscalationsComponent } from './escalations.component';
import { ClientBranchesService } from '../../core/client-branches.service';

function fixture(role = 'CLIENT') {
  const reads: Subject<any>[] = [], branches: Subject<any>[] = [], clients: Subject<any>[] = [], writes: Subject<any>[] = [];
  const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
  const api = { list: vi.fn(() => request(branches)), getEscalations: vi.fn((_p: any) => request(reads)), updateEscalation: vi.fn((_id: string, _p: any) => request(writes)) };
  const crm = { getAssignedClients: () => request(clients), getBranchesForClient: vi.fn((_id: string) => request(branches)) };
  const admin = { getAdminClients: () => request(clients), getBranchesForAdminClient: vi.fn((_id: string) => request(branches)) };
  const c: any = new (EscalationsComponent as any)(api, { getRoleCode: () => role, getBranchIds: () => [], isMasterUser: () => true }, { markForCheck: vi.fn() }, crm, admin);
  return { c, api, crm, reads, branches, clients, writes };
}
const row = (id = 'TEST-A', status = 'OPEN') => ({ id, clientId: 'TEST-C1', branchId: 'TEST-B1', reason: 'Synthetic escalation', status });
const populate = (f: ReturnType<typeof fixture>) => { f.c.load(); f.reads.at(-1)!.next({ items: [row()] }); };

describe('Escalation scope and status recovery', () => {
  it('sends client, branch and status filters to the HTTP service', () => {
    const get=vi.fn(); const api=new ClientBranchesService({get} as any);
    api.getEscalations({clientId:'TEST-C1',branchId:'TEST-B1',status:'ACK'});
    const params=get.mock.calls[0][1].params;
    expect([params.get('clientId'),params.get('branchId'),params.get('status')]).toEqual(['TEST-C1','TEST-B1','ACK']);
  });
  for (const field of ['selectedBranch', 'selectedStatus']) it('ignores obsolete reads after ' + field + ' changes', () => {
    const f = fixture(); f.c.load(); f.c[field] = field === 'selectedBranch' ? 'TEST-B2' : 'CLOSED'; f.c.load();
    f.reads[1].next({ items: [row('TEST-CURRENT')] }); f.reads[0].next({ items: [row('TEST-OLD')] }); expect(f.c.items[0].id).toBe('TEST-CURRENT');
  });
  it('clears stale rows and counts while loading', () => { const f=fixture(); populate(f); f.c.load(); expect(f.c.items).toEqual([]); expect(f.c.filtered).toEqual([]); });
  it('distinguishes unavailable history from empty results and recovers', () => { const f=fixture(); f.c.load(); f.reads[0].error(Error('offline')); expect(f.c.loadError).toBeTruthy(); expect(f.c.loaded).toBe(false); f.c.load(); f.reads[1].next({items:[]}); expect(f.c.loaded).toBe(true); expect(f.c.loadError).toBe(''); });
  it('keeps new loading state after an old read fails', () => { const f=fixture(); f.c.load(); f.c.load(); f.reads[0].error(Error('old')); expect(f.c.loading).toBe(true); expect(f.c.loadError).toBe(''); });
  it('loads CRM clients before scoped queues, and cancels previous branches', () => { const f=fixture('CRM'); f.c.ngOnInit(); expect(f.api.getEscalations).not.toHaveBeenCalled(); expect(f.api.list).not.toHaveBeenCalled(); f.clients[0].next([{id:'TEST-C1'},{id:'TEST-C2'}]); f.c.clientId='TEST-C2'; f.c.onClientChange(); f.branches[1].next([{id:'TEST-B2'}]); f.branches[0].next([{id:'TEST-B1'}]); expect(f.c.branches[0].id).toBe('TEST-B2'); expect(f.api.getEscalations.mock.lastCall?.[0].clientId).toBe('TEST-C2'); });
  it('retries branch names without resetting the selected scope or list', () => { const f=fixture(); f.c.ngOnInit(); f.c.selectedBranch='TEST-B1'; f.reads[0].next({items:[row()]}); f.branches[0].error(Error('offline')); expect(f.c.branchLoadError).toBeTruthy(); f.c.retryBranches(); f.branches[1].next([{id:'TEST-B1'}]); expect(f.c.selectedBranch).toBe('TEST-B1'); expect(f.c.items).toHaveLength(1); });
  it('does not broaden a cleared CRM client scope', () => { const f=fixture('CRM'); f.c.ngOnInit(); f.clients[0].next([{id:'TEST-C1'}]); f.c.clientId=''; f.c.onClientChange(); f.reads[0].next({items:[row()]}); expect(f.c.items).toEqual([]); expect(f.c.loaded).toBe(false); });
  it('includes the record client in a CRM update', () => { const f=fixture('CRM'); populate(f); f.c.updateStatus(f.c.items[0],'ACK'); expect(f.api.updateEscalation).toHaveBeenCalledWith('TEST-A',{status:'ACK',clientId:'TEST-C1'}); });
  it('blocks repeated and competing clicks during a save', () => { const f=fixture(); populate(f); const r=f.c.items[0]; f.c.updateStatus(r,'ACK'); f.c.updateStatus(r,'CLOSED'); expect(f.writes).toHaveLength(1); expect(f.c.isSaving(r.id)).toBe(true); });
  it('requires a fresh read after an uncertain save', () => { const f=fixture(); populate(f); const r=f.c.items[0]; f.c.updateStatus(r,'CLOSED'); f.writes[0].error(Error('lost')); expect(f.c.actionError).toBeTruthy(); f.c.updateStatus(r,'ACK'); expect(f.writes).toHaveLength(1); f.c.load(); f.reads[1].next({items:[row('TEST-A','CLOSED')]}); f.c.updateStatus(f.c.items[0],'ACK'); expect(f.writes).toHaveLength(1); });
  it('invalidates a read begun before the uncertain save response', () => { const f=fixture(); populate(f); f.c.updateStatus(f.c.items[0],'CLOSED'); f.c.selectedStatus='OPEN'; f.c.load(); f.writes[0].error(Error('lost')); f.reads[1].next({items:[row()]}); expect(f.c.items).toEqual([]); expect(f.c.loadError).toContain('confirm'); });
  it('reconciles successful writes using the current filter', () => { const f=fixture(); populate(f); f.c.updateStatus(f.c.items[0],'CLOSED'); f.c.selectedStatus='CLOSED'; f.c.load(); f.writes[0].next(row('TEST-A','CLOSED')); expect(f.api.getEscalations.mock.lastCall?.[0].status).toBe('CLOSED'); f.reads.at(-1)!.next({items:[row('TEST-A','CLOSED')]}); f.reads[1].next({items:[row()]}); expect(f.c.items[0].status).toBe('CLOSED'); });
  it('does not interrupt another branch after a failed save', () => { const f=fixture(); populate(f); f.c.selectedBranch='TEST-B1'; f.c.updateStatus(f.c.items[0],'CLOSED'); f.c.selectedBranch='TEST-B2'; f.c.load(); f.writes[0].error(Error('old')); expect(f.c.loading).toBe(true); expect(f.c.actionError).toBe(''); });
  for(const kind of ['stale','closed','same','invalid']) it('rejects '+kind+' actions', () => { const f=fixture(); populate(f); const r=kind==='stale'?row('OLD'):f.c.items[0]; if(kind==='closed')r.status='CLOSED'; if(kind==='same')r.status='ACK'; f.c.updateStatus(r,kind==='invalid'?'OPEN':'ACK'); expect(f.writes).toHaveLength(0); });
  it('cancels pending callbacks when leaving', () => { const f=fixture(); f.c.ngOnInit(); f.reads[0].next({items:[row()]}); f.c.updateStatus(f.c.items[0],'ACK'); f.c.ngOnDestroy(); expect([...f.reads,...f.branches,...f.writes].every(s=>!s.observed)).toBe(true); });
});
