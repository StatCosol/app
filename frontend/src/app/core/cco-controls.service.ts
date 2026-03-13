import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SlaRule, EscalationThreshold, ReminderRule, CcoControlsPayload,
} from '../shared/models/cco-controls.model';

@Injectable({ providedIn: 'root' })
export class CcoControlsService {
  private readonly base = `${environment.apiBaseUrl || ''}/api/v1/cco/controls`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<CcoControlsPayload> {
    return this.http.get<CcoControlsPayload>(this.base);
  }

  // ── SLA Rules ──
  saveSla(rule: Partial<SlaRule>) {
    return this.http.post(`${this.base}/sla`, rule);
  }

  toggleSla(id: string, isActive: boolean) {
    return this.http.patch(`${this.base}/sla/${id}`, { isActive });
  }

  // ── Escalation Thresholds ──
  saveThreshold(rule: Partial<EscalationThreshold>) {
    return this.http.post(`${this.base}/thresholds`, rule);
  }

  toggleThreshold(id: string, isActive: boolean) {
    return this.http.patch(`${this.base}/thresholds/${id}`, { isActive });
  }

  // ── Reminder Rules ──
  saveReminder(rule: Partial<ReminderRule>) {
    return this.http.post(`${this.base}/reminders`, rule);
  }

  toggleReminder(id: string, isActive: boolean) {
    return this.http.patch(`${this.base}/reminders/${id}`, { isActive });
  }
}
