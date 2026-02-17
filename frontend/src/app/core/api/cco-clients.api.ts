import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ClientStatus = 'ACTIVE' | 'INACTIVE';

export interface ClientDto {
  id: string;
  clientName: string;
  clientCode: string;
  status: ClientStatus;
  assignedCrmId?: string | null;
  assignedAuditorId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateClientRequest {
  clientName: string;
  clientCode: string;
  status?: ClientStatus;
}

export interface AssignClientRequest {
  assignedCrmId: string;
  assignedAuditorId: string;
}

@Injectable({ providedIn: 'root' })
export class CcoClientsApi {
  // ✅ FIX: use apiBaseUrl (matches your existing services)
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  listClients() {
    return this.http.get<ClientDto[]>(`${this.baseUrl}/api/cco/clients`);
  }

  createClient(payload: CreateClientRequest) {
    return this.http.post<ClientDto>(`${this.baseUrl}/api/cco/clients`, payload);
  }

  assignClient(clientId: string, payload: AssignClientRequest) {
    return this.http.patch<ClientDto>(
      `${this.baseUrl}/api/cco/clients/${clientId}/assign`,
      payload
    );
  }
}
