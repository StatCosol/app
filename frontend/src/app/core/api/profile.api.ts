import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/api/v1/me`);
  }

  updateProfile(data: Partial<UserProfile>): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.baseUrl}/api/v1/me/profile`, data);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/me/password`, { currentPassword, newPassword });
  }
}
