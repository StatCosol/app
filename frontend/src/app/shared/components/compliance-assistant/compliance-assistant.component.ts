import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProtectedFileService } from '../../files/services/protected-file.service';
import { Subscription, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
interface ActionPlan {
  explanationLabel: string;
  sources: Array<{ label: string; source: string }>;
  forecast: null;
  mode: 'AI' | 'RULES';
  note: string;
  coverage: string;
  generatedAt: string;
  period?: { month: number; year: number };
  scope?: { branchId: string | null };
  actions: Array<{
    id: string;
    title: string;
    status: string;
    branchName: string | null;
    dueDate: string | null;
    explanation: string;
    nextAction: string;
    route: string;
    queryParams: Record<string, string | number>;
  }>;
}
interface AssistDocument {
  id: string;
  kind: string;
  title: string;
  branchId: string | null;
  owner: string | null;
  period: string | null;
  status: string;
  employeeCode?: string;
  contractorId?: string;
  nonComplianceId?: string;
  variant?: string;
}
interface DocumentResult {
  status: string;
  message: string;
  sourceLabel: string;
  coverage: string;
  documents: AssistDocument[];
}
interface VoiceRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
@Component({
  selector: 'app-compliance-assistant',
  standalone: true,
  imports: [RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compliance-assistant.component.html',
  styleUrl: './compliance-assistant.component.scss',
})
export class ComplianceAssistantComponent implements OnChanges, OnDestroy {
  get selectedPeriod() {
    if (
      !Number.isInteger(this.month) ||
      this.month < 1 ||
      this.month > 12 ||
      !Number.isInteger(this.year)
    )
      return 'Selected period';
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
      new Date(this.year, this.month - 1, 1),
    );
  }
  useExample(request: string) {
    this.documentRequest = request;
    this.documentError.set('');
  }
  displayStatus(status: string | null) {
    if (!status) return 'Stored document';
    const value = status.replace(/_/g, ' ').toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  displayPeriod(period: string | null) {
    if (!period) return 'No period recorded';
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
        new Date(`${period}-01T00:00:00`),
      );
    if (/^\d{4}-\d{2}-\d{2}/.test(period)) {
      const date = new Date(period);
      if (!Number.isNaN(date.getTime()))
        return new Intl.DateTimeFormat('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date);
    }
    return period;
  }
  @Input() portal: 'client' | 'branch' = 'client';
  @Input() month = new Date().getMonth() + 1;
  @Input() year = new Date().getFullYear();
  @Input() branchId: string | number | null = null;
  constructor(
    private readonly http: HttpClient,
    private readonly files: ProtectedFileService = new ProtectedFileService(http),
  ) {}
  get statusRoute() {
    return this.portal === 'branch' ? '/branch/compliance/status' : '/client/compliance/status';
  }
  get statusQueryParams() {
    const plan = this.result();
    const branchId = plan?.scope?.branchId ?? this.branchId;
    return {
      month: plan?.period?.month ?? this.month,
      year: plan?.period?.year ?? this.year,
      branchId: branchId && branchId !== 'ALL' ? String(branchId) : undefined,
    };
  }
  private request?: Subscription;
  private documentSubscription?: Subscription;
  private viewSubscription?: Subscription;
  private recognition?: VoiceRecognition;
  documentRequest = '';
  readonly documentLoading = signal(false);
  readonly documentError = signal('');
  readonly documentResult = signal<DocumentResult | null>(null);
  readonly listening = signal(false);
  readonly voiceSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly result = signal<ActionPlan | null>(null);
  ngOnChanges() {
    this.request?.unsubscribe();
    this.documentSubscription?.unsubscribe();
    this.viewSubscription?.unsubscribe();
    this.recognition?.abort();
    this.result.set(null);
    this.error.set('');
    this.loading.set(false);
    this.documentResult.set(null);
    this.documentError.set('');
    this.documentLoading.set(false);
    this.listening.set(false);
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
    this.documentSubscription?.unsubscribe();
    this.viewSubscription?.unsubscribe();
    this.recognition?.abort();
  }
  findDocuments() {
    if (!this.documentRequest.trim() || this.documentLoading()) return;
    this.documentSubscription?.unsubscribe();
    this.documentLoading.set(true);
    this.documentError.set('');
    this.documentResult.set(null);
    const branchId = this.branchId && this.branchId !== 'ALL' ? String(this.branchId) : undefined;
    this.documentSubscription = this.http
      .post<DocumentResult>(environment.apiBaseUrl + '/api/v1/legitx/assistant/documents/find', {
        request: this.documentRequest.trim(),
        month: this.month,
        year: this.year,
        branchId,
      })
      .pipe(timeout(30000))
      .subscribe({
        next: (found) => {
          this.documentResult.set(found);
          this.documentLoading.set(false);
        },
        error: () => {
          this.documentLoading.set(false);
          this.documentError.set(
            'The document is unavailable in your current scope or the request could not be completed. No records were changed.',
          );
        },
      });
  }
  openDocument(doc: AssistDocument) {
    this.viewSubscription?.unsubscribe();
    this.documentError.set('');
    const params = new URLSearchParams();
    if (this.branchId && this.branchId !== 'ALL') params.set('branchId', String(this.branchId));
    if (doc.employeeCode) params.set('employeeCode', doc.employeeCode);
    if (doc.contractorId) params.set('contractorId', doc.contractorId);
    if (doc.nonComplianceId) params.set('nonComplianceId', doc.nonComplianceId);
    if (doc.variant) params.set('variant', doc.variant);
    const url = `/api/v1/legitx/assistant/documents/${encodeURIComponent(doc.kind)}/${encodeURIComponent(doc.id)}/view?${params}`;
    this.viewSubscription = this.files
      .open(url, doc.title)
      .pipe(timeout(30000))
      .subscribe({
        error: () =>
          this.documentError.set(
            'This file is unavailable or your view permission has changed. Try finding the document again.',
          ),
      });
  }
  startVoice() {
    const Recognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    this.recognition?.abort();
    const recognition: VoiceRecognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      this.documentRequest = event.results[0][0].transcript.slice(0, 400);
    };
    recognition.onerror = () => {
      this.documentError.set(
        'Voice input could not be captured. Type your document request instead.',
      );
      this.listening.set(false);
    };
    recognition.onend = () => this.listening.set(false);
    this.documentError.set('');
    this.listening.set(true);
    try {
      recognition.start();
    } catch {
      this.listening.set(false);
      this.documentError.set('Voice input is unavailable. Type your request instead.');
    }
  }
  generate() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    const branchId = this.branchId && this.branchId !== 'ALL' ? String(this.branchId) : undefined;
    this.request = this.http
      .post<ActionPlan>(environment.apiBaseUrl + '/api/v1/legitx/assistant/plan', {
        month: this.month,
        year: this.year,
        branchId,
      })
      .pipe(timeout(90000))
      .subscribe({
        next: (plan) => {
          this.result.set(plan);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(
            'The action plan could not be loaded. Your records have not been changed.',
          );
          this.loading.set(false);
        },
      });
  }
}
