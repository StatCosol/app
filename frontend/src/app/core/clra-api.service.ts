import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ClraPeEstablishment {
  id: string;
  clientId: string;
  branchId?: string | null;
  peName: string;
  establishmentName: string;
  establishmentCode?: string | null;
  registrationCertificateNo?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  stateCode: string;
  pincode?: string | null;
  unitType?: string | null;
  active?: boolean;
}

export interface ClraContractor {
  id: string;
  contractorCode: string;
  legalName: string;
  tradeName?: string | null;
  contactPerson?: string | null;
  mobile?: string | null;
  email?: string | null;
  pan?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  active?: boolean;
  contractorUserId?: string | null;
}

export interface ClraAssignment {
  id: string;
  contractorId: string;
  peEstablishmentId: string;
  assignmentCode: string;
  contractNo?: string | null;
  workOrderNo?: string | null;
  natureOfWork: string;
  workLocationName?: string | null;
  workLocationAddress?: string | null;
  stateCode: string;
  licenceNo?: string | null;
  licenceValidFrom?: string | null;
  licenceValidTo?: string | null;
  maximumWorkmen?: number | null;
  wagePeriodType?: string | null;
  startDate: string;
  endDate?: string | null;
  status?: string | null;
  contractor?: ClraContractor;
  peEstablishment?: ClraPeEstablishment;
}

export interface ClraWorker {
  id: string;
  contractorId: string;
  workerCode: string;
  fullName: string;
  fatherOrSpouseName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  category?: string | null;
  designation?: string | null;
  aadhaarMasked?: string | null;
  uan?: string | null;
  esiNo?: string | null;
  bankAccountMasked?: string | null;
  mobile?: string | null;
  address?: string | null;
  dateOfJoining?: string | null;
  active?: boolean;
}

export interface ClraDeployment {
  id: string;
  assignmentId: string;
  workerId: string;
  deploymentStart: string;
  deploymentEnd?: string | null;
  ratePerDay?: number | null;
  ratePerMonth?: number | null;
  otRatePerHour?: number | null;
  status?: string | null;
  worker?: ClraWorker;
}

export interface ClraWagePeriod {
  id: string;
  assignmentId: string;
  periodFrom: string;
  periodTo: string;
  wageMonth: number;
  wageYear: number;
  paymentDate?: string | null;
  paymentPlace?: string | null;
  status?: string | null;
}

export interface ClraAttendance {
  id: string;
  wagePeriodId: string;
  workerDeploymentId: string;
  attendanceDate: string;
  status: string;
  inTime?: string | null;
  outTime?: string | null;
  normalHours?: number | null;
  otHours?: number | null;
  workerDeployment?: ClraDeployment;
}

export interface ClraWage {
  id: string;
  wagePeriodId: string;
  workerDeploymentId: string;
  daysWorked: number;
  basicWage: number;
  da?: number | null;
  hra?: number | null;
  otWages?: number | null;
  allowances?: number | null;
  grossWages: number;
  pfDeduction?: number | null;
  esiDeduction?: number | null;
  ptDeduction?: number | null;
  otherDeductions?: number | null;
  netWages: number;
  workerDeployment?: ClraDeployment;
}

export type CreatePeEstablishmentPayload = Pick<
  ClraPeEstablishment,
  'clientId' | 'peName' | 'establishmentName' | 'stateCode'
> &
  Partial<
    Pick<
      ClraPeEstablishment,
      | 'branchId'
      | 'establishmentCode'
      | 'registrationCertificateNo'
      | 'addressLine1'
      | 'addressLine2'
      | 'city'
      | 'district'
      | 'pincode'
      | 'unitType'
    >
  >;

export type CreateContractorPayload = Pick<ClraContractor, 'contractorCode' | 'legalName'> &
  Partial<
    Pick<
      ClraContractor,
      | 'tradeName'
      | 'contactPerson'
      | 'mobile'
      | 'email'
      | 'pan'
      | 'gstin'
      | 'addressLine1'
      | 'addressLine2'
      | 'city'
      | 'district'
      | 'stateCode'
      | 'pincode'
      | 'contractorUserId'
    >
  >;

export type CreateAssignmentPayload = Pick<
  ClraAssignment,
  'contractorId' | 'peEstablishmentId' | 'assignmentCode' | 'natureOfWork' | 'stateCode' | 'startDate'
> &
  Partial<
    Pick<
      ClraAssignment,
      | 'contractNo'
      | 'workOrderNo'
      | 'workLocationName'
      | 'workLocationAddress'
      | 'licenceNo'
      | 'licenceValidFrom'
      | 'licenceValidTo'
      | 'maximumWorkmen'
      | 'wagePeriodType'
      | 'endDate'
    >
  >;

export type CreateWorkerPayload = Pick<ClraWorker, 'contractorId' | 'workerCode' | 'fullName'> &
  Partial<
    Pick<
      ClraWorker,
      | 'fatherOrSpouseName'
      | 'gender'
      | 'dateOfBirth'
      | 'category'
      | 'designation'
      | 'aadhaarMasked'
      | 'uan'
      | 'esiNo'
      | 'bankAccountMasked'
      | 'mobile'
      | 'address'
      | 'dateOfJoining'
    >
  >;

export type CreateDeploymentPayload = Pick<
  ClraDeployment,
  'assignmentId' | 'workerId' | 'deploymentStart'
> &
  Partial<Pick<ClraDeployment, 'deploymentEnd' | 'ratePerDay' | 'ratePerMonth' | 'otRatePerHour'>>;

export type CreateWagePeriodPayload = Pick<
  ClraWagePeriod,
  'assignmentId' | 'periodFrom' | 'periodTo' | 'wageMonth' | 'wageYear'
> &
  Partial<Pick<ClraWagePeriod, 'paymentDate' | 'paymentPlace'>>;

export interface UpsertAttendancePayload {
  wagePeriodId: string;
  workerDeploymentId: string;
  attendanceDate: string;
  status: string;
  inTime?: string;
  outTime?: string;
  normalHours?: number;
  otHours?: number;
}

export interface UpsertWagePayload {
  wagePeriodId: string;
  workerDeploymentId: string;
  daysWorked: number;
  basicWage: number;
  grossWages: number;
  netWages: number;
  da?: number;
  hra?: number;
  otWages?: number;
  allowances?: number;
  pfDeduction?: number;
  esiDeduction?: number;
  ptDeduction?: number;
  otherDeductions?: number;
}

export interface ClraRegisterRun {
  id: string;
  assignmentId: string;
  wagePeriodId?: string | null;
  registerCode: string;
  fileName?: string | null;
  fileUrl?: string | null;
  status?: string | null;
  versionNo?: number | null;
  generatedAt?: string;
}

export interface CreateRegisterRunPayload {
  assignmentId: string;
  registerCode: string;
  wagePeriodId?: string;
  fileName?: string;
  fileUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ClraApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/clra`;
  private readonly portalBase = `${environment.apiBaseUrl}/api/v1/clra/me`;

  constructor(private http: HttpClient) {}

  // PE Establishments
  listPeEstablishments(clientId: string): Observable<ClraPeEstablishment[]> {
    const params = new HttpParams().set('clientId', clientId);
    return this.http.get<ClraPeEstablishment[]>(`${this.base}/pe-establishments`, { params });
  }

  createPeEstablishment(body: CreatePeEstablishmentPayload): Observable<ClraPeEstablishment> {
    return this.http.post<ClraPeEstablishment>(`${this.base}/pe-establishments`, body);
  }

  updatePeEstablishment(id: string, body: Partial<CreatePeEstablishmentPayload>): Observable<ClraPeEstablishment> {
    return this.http.put<ClraPeEstablishment>(`${this.base}/pe-establishments/${id}`, body);
  }

  // Contractors
  listContractors(): Observable<ClraContractor[]> {
    return this.http.get<ClraContractor[]>(`${this.base}/contractors`);
  }

  createContractor(body: CreateContractorPayload): Observable<ClraContractor> {
    return this.http.post<ClraContractor>(`${this.base}/contractors`, body);
  }

  updateContractor(id: string, body: Partial<CreateContractorPayload>): Observable<ClraContractor> {
    return this.http.put<ClraContractor>(`${this.base}/contractors/${id}`, body);
  }

  // Assignments
  listAssignments(contractorId?: string, peEstablishmentId?: string): Observable<ClraAssignment[]> {
    let params = new HttpParams();
    if (contractorId) params = params.set('contractorId', contractorId);
    if (peEstablishmentId) params = params.set('peEstablishmentId', peEstablishmentId);
    return this.http.get<ClraAssignment[]>(`${this.base}/assignments`, { params });
  }

  createAssignment(body: CreateAssignmentPayload): Observable<ClraAssignment> {
    return this.http.post<ClraAssignment>(`${this.base}/assignments`, body);
  }

  updateAssignment(id: string, body: Partial<CreateAssignmentPayload>): Observable<ClraAssignment> {
    return this.http.put<ClraAssignment>(`${this.base}/assignments/${id}`, body);
  }

  // Workers
  listWorkers(contractorId: string): Observable<ClraWorker[]> {
    const params = new HttpParams().set('contractorId', contractorId);
    return this.http.get<ClraWorker[]>(`${this.base}/workers`, { params });
  }

  createWorker(body: CreateWorkerPayload): Observable<ClraWorker> {
    return this.http.post<ClraWorker>(`${this.base}/workers`, body);
  }

  updateWorker(id: string, body: Partial<CreateWorkerPayload>): Observable<ClraWorker> {
    return this.http.put<ClraWorker>(`${this.base}/workers/${id}`, body);
  }

  // Deployments
  listDeployments(assignmentId: string): Observable<ClraDeployment[]> {
    return this.http.get<ClraDeployment[]>(`${this.base}/assignments/${assignmentId}/deployments`);
  }

  createDeployment(body: CreateDeploymentPayload): Observable<ClraDeployment> {
    return this.http.post<ClraDeployment>(`${this.base}/deployments`, body);
  }

  updateDeployment(id: string, body: Partial<CreateDeploymentPayload>): Observable<ClraDeployment> {
    return this.http.put<ClraDeployment>(`${this.base}/deployments/${id}`, body);
  }

  // Wage Periods
  listWagePeriods(assignmentId: string): Observable<ClraWagePeriod[]> {
    return this.http.get<ClraWagePeriod[]>(`${this.base}/assignments/${assignmentId}/wage-periods`);
  }

  createWagePeriod(body: CreateWagePeriodPayload): Observable<ClraWagePeriod> {
    return this.http.post<ClraWagePeriod>(`${this.base}/wage-periods`, body);
  }

  closeWagePeriod(id: string): Observable<ClraWagePeriod> {
    return this.http.put<ClraWagePeriod>(`${this.base}/wage-periods/${id}/close`, {});
  }

  // Attendance
  listAttendance(wagePeriodId: string): Observable<ClraAttendance[]> {
    return this.http.get<ClraAttendance[]>(`${this.base}/wage-periods/${wagePeriodId}/attendance`);
  }

  upsertAttendance(body: UpsertAttendancePayload): Observable<ClraAttendance> {
    return this.http.post<ClraAttendance>(`${this.base}/attendance`, body);
  }

  // Wages
  listWages(wagePeriodId: string): Observable<ClraWage[]> {
    return this.http.get<ClraWage[]>(`${this.base}/wage-periods/${wagePeriodId}/wages`);
  }

  upsertWage(body: UpsertWagePayload): Observable<ClraWage> {
    return this.http.post<ClraWage>(`${this.base}/wages`, body);
  }

  listRegisterRuns(assignmentId: string): Observable<ClraRegisterRun[]> {
    return this.http.get<ClraRegisterRun[]>(`${this.base}/assignments/${assignmentId}/register-runs`);
  }

  createRegisterRun(body: CreateRegisterRunPayload): Observable<ClraRegisterRun> {
    return this.http.post<ClraRegisterRun>(`${this.base}/register-runs`, body);
  }

  uploadRegisterRun(formData: FormData, portal = false): Observable<ClraRegisterRun> {
    const url = portal
      ? `${this.portalBase}/register-runs/upload`
      : `${this.base}/register-runs/upload`;
    return this.http.post<ClraRegisterRun>(url, formData);
  }

  downloadRegisterRunUrl(id: string, portal = false): string {
    return portal
      ? `${this.portalBase}/register-runs/${id}/download`
      : `${this.base}/register-runs/${id}/download`;
  }

  // Contractor portal (scoped to logged-in contractor user)
  getMyContractor(): Observable<ClraContractor> {
    return this.http.get<ClraContractor>(`${this.portalBase}/contractor`);
  }

  listMyAssignments(): Observable<ClraAssignment[]> {
    return this.http.get<ClraAssignment[]>(`${this.portalBase}/assignments`);
  }

  listMyWorkers(): Observable<ClraWorker[]> {
    return this.http.get<ClraWorker[]>(`${this.portalBase}/workers`);
  }

  createMyWorker(body: Omit<CreateWorkerPayload, 'contractorId'>): Observable<ClraWorker> {
    return this.http.post<ClraWorker>(`${this.portalBase}/workers`, body);
  }

  updateMyWorker(id: string, body: Partial<CreateWorkerPayload>): Observable<ClraWorker> {
    return this.http.put<ClraWorker>(`${this.portalBase}/workers/${id}`, body);
  }

  listMyDeployments(assignmentId: string): Observable<ClraDeployment[]> {
    return this.http.get<ClraDeployment[]>(`${this.portalBase}/assignments/${assignmentId}/deployments`);
  }

  createMyDeployment(body: CreateDeploymentPayload): Observable<ClraDeployment> {
    return this.http.post<ClraDeployment>(`${this.portalBase}/deployments`, body);
  }

  updateMyDeployment(id: string, body: Partial<CreateDeploymentPayload>): Observable<ClraDeployment> {
    return this.http.put<ClraDeployment>(`${this.portalBase}/deployments/${id}`, body);
  }

  listMyWagePeriods(assignmentId: string): Observable<ClraWagePeriod[]> {
    return this.http.get<ClraWagePeriod[]>(`${this.portalBase}/assignments/${assignmentId}/wage-periods`);
  }

  createMyWagePeriod(body: CreateWagePeriodPayload): Observable<ClraWagePeriod> {
    return this.http.post<ClraWagePeriod>(`${this.portalBase}/wage-periods`, body);
  }

  closeMyWagePeriod(id: string): Observable<ClraWagePeriod> {
    return this.http.put<ClraWagePeriod>(`${this.portalBase}/wage-periods/${id}/close`, {});
  }

  listMyAttendance(wagePeriodId: string): Observable<ClraAttendance[]> {
    return this.http.get<ClraAttendance[]>(`${this.portalBase}/wage-periods/${wagePeriodId}/attendance`);
  }

  upsertMyAttendance(body: UpsertAttendancePayload): Observable<ClraAttendance> {
    return this.http.post<ClraAttendance>(`${this.portalBase}/attendance`, body);
  }

  listMyWages(wagePeriodId: string): Observable<ClraWage[]> {
    return this.http.get<ClraWage[]>(`${this.portalBase}/wage-periods/${wagePeriodId}/wages`);
  }

  upsertMyWage(body: UpsertWagePayload): Observable<ClraWage> {
    return this.http.post<ClraWage>(`${this.portalBase}/wages`, body);
  }

  listMyRegisterRuns(assignmentId: string): Observable<ClraRegisterRun[]> {
    return this.http.get<ClraRegisterRun[]>(`${this.portalBase}/assignments/${assignmentId}/register-runs`);
  }

  createMyRegisterRun(body: CreateRegisterRunPayload): Observable<ClraRegisterRun> {
    return this.http.post<ClraRegisterRun>(`${this.portalBase}/register-runs`, body);
  }
}
