import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  FormInputComponent,
  LoadingSpinnerComponent,
  ModalComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import {
  BiometricDevice,
  BiometricPunch,
  ClientBiometricService,
} from './client-biometric.service';

interface BranchOption { id: string; name: string }

@Component({
  selector: 'app-client-biometric',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    FormInputComponent,
    ModalComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Biometric Devices"
        description="Connect eSSL / ZKTeco machines to push attendance straight into payroll."
        icon="device">
      </ui-page-header>

      <!-- Tabs -->
      <div class="tab-bar">
        <button class="tab-btn" [class.active]="tab === 'devices'" (click)="switchTab('devices')">Devices</button>
        <button class="tab-btn" [class.active]="tab === 'punches'" (click)="switchTab('punches')">Punch Feed</button>
        <button class="tab-btn" [class.active]="tab === 'setup'" (click)="switchTab('setup')">Setup Guide</button>
      </div>

      <!-- ────── DEVICES TAB ────── -->
      <ng-container *ngIf="tab === 'devices'">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-gray-500">{{ devices.length }} device(s) registered</span>
          <div class="flex gap-2">
            <ui-button variant="secondary" (clicked)="reconcile()" [loading]="reconciling">Reconcile Unknown</ui-button>
            <ui-button variant="primary" (clicked)="openAdd()">+ Add Device</ui-button>
          </div>
        </div>

        <ui-loading-spinner *ngIf="loadingDevices" text="Loading devices..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingDevices && devices.length === 0"
          title="No devices yet"
          description="Click + Add Device to register your first eSSL / ZKTeco machine.">
        </ui-empty-state>

        <div *ngIf="!loadingDevices && devices.length > 0"
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Label</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Serial Number</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Vendor / Model</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Last Seen</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Punches</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of devices" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-900 font-medium">{{ d.label || '—' }}</td>
                <td class="px-4 py-3 font-mono text-gray-700">{{ d.serialNumber }}</td>
                <td class="px-4 py-3 text-gray-700">{{ d.vendor }}{{ d.model ? ' · ' + d.model : '' }}</td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(d.branchId) }}</td>
                <td class="px-4 py-3 text-gray-700">{{ d.lastSeenAt ? (d.lastSeenAt | date: 'dd MMM, HH:mm') : 'Never' }}</td>
                <td class="px-4 py-3 text-right text-gray-900">{{ d.lastPushCount }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                    [class.bg-green-100]="d.enabled" [class.text-green-700]="d.enabled"
                    [class.bg-gray-100]="!d.enabled" [class.text-gray-500]="!d.enabled">
                    {{ d.enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button class="text-xs text-blue-600 hover:underline mr-3" (click)="toggleEnabled(d)">
                    {{ d.enabled ? 'Disable' : 'Enable' }}
                  </button>
                  <button class="text-xs text-blue-600 hover:underline mr-3" (click)="openRotate(d)">Rotate Token</button>
                  <button class="text-xs text-red-600 hover:underline" (click)="remove(d)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <!-- ────── PUNCH FEED TAB ────── -->
      <ng-container *ngIf="tab === 'punches'">
        <div class="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input autocomplete="off" id="cmd-from-date" name="fromDate" type="date" class="ui-input" [(ngModel)]="punchFrom">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input autocomplete="off" id="cmd-to-date" name="toDate" type="date" class="ui-input" [(ngModel)]="punchTo">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
            <select class="ui-input" [(ngModel)]="punchBranchId">
              <option [ngValue]="''">All branches</option>
              <option *ngFor="let b of branches" [ngValue]="b.id">{{ b.name }}</option>
            </select>
          </div>
          <ui-button variant="primary" (clicked)="loadPunches()" [loading]="loadingPunches">Refresh</ui-button>
          <ui-button variant="secondary" (clicked)="reprocess()" [loading]="reprocessing">Reprocess Range</ui-button>
        </div>

        <ui-loading-spinner *ngIf="loadingPunches" text="Loading punches..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingPunches && punches.length === 0"
          title="No punches in range"
          description="Try widening the date range or checking that the device is online and registered.">
        </ui-empty-state>

        <div *ngIf="!loadingPunches && punches.length > 0"
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Time</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Employee Code</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Device (SN)</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Direction</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Linked</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Processed</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of punches" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-900">{{ p.punchTime | date: 'dd MMM, HH:mm:ss' }}</td>
                <td class="px-4 py-3 font-mono text-gray-700">{{ p.employeeCode }}</td>
                <td class="px-4 py-3 font-mono text-gray-500 text-xs">{{ p.deviceId || '—' }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                    [class.bg-blue-100]="p.direction === 'IN'"
                    [class.text-blue-700]="p.direction === 'IN'"
                    [class.bg-orange-100]="p.direction === 'OUT'"
                    [class.text-orange-700]="p.direction === 'OUT'"
                    [class.bg-gray-100]="p.direction === 'AUTO'"
                    [class.text-gray-700]="p.direction === 'AUTO'">
                    {{ p.direction }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span *ngIf="p.employeeId" class="text-green-600">✓</span>
                  <span *ngIf="!p.employeeId" class="text-red-600 text-xs">Unknown</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span *ngIf="p.processedAt" class="text-green-600">✓</span>
                  <span *ngIf="!p.processedAt" class="text-gray-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <!-- ────── SETUP GUIDE TAB ────── -->
      <ng-container *ngIf="tab === 'setup'">
        <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6 text-sm leading-6 text-gray-700">

          <section>
            <h3 class="text-base font-semibold text-gray-900 mb-2">1. Register the device here</h3>
            <p>Go to the <b>Devices</b> tab → click <b>+ Add Device</b>. Type the serial number printed on the back of your eSSL/ZKTeco machine, pick the branch, save.</p>
          </section>

          <section>
            <h3 class="text-base font-semibold text-gray-900 mb-2">2. Configure the machine (one time)</h3>
            <p>On the device: <b>Menu → Comm → Cloud Server Setting</b> (label varies by model). Enter:</p>
            <table class="mt-2 text-sm border border-gray-200 rounded">
              <tbody>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50 w-1/3">Server Address</td><td class="px-3 py-1.5 font-mono">{{ pushHost }}</td></tr>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50">Server Port</td><td class="px-3 py-1.5 font-mono">443</td></tr>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50">HTTPS / SSL</td><td class="px-3 py-1.5">Enable</td></tr>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50">Server Mode</td><td class="px-3 py-1.5">ADMS (or "HTTP" / "Cloud")</td></tr>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50">Enable Domain Name</td><td class="px-3 py-1.5">Yes</td></tr>
                <tr class="border-b"><td class="px-3 py-1.5 font-medium bg-gray-50">Realtime Upload</td><td class="px-3 py-1.5">Yes</td></tr>
                <tr><td class="px-3 py-1.5 font-medium bg-gray-50">Heartbeat</td><td class="px-3 py-1.5">10 sec</td></tr>
              </tbody>
            </table>
            <p class="mt-2">Save and <b>reboot the device</b>. Within 30 seconds it will show up here with a "Last Seen" timestamp.</p>
          </section>

          <section>
            <h3 class="text-base font-semibold text-gray-900 mb-2">3. Enroll employees on the machine</h3>
            <p>When you enroll a fingerprint/face on the device, the employee's <b>PIN must equal their Statcompy <code>employeeCode</code></b> (e.g. <code>EMP0042</code>). If they don't match, punches will appear in the Punch Feed marked as "Unknown" — fix the code and click <b>Reconcile Unknown</b> on the Devices tab.</p>
          </section>

          <section>
            <h3 class="text-base font-semibold text-gray-900 mb-2">4. How it flows into payroll</h3>
            <ol class="list-decimal pl-5 space-y-1">
              <li>Employee scans on device → device pushes punch to cloud over HTTPS within ~10 sec.</li>
              <li>Statcompy stores raw punch, computes day's check-in / check-out / worked hours / OT (any time worked over 9h/day).</li>
              <li>Attendance row is written with <code>source = BIOMETRIC</code> and <code>approval_status = APPROVED</code>.</li>
              <li>When you process payroll for the month, the engine pulls <b>Days Present</b>, <b>LOP Days</b>, and <b>OT Hours</b> from these rows and feeds them into salary formulas.</li>
              <li>Manual edits in <b>Mark Attendance</b> always win — biometric will not overwrite them.</li>
            </ol>
          </section>

          <section>
            <h3 class="text-base font-semibold text-gray-900 mb-2">5. What if internet goes down?</h3>
            <p>The eSSL device buffers all punches in its internal flash (capacity 100k+). When connectivity returns, it pushes them all automatically. Duplicate detection is built-in — replays are safe.</p>
          </section>

        </div>
      </ng-container>

      <!-- ───────── ADD / EDIT MODAL ───────── -->
      <ui-modal *ngIf="showModal" [title]="editing ? 'Edit Device' : 'Register Biometric Device'" (closed)="showModal = false">
        <div class="grid grid-cols-1 gap-4">
          <ui-form-input
            label="Serial Number *"
            [(ngModel)]="form.serialNumber"
            placeholder="Printed on back of device, e.g. ABCD1234567"
            [disabled]="!!editing">
          </ui-form-input>
          <ui-form-input label="Label" [(ngModel)]="form.label" placeholder="e.g. Main Gate K90"></ui-form-input>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
            <select class="ui-input w-full" [(ngModel)]="form.branchId">
              <option [ngValue]="''">— None —</option>
              <option *ngFor="let b of branches" [ngValue]="b.id">{{ b.name }}</option>
            </select>
          </div>
          <div *ngIf="!editing" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
              <select class="ui-input w-full" [(ngModel)]="form.vendor">
                <option value="ESSL">eSSL</option>
                <option value="ZKTECO">ZKTeco</option>
                <option value="MATRIX">Matrix</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <ui-form-input label="Model" [(ngModel)]="form.model" placeholder="e.g. K90, X990"></ui-form-input>
          </div>
        </div>
        <div *ngIf="formError" class="text-sm text-red-600 mt-2">{{ formError }}</div>
        <div class="flex justify-end gap-3 mt-4">
          <ui-button variant="secondary" (clicked)="showModal = false">Cancel</ui-button>
          <ui-button variant="primary" [disabled]="saving" [loading]="saving" (clicked)="save()">
            {{ editing ? 'Update' : 'Register' }}
          </ui-button>
        </div>
      </ui-modal>

      <!-- ───────── ROTATE TOKEN CONFIRM ───────── -->
      <ui-modal *ngIf="rotateTarget" title="Rotate push token?" (closed)="rotateTarget = null">
        <p class="text-sm text-gray-700">
          A new push token will be generated for <b>{{ rotateTarget.label || rotateTarget.serialNumber }}</b>.
          The device will continue working (it authenticates by serial number),
          but any external systems using the old token will need updating.
        </p>
        <div class="flex justify-end gap-3 mt-4">
          <ui-button variant="secondary" (clicked)="rotateTarget = null">Cancel</ui-button>
          <ui-button variant="primary" [loading]="rotating" (clicked)="confirmRotate()">Rotate Token</ui-button>
        </div>
      </ui-modal>

    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }
    .tab-bar { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 1.25rem; }
    .tab-btn {
      padding: 0.6rem 1.25rem; font-size: 0.875rem; font-weight: 500; color: #6b7280;
      border-bottom: 2px solid transparent; cursor: pointer; margin-bottom: -2px;
      background: none; border-top: none; border-left: none; border-right: none;
      transition: color 0.2s, border-color 0.2s;
    }
    .tab-btn:hover { color: #374151; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
    .ui-input {
      display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db;
      border-radius: 0.5rem; font-size: 0.875rem; background: #fff;
    }
    .ui-input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,.15); }
    code { background: #f3f4f6; padding: 0 4px; border-radius: 3px; font-size: 0.8125rem; }
  `],
})
export class ClientBiometricComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tab: 'devices' | 'punches' | 'setup' = 'devices';

  // Devices
  devices: BiometricDevice[] = [];
  loadingDevices = false;
  showModal = false;
  editing: BiometricDevice | null = null;
  saving = false;
  reconciling = false;
  rotating = false;
  rotateTarget: BiometricDevice | null = null;
  formError = '';
  form: {
    serialNumber: string;
    label: string;
    branchId: string;
    vendor: string;
    model: string;
  } = { serialNumber: '', label: '', branchId: '', vendor: 'ESSL', model: '' };

  // Branches (shared dropdown)
  branches: BranchOption[] = [];

  // Punches
  punches: BiometricPunch[] = [];
  loadingPunches = false;
  reprocessing = false;
  punchFrom = '';
  punchTo = '';
  punchBranchId = '';

  // Computed
  get pushHost(): string {
    try {
      const u = new URL((window as any).location?.origin || '');
      // Backend host typically: api.<frontend host>
      const host = u.hostname.replace(/^www\./, '');
      return host.startsWith('api.') ? host : `api.${host}`;
    } catch {
      return 'api.statcosol.com';
    }
  }

  constructor(
    private svc: ClientBiometricService,
    private branchSvc: ClientBranchesService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.punchFrom = this.toIso(sevenDaysAgo);
    this.punchTo = this.toIso(today);

    this.loadBranches();
    this.loadDevices();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(t: 'devices' | 'punches' | 'setup'): void {
    this.tab = t;
    if (t === 'punches' && this.punches.length === 0) this.loadPunches();
  }

  // ── Devices ───────────────────────────────────────────────
  loadDevices(): void {
    this.loadingDevices = true;
    this.svc.listDevices()
      .pipe(takeUntil(this.destroy$), finalize(() => (this.loadingDevices = false)))
      .subscribe({
        next: (rows) => (this.devices = rows || []),
        error: (e) => this.toast.error(e?.error?.message || 'Failed to load devices'),
      });
  }

  openAdd(): void {
    this.editing = null;
    this.formError = '';
    this.form = { serialNumber: '', label: '', branchId: '', vendor: 'ESSL', model: '' };
    this.showModal = true;
  }

  save(): void {
    this.formError = '';
    if (!this.form.serialNumber.trim()) {
      this.formError = 'Serial number is required';
      return;
    }
    this.saving = true;
    const payload = {
      serialNumber: this.form.serialNumber.trim(),
      branchId: this.form.branchId || undefined,
      vendor: this.form.vendor,
      model: this.form.model || undefined,
      label: this.form.label || undefined,
    };
    this.svc.registerDevice(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Device registered');
          this.showModal = false;
          this.loadDevices();
        },
        error: (e) => (this.formError = e?.error?.message || 'Failed to register device'),
      });
  }

  toggleEnabled(d: BiometricDevice): void {
    this.svc.updateDevice(d.id, { enabled: !d.enabled })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          d.enabled = updated.enabled;
          this.toast.success(`Device ${updated.enabled ? 'enabled' : 'disabled'}`);
        },
        error: (e) => this.toast.error(e?.error?.message || 'Failed to update'),
      });
  }

  openRotate(d: BiometricDevice): void {
    this.rotateTarget = d;
  }

  confirmRotate(): void {
    if (!this.rotateTarget) return;
    this.rotating = true;
    this.svc.rotateToken(this.rotateTarget.id)
      .pipe(takeUntil(this.destroy$), finalize(() => (this.rotating = false)))
      .subscribe({
        next: (updated) => {
          const idx = this.devices.findIndex((x) => x.id === updated.id);
          if (idx >= 0) this.devices[idx] = updated;
          this.rotateTarget = null;
          this.toast.success('Push token rotated');
        },
        error: (e) => this.toast.error(e?.error?.message || 'Failed to rotate'),
      });
  }

  remove(d: BiometricDevice): void {
    const ok = confirm(`Delete device "${d.label || d.serialNumber}"? This cannot be undone.`);
    if (!ok) return;
    this.svc.deleteDevice(d.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.devices = this.devices.filter((x) => x.id !== d.id);
          this.toast.success('Device deleted');
        },
        error: (e) => this.toast.error(e?.error?.message || 'Failed to delete'),
      });
  }

  reconcile(): void {
    this.reconciling = true;
    this.svc.reconcile()
      .pipe(takeUntil(this.destroy$), finalize(() => (this.reconciling = false)))
      .subscribe({
        next: (r) => this.toast.success(`Reconciled ${r.resolved} punch(es)`),
        error: (e) => this.toast.error(e?.error?.message || 'Reconcile failed'),
      });
  }

  // ── Punches ───────────────────────────────────────────────
  loadPunches(): void {
    if (!this.punchFrom || !this.punchTo) return;
    this.loadingPunches = true;
    this.svc.listPunches({
      from: this.punchFrom,
      to: this.punchTo,
      branchId: this.punchBranchId || undefined,
    })
      .pipe(takeUntil(this.destroy$), finalize(() => (this.loadingPunches = false)))
      .subscribe({
        next: (rows) => (this.punches = rows || []),
        error: (e) => this.toast.error(e?.error?.message || 'Failed to load punches'),
      });
  }

  reprocess(): void {
    if (!this.punchFrom || !this.punchTo) return;
    const ok = confirm(`Reprocess attendance from ${this.punchFrom} to ${this.punchTo}? Manual edits will be preserved.`);
    if (!ok) return;
    this.reprocessing = true;
    this.svc.processRange({ from: this.punchFrom, to: this.punchTo, reprocess: true })
      .pipe(takeUntil(this.destroy$), finalize(() => (this.reprocessing = false)))
      .subscribe({
        next: (r) =>
          this.toast.success(
            `Reprocessed ${r.punchesScanned ?? 0} punch(es), updated ${r.attendanceUpserts ?? 0} attendance row(s)`,
          ),
        error: (e) => this.toast.error(e?.error?.message || 'Reprocess failed'),
      });
  }

  // ── Helpers ───────────────────────────────────────────────
  branchName(id: string | null): string {
    if (!id) return '—';
    return this.branches.find((b) => b.id === id)?.name || '—';
  }

  private loadBranches(): void {
    this.branchSvc.list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any[]) =>
          (this.branches = (rows || []).map((b) => ({ id: b.id, name: b.name }))),
        error: () => (this.branches = []),
      });
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
