import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import {
  AdminPayrollClientSettingRecord,
  AdminPayrollClientSettingsService,
} from './admin-payroll-client-settings.service';

interface ClientRow {
  id: string;
  label: string;
  configured: boolean;
  updatedAt: string | null;
}

interface SettingsHistoryRow {
  at: string;
  by: string;
  summary: string;
}

type PayCycleType = 'MONTHLY' | 'WEEKLY' | 'BIWEEKLY';

interface ClientSettingsForm {
  effectiveFrom: string;
  effectiveTo: string;
  payCycle: PayCycleType;
  cycleStartDay: number;
  payoutDay: number;
  lockDay: number;
  statutoryDefaults: {
    pfEnabled: boolean;
    esiEnabled: boolean;
    ptEnabled: boolean;
    lwfEnabled: boolean;
  };
  validationRules: {
    strictAttendanceLock: boolean;
    blockNegativeNetPay: boolean;
    requireBankAccount: boolean;
    requireUanForPf: boolean;
  };
  reminderRules: {
    preCutoffReminderDays: number;
    prePayoutReminderDays: number;
    escalationSlaHours: number;
  };
  notes: string;
  changeSummary: string;
  history: SettingsHistoryRow[];
}

@Component({
  selector: 'app-admin-payroll-client-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-payroll-client-settings.component.html',
  styleUrls: ['./admin-payroll-client-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPayrollClientSettingsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  detailLoading = false;
  saving = false;
  error: string | null = null;

  search = '';
  statusFilter: 'ALL' | 'CONFIGURED' | 'PENDING' = 'ALL';

  allClients: ClientRow[] = [];
  filteredClients: ClientRow[] = [];
  selectedClientId = '';
  selectedClientName = '';
  selectedRecord: AdminPayrollClientSettingRecord | null = null;

  settingsForm: ClientSettingsForm = this.defaultForm();
  private extraSettings: Record<string, any> = {};

  readonly payCycleOptions: PayCycleType[] = ['MONTHLY', 'WEEKLY', 'BIWEEKLY'];

  constructor(
    private readonly api: AdminPayrollClientSettingsService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadWorkspace();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorkspace(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      settingsList: this.api
        .getClientSettingsList()
        .pipe(catchError(() => of({ items: [] as AdminPayrollClientSettingRecord[] }))),
      clients: this.api.getClients().pipe(catchError(() => of([]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ settingsList, clients }) => {
          const settingsByClient = new Map<string, AdminPayrollClientSettingRecord>();
          for (const row of settingsList.items || []) {
            settingsByClient.set(row.clientId, row);
          }

          this.allClients = this.normalizeClients(clients).map((client) => {
            const setting = settingsByClient.get(client.id);
            return {
              id: client.id,
              label: client.label,
              configured: !!setting,
              updatedAt: setting?.updatedAt || null,
            };
          });

          this.applyFilters();
          if (!this.selectedClientId && this.filteredClients.length) {
            this.selectClient(this.filteredClients[0].id);
          }
        },
        error: (err: any) => {
          this.error =
            err?.error?.message || 'Failed to load payroll client settings workspace.';
          this.allClients = [];
          this.filteredClients = [];
        },
      });
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();
    this.filteredClients = this.allClients.filter((row) => {
      if (this.statusFilter === 'CONFIGURED' && !row.configured) return false;
      if (this.statusFilter === 'PENDING' && row.configured) return false;
      if (!term) return true;
      return row.label.toLowerCase().includes(term);
    });

    if (
      this.selectedClientId &&
      !this.filteredClients.some((client) => client.id === this.selectedClientId)
    ) {
      this.selectedClientId = '';
      this.selectedClientName = '';
      this.selectedRecord = null;
      this.settingsForm = this.defaultForm();
      this.extraSettings = {};
    }

    this.cdr.markForCheck();
  }

  selectClient(clientId: string): void {
    const selected = this.allClients.find((c) => c.id === clientId);
    if (!selected) return;

    this.selectedClientId = selected.id;
    this.selectedClientName = selected.label;
    this.detailLoading = true;
    this.selectedRecord = null;
    this.settingsForm = this.defaultForm();
    this.extraSettings = {};

    this.api
      .getClientSettings(clientId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (record) => {
          this.selectedRecord = record;
          if (record?.settings) {
            const mapped = this.mapSettings(record.settings);
            this.settingsForm = mapped.form;
            this.extraSettings = mapped.extra;
          } else {
            this.settingsForm = this.defaultForm();
            this.extraSettings = {};
          }

          if (
            this.selectedRecord?.updatedAt &&
            !this.settingsForm.history.some((h) => h.at === this.selectedRecord!.updatedAt)
          ) {
            this.settingsForm.history = [
              {
                at: this.selectedRecord.updatedAt,
                by: this.selectedRecord.updatedBy || 'system',
                summary: 'Saved configuration',
              },
              ...this.settingsForm.history,
            ];
          }
        },
        error: () => {
          this.toast.error('Load failed', 'Could not load client settings.');
          this.settingsForm = this.defaultForm();
          this.extraSettings = {};
        },
      });
  }

  saveClientSettings(): void {
    if (!this.selectedClientId) {
      this.toast.warning('Select client', 'Choose a client before saving settings.');
      return;
    }

    const validationMessage = this.validateForm();
    if (validationMessage) {
      this.toast.warning('Validation failed', validationMessage);
      return;
    }

    const me = this.auth.getUser();
    const actor = String(me?.id || me?.email || me?.name || 'admin');

    const historyEntry: SettingsHistoryRow = {
      at: new Date().toISOString(),
      by: actor,
      summary: (this.settingsForm.changeSummary || 'Settings updated').trim(),
    };

    const history = [historyEntry, ...this.settingsForm.history].slice(0, 30);
    const payloadSettings = this.buildSettingsPayload(history);

    this.saving = true;
    this.api
      .updateClientSettings(this.selectedClientId, {
        settings: payloadSettings,
        updated_by: me?.id ? String(me.id) : undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.selectedRecord = saved;
          this.settingsForm.history = history;
          this.settingsForm.changeSummary = 'Settings updated';

          const row = this.allClients.find((c) => c.id === this.selectedClientId);
          if (row) {
            row.configured = true;
            row.updatedAt = saved.updatedAt || new Date().toISOString();
          }
          this.applyFilters();

          this.toast.success('Settings saved', `${this.selectedClientName} payroll defaults updated.`);
        },
        error: (err: any) => {
          this.toast.error('Save failed', err?.error?.message || 'Could not save client settings.');
        },
      });
  }

  clearFormToDefaults(): void {
    this.settingsForm = this.defaultForm();
    this.extraSettings = {};
    this.cdr.markForCheck();
  }

  trackByClientId(_: number, client: ClientRow): string {
    return client.id;
  }

  private buildSettingsPayload(history: SettingsHistoryRow[]): Record<string, any> {
    return {
      ...this.extraSettings,
      effectiveFrom: this.settingsForm.effectiveFrom || null,
      effectiveTo: this.settingsForm.effectiveTo || null,
      payCycle: this.settingsForm.payCycle,
      cycleStartDay: Number(this.settingsForm.cycleStartDay || 1),
      payoutDay: Number(this.settingsForm.payoutDay || 1),
      lockDay: Number(this.settingsForm.lockDay || 26),
      statutoryDefaults: { ...this.settingsForm.statutoryDefaults },
      validationRules: { ...this.settingsForm.validationRules },
      reminderRules: {
        preCutoffReminderDays: Number(this.settingsForm.reminderRules.preCutoffReminderDays || 0),
        prePayoutReminderDays: Number(this.settingsForm.reminderRules.prePayoutReminderDays || 0),
        escalationSlaHours: Number(this.settingsForm.reminderRules.escalationSlaHours || 0),
      },
      notes: this.settingsForm.notes?.trim() || '',
      history,
    };
  }

  private mapSettings(raw: Record<string, any>): {
    form: ClientSettingsForm;
    extra: Record<string, any>;
  } {
    const knownKeys = new Set([
      'effectiveFrom',
      'effectiveTo',
      'payCycle',
      'cycleStartDay',
      'payoutDay',
      'lockDay',
      'statutoryDefaults',
      'validationRules',
      'reminderRules',
      'notes',
      'history',
    ]);

    const extra: Record<string, any> = {};
    Object.keys(raw || {}).forEach((key) => {
      if (!knownKeys.has(key)) {
        extra[key] = raw[key];
      }
    });

    const historyRowsRaw = Array.isArray(raw?.['history']) ? raw['history'] : [];
    const historyRows: SettingsHistoryRow[] = historyRowsRaw
      .map((entry: any) => ({
        at: String(entry?.at || entry?.changedAt || ''),
        by: String(entry?.by || entry?.updatedBy || 'admin'),
        summary: String(entry?.summary || entry?.reason || 'Settings updated'),
      }))
      .filter((entry: SettingsHistoryRow) => !!entry.at);

    return {
      extra,
      form: {
        effectiveFrom: this.normalizeDate(raw?.['effectiveFrom']),
        effectiveTo: this.normalizeDate(raw?.['effectiveTo']),
        payCycle: this.normalizePayCycle(raw?.['payCycle']),
        cycleStartDay: this.normalizeDay(raw?.['cycleStartDay'], 1),
        payoutDay: this.normalizeDay(raw?.['payoutDay'], 1),
        lockDay: this.normalizeDay(raw?.['lockDay'], 26),
        statutoryDefaults: {
          pfEnabled: !!(raw?.['statutoryDefaults']?.pfEnabled ?? true),
          esiEnabled: !!(raw?.['statutoryDefaults']?.esiEnabled ?? true),
          ptEnabled: !!(raw?.['statutoryDefaults']?.ptEnabled ?? false),
          lwfEnabled: !!(raw?.['statutoryDefaults']?.lwfEnabled ?? false),
        },
        validationRules: {
          strictAttendanceLock: !!(raw?.['validationRules']?.strictAttendanceLock ?? true),
          blockNegativeNetPay: !!(raw?.['validationRules']?.blockNegativeNetPay ?? true),
          requireBankAccount: !!(raw?.['validationRules']?.requireBankAccount ?? true),
          requireUanForPf: !!(raw?.['validationRules']?.requireUanForPf ?? false),
        },
        reminderRules: {
          preCutoffReminderDays: Number(raw?.['reminderRules']?.preCutoffReminderDays ?? 3),
          prePayoutReminderDays: Number(raw?.['reminderRules']?.prePayoutReminderDays ?? 2),
          escalationSlaHours: Number(raw?.['reminderRules']?.escalationSlaHours ?? 24),
        },
        notes: String(raw?.['notes'] || ''),
        changeSummary: 'Settings updated',
        history: historyRows,
      },
    };
  }

  private normalizeClients(payload: any): Array<{ id: string; label: string }> {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    return rows
      .map((client: any) => ({
        id: String(client?.id || client?.clientId || ''),
        label: String(client?.clientName || client?.name || 'Unknown Client'),
      }))
      .filter((client: { id: string; label: string }) => !!client.id)
      .sort(
        (a: { id: string; label: string }, b: { id: string; label: string }) =>
          a.label.localeCompare(b.label),
      );
  }

  private validateForm(): string | null {
    if (this.settingsForm.effectiveFrom && this.settingsForm.effectiveTo) {
      if (this.settingsForm.effectiveTo < this.settingsForm.effectiveFrom) {
        return 'Effective to date must be on or after effective from date.';
      }
    }

    const dayFields = [
      { label: 'Cycle start day', value: this.settingsForm.cycleStartDay },
      { label: 'Payout day', value: this.settingsForm.payoutDay },
      { label: 'Lock day', value: this.settingsForm.lockDay },
    ];
    for (const field of dayFields) {
      const value = Number(field.value);
      if (value < 1 || value > 31) return `${field.label} must be between 1 and 31.`;
    }

    const reminder = this.settingsForm.reminderRules;
    if (Number(reminder.preCutoffReminderDays) < 0 || Number(reminder.preCutoffReminderDays) > 30) {
      return 'Pre-cutoff reminder days must be between 0 and 30.';
    }
    if (Number(reminder.prePayoutReminderDays) < 0 || Number(reminder.prePayoutReminderDays) > 30) {
      return 'Pre-payout reminder days must be between 0 and 30.';
    }
    if (Number(reminder.escalationSlaHours) < 1 || Number(reminder.escalationSlaHours) > 168) {
      return 'Escalation SLA must be between 1 and 168 hours.';
    }

    return null;
  }

  private normalizeDay(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private normalizePayCycle(value: any): PayCycleType {
    const cycle = String(value || '').toUpperCase();
    if (cycle === 'WEEKLY' || cycle === 'BIWEEKLY') return cycle;
    return 'MONTHLY';
  }

  private normalizeDate(value: any): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private defaultForm(): ClientSettingsForm {
    return {
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      payCycle: 'MONTHLY',
      cycleStartDay: 1,
      payoutDay: 1,
      lockDay: 26,
      statutoryDefaults: {
        pfEnabled: true,
        esiEnabled: true,
        ptEnabled: false,
        lwfEnabled: false,
      },
      validationRules: {
        strictAttendanceLock: true,
        blockNegativeNetPay: true,
        requireBankAccount: true,
        requireUanForPf: false,
      },
      reminderRules: {
        preCutoffReminderDays: 3,
        prePayoutReminderDays: 2,
        escalationSlaHours: 24,
      },
      notes: '',
      changeSummary: 'Settings updated',
      history: [],
    };
  }
}
