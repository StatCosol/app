import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClientQueriesService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  raiseQuery(body: any) {
    // body should include: queryType, message, subject?, clientId?, branchId?
    // Backend requires subject (min length 3). Auto-fill if omitted.
    const qt = String(body?.queryType || 'GENERAL');
    const subjectRaw = String(body?.subject || '').trim();
    const subject = subjectRaw.length >= 3 ? subjectRaw : `${qt} Query`;
    return this.http.post(`${this.baseUrl}/api/notifications`, { ...body, subject });
  }

  listMyThreads() {
    return this.http.get(`${this.baseUrl}/api/notifications/my`);
  }

  getThread(id: string) {
    return this.http.get(`${this.baseUrl}/api/notifications/threads/${id}`);
  }

  reply(id: string, body: any) {
    return this.http.post(`${this.baseUrl}/api/notifications/threads/${id}/reply`, body);
  }

  resolveThread(id: string) {
    // resolve in backend = close
    return this.http.post(`${this.baseUrl}/api/notifications/threads/${id}/close`, {});
  }
}
