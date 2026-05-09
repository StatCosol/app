import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface BiometricDevice {
  id: string;
  clientId: string;
  branchId: string | null;
  serialNumber: string;
  pushToken: string;
  vendor: string;
  model: string | null;
  label: string | null;
  enabled: boolean;
  lastSeenAt: string | null;
  lastPushCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BiometricPunch {
  id: string;
  employeeId: string | null;
  employeeCode: string;
  punchTime: string;
  direction: 'IN' | 'OUT' | 'AUTO';
  deviceId: string | null;
  source: string;
  processedAt: string | null;
  attendanceId: string | null;
}

export interface RegisterDeviceBody {
  serialNumber: string;
  branchId?: string;
  vendor?: string;
  model?: string;
  label?: string;
}

export interface UpdateDeviceBody {
  enabled?: boolean;
  branchId?: string;
  label?: string;
}

@Injectable({ providedIn: 'root' })
export class ClientBiometricService {
  private base = `${environment.apiBaseUrl}/api/v1/client/biometric`;

  constructor(private http: HttpClient) {}

  // ── Devices ───────────────────────────────────────────────
  listDevices(): Observable<BiometricDevice[]> {
    return this.http.get<BiometricDevice[]>(`${this.base}/devices`);
  }

  registerDevice(body: RegisterDeviceBody): Observable<BiometricDevice> {
    return this.http.post<BiometricDevice>(`${this.base}/devices`, body);
  }

  updateDevice(id: string, body: UpdateDeviceBody): Observable<BiometricDevice> {
    return this.http.patch<BiometricDevice>(`${this.base}/devices/${id}`, body);
  }

  rotateToken(id: string): Observable<BiometricDevice> {
    return this.http.post<BiometricDevice>(`${this.base}/devices/${id}/rotate-token`, {});
  }

  deleteDevice(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/devices/${id}`);
  }

  // ── Punches ───────────────────────────────────────────────
  listPunches(q: {
    from: string;
    to: string;
    branchId?: string;
    employeeId?: string;
    deviceId?: string;
  }): Observable<BiometricPunch[]> {
    let p = new HttpParams().set('from', q.from).set('to', q.to);
    if (q.branchId) p = p.set('branchId', q.branchId);
    if (q.employeeId) p = p.set('employeeId', q.employeeId);
    if (q.deviceId) p = p.set('deviceId', q.deviceId);
    return this.http.get<BiometricPunch[]>(`${this.base}/punches`, { params: p });
  }

  processRange(body: { from: string; to: string; reprocess?: boolean }): Observable<any> {
    return this.http.post(`${this.base}/process`, body);
  }

  reconcile(): Observable<{ resolved: number }> {
    return this.http.post<{ resolved: number }>(`${this.base}/reconcile`, {});
  }
}
