import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';

import { AiApiService, AiConfig, AiStatus } from '../../../core/ai-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  ActionButtonComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-ai-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
  ],
  template: `
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="AI Configuration" subtitle="Manage OpenAI integration, model settings, and API key">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" size="lg" class="py-16 block"></ui-loading-spinner>

      <div *ngIf="!loading" class="space-y-6">
        <!-- Status Banner -->
        <div *ngIf="status" class="rounded-lg p-4"
             [ngClass]="status.aiEnabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{{ status.aiEnabled ? '✅' : '⚠️' }}</span>
            <div>
              <p class="font-semibold" [ngClass]="status.aiEnabled ? 'text-emerald-800' : 'text-amber-800'">
                {{ status.aiEnabled ? 'OpenAI Connected' : 'Running in Rule-Based Mode' }}
              </p>
              <p class="text-sm" [ngClass]="status.aiEnabled ? 'text-emerald-600' : 'text-amber-600'">
                {{ status.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Config Form -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-6">Model Settings</h2>

          <div class="space-y-5">
            <div>
              <label for="ai-provider" class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select id="ai-provider" name="provider" [(ngModel)]="form.provider"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI</option>
              </select>
            </div>

            <div>
              <label for="ai-model" class="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
              <select id="ai-model" name="modelName" [(ngModel)]="form.modelName"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <optgroup label="GPT-4.1 Series (Latest)">
                  <option value="gpt-4.1-nano">GPT-4.1 Nano (fastest, cheapest)</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini (fast, affordable)</option>
                  <option value="gpt-4.1">GPT-4.1 (flagship)</option>
                </optgroup>
                <optgroup label="GPT-4o Series">
                  <option value="gpt-4o-mini">GPT-4o Mini (compact)</option>
                  <option value="gpt-4o">GPT-4o (balanced)</option>
                </optgroup>
                <optgroup label="Reasoning Models">
                  <option value="o3-mini">O3 Mini (reasoning)</option>
                </optgroup>
              </select>
              <p class="text-xs text-gray-500 mt-1">GPT-4.1 Mini recommended — best cost/performance for compliance analysis.</p>
            </div>

            <div>
              <label for="ai-apikey" class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input type="password" id="ai-apikey" name="apiKey" autocomplete="off" [(ngModel)]="form.apiKey" placeholder="sk-..."
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500" />
              <p class="text-xs text-gray-500 mt-1">
                {{ config?.configured ? '🔑 API key is configured. Enter a new key to replace it.' : 'No API key set. The system will use rule-based analysis without an API key.' }}
              </p>
            </div>

            <div>
              <label for="ai-temperature" class="block text-sm font-medium text-gray-700 mb-1">Temperature ({{ form.temperature }})</label>
              <input autocomplete="off" type="range" id="ai-temperature" name="temperature" [(ngModel)]="form.temperature" min="0" max="1" step="0.05"
                     class="w-full accent-blue-600" />
              <div class="flex justify-between text-xs text-gray-400 mt-1">
                <span>Deterministic (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            <div>
              <label for="ai-max-tokens" class="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
              <input autocomplete="off" type="number" id="ai-max-tokens" name="maxTokens" [(ngModel)]="form.maxTokens" min="256" max="8192" step="256"
                     class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              <p class="text-xs text-gray-500 mt-1">Typical range: 1024–4096. Higher values allow more detailed analysis.</p>
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
            <ui-button variant="secondary" (clicked)="loadConfig()">Reset</ui-button>
            <ui-button variant="primary" [disabled]="saving" (clicked)="save()">
              {{ saving ? 'Saving...' : 'Save Configuration' }}
            </ui-button>
          </div>
        </div>

        <!-- Info -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 class="font-semibold text-blue-900 mb-2">How AI Works in StatComPy</h3>
          <ul class="text-sm text-blue-800 space-y-2">
            <li><strong>With API Key:</strong> Uses OpenAI for enhanced risk scoring, detailed legal analysis, predictive insights, and nuanced audit observations.</li>
            <li><strong>Without API Key:</strong> Falls back to rule-based analysis covering EPF, ESI, Minimum Wages, Factory Act, and Contract Labour regulations. Still detects violations effectively.</li>
            <li><strong>Data Privacy:</strong> Only aggregated compliance metrics are sent to OpenAI — never employee PII, salary data, or confidential client information.</li>
          </ul>
        </div>
      </div>
    </div>
  `,
})
export class AiConfigComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  saving = false;
  config: AiConfig | null = null;
  status: AiStatus | null = null;

  form = {
    provider: 'openai',
    modelName: 'gpt-4.1-mini',
    apiKey: '',
    temperature: 0.3,
    maxTokens: 2048,
  };

  constructor(
    private ai: AiApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConfig(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.ai.getConfig()
      .pipe(
        takeUntil(this.destroy$),
        timeout(8000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (cfg) => {
          this.config = cfg;
          this.form.provider = cfg.provider || 'openai';
          this.form.modelName = cfg.modelName || 'gpt-4.1-mini';
          this.form.temperature = cfg.temperature ?? 0.3;
          this.form.maxTokens = cfg.maxTokens ?? 2048;
          this.form.apiKey = '';
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to load AI configuration.');
          this.cdr.markForCheck();
        },
      });

    this.ai.getStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.status = s;
          this.cdr.markForCheck();
        },
      });
  }

  save(): void {
    this.saving = true;
    this.cdr.markForCheck();

    const payload: any = {
      provider: this.form.provider,
      modelName: this.form.modelName,
      temperature: this.form.temperature,
      maxTokens: this.form.maxTokens,
    };
    if (this.form.apiKey) payload.apiKey = this.form.apiKey;

    this.ai.updateConfig(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('AI configuration saved successfully!');
          this.loadConfig();
        },
        error: () => this.toast.error('Failed to save configuration.'),
      });
  }
}
