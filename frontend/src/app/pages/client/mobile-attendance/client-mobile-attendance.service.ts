import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type MobileDeviceMode = 'KIOSK' | 'ESS';

export interface MobileAttendanceDevice {
  id: string;
  clientId: string;
  branchId: string | null;
  mode: MobileDeviceMode;
  deviceLabel: string | null;
  installToken: string;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  registeredAt: string;
  registeredBy: string | null;
  lastSeenAt: string | null;
  lastPunchAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface RegisterMobileDeviceBody {
  mode: MobileDeviceMode;
  branchId?: string;
  deviceLabel?: string;
  geofenceLat?: number;
  geofenceLng?: number;
  geofenceRadiusM?: number;
}

export interface FaceEnrollment {
  employeeId: string;
  clientId: string;
  branchId: string | null;
  azurePersonId: string | null;
  azurePersonGroup: string | null;
  embeddingModel: string | null;
  photoUrl: string | null;
  consentGivenAt: string | null;
  consentGivenBy: string | null;
  enrolledAt: string;
  enrolledBy: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  updatedAt: string;
}

export interface EnrollFaceBody {
  employeeId: string;
  consentGiven: true;
  embeddingBase64?: string;
  embeddingModel?: string;
  photoBase64?: string;
  photoMime?: string;
}

@Injectable({ providedIn: 'root' })
export class ClientMobileAttendanceService {
  private base = `${environment.apiBaseUrl}/api/v1/client/mobile-attendance`;

  constructor(private http: HttpClient) {}

  // Devices
  listDevices(): Observable<MobileAttendanceDevice[]> {
    return this.http.get<MobileAttendanceDevice[]>(`${this.base}/devices`);
  }

  registerDevice(body: RegisterMobileDeviceBody): Observable<MobileAttendanceDevice> {
    return this.http.post<MobileAttendanceDevice>(`${this.base}/devices`, body);
  }

  revokeDevice(id: string): Observable<MobileAttendanceDevice> {
    return this.http.delete<MobileAttendanceDevice>(`${this.base}/devices/${id}`);
  }

  // Enrollment
  enrollFace(body: EnrollFaceBody): Observable<FaceEnrollment> {
    return this.http.post<FaceEnrollment>(`${this.base}/enroll`, body);
  }

  deactivateEnrollment(employeeId: string, reason?: string): Observable<FaceEnrollment> {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return this.http.delete<FaceEnrollment>(`${this.base}/enroll/${employeeId}${qs}`);
  }
}
