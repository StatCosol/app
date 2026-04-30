import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { AdminApiService } from '../../core/admin-api.service';

@Component({
  selector: 'app-risk-trend',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './risk-trend.component.html',
  styleUrls: ['./risk-trend.component.scss'],
})
export class RiskTrendComponent implements OnInit {
  clients: { id: string; name: string }[] = [];
  clientId = '';
  branches: { id: string; name: string }[] = [];
  branchId = '';
  from = '';
  to = '';
  points: any[] = [];
  loading = false;
  showClientPicker = false;

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private crmApi: CrmClientsApi,
    private adminApi: AdminApiService,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    this.from = this.toISO(start);
    this.to = this.toISO(now);

    const role = (this.auth.getRoleCode() || '').toUpperCase();

    // CLIENT users: branches come from their own JWT mapping
    const mapped = this.auth.getBranchIds();
    if (role === 'CLIENT' || mapped?.length) {
      this.showClientPicker = false;
      if (mapped?.length) {
        this.branchId = mapped[0];
        this.branches = mapped.map((id) => ({ id, name: 'Branch' }));
        this.load();
        this.api.list().subscribe({
          next: (b: any[]) => {
            const nameMap = new Map(
              (b || []).map((x: any) => [
                x.id,
                x.name || x.branchName || x.title || 'Branch',
              ]),
            );
            this.branches = mapped.map((id) => ({
              id,
              name: nameMap.get(id) || 'Branch',
            }));
            this.cdr.markForCheck();
          },
        });
        return;
      }

      // CLIENT user without explicit branchIds → fall back to client/branches list
      this.api.list().subscribe({
        next: (b: any[]) => {
          this.branches = (b || []).map((x) => ({
            id: x.id,
            name: x.branchName || x.name || x.title || 'Branch',
          }));
          if (this.branches.length) {
            this.branchId = this.branches[0].id;
          }
          this.cdr.markForCheck();
          this.load();
        },
      });
      return;
    }

    // CRM / ADMIN / CCO / CEO: need a client picker, then branches per client
    this.showClientPicker = true;
    if (role === 'CRM') {
      this.crmApi.getAssignedClients().subscribe({
        next: (cs: any[]) => {
          this.clients = (cs || []).map((c) => ({
            id: c.id,
            name: c.clientName || c.name || 'Client',
          }));
          this.autoSelectFirstClient();
        },
        error: () => this.cdr.markForCheck(),
      });
    } else {
      this.adminApi.getAdminClients().subscribe({
        next: (cs: any[]) => {
          this.clients = (cs || []).map((c) => ({
            id: c.id,
            name: c.clientName || c.name || 'Client',
          }));
          this.autoSelectFirstClient();
        },
        error: () => this.cdr.markForCheck(),
      });
    }
  }

  private autoSelectFirstClient(): void {
    if (this.clients.length) {
      this.clientId = this.clients[0].id;
      this.loadBranchesForClient();
    }
    this.cdr.markForCheck();
  }

  onClientChange(): void {
    this.branchId = '';
    this.branches = [];
    this.points = [];
    this.loadBranchesForClient();
  }

  private loadBranchesForClient(): void {
    if (!this.clientId) return;
    const role = (this.auth.getRoleCode() || '').toUpperCase();
    const obs$ =
      role === 'CRM'
        ? this.crmApi.getBranchesForClient(this.clientId)
        : this.adminApi.getBranchesForAdminClient(this.clientId);
    obs$.subscribe({
      next: (bs: any[]) => {
        this.branches = (bs || []).map((b) => ({
          id: b.id,
          name: b.branchName || b.name || 'Branch',
        }));
        if (this.branches.length) {
          this.branchId = this.branches[0].id;
          this.load();
        }
        this.cdr.markForCheck();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  load(): void {
    if (!this.branchId) return;
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getRiskTrend({ branchId: this.branchId, from: this.from, to: this.to }).subscribe({
      next: (res: any) => {
        this.points = res.points || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.points = [];
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get maxScore(): number {
    return Math.max(...this.points.map((p) => p.riskScore), 0);
  }

  barHeight(score: number): number {
    const max = this.maxScore || 100;
    return (score / max) * 100;
  }

  barClass(score: number): string {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
