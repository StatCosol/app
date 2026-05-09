import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { CeoApiService, CeoEscalation } from '../../../core/api/ceo.api';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-escalation-details',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <a (click)="goBack()" class="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4 cursor-pointer">
        ← Back to Escalations
      </a>

      <ui-loading-spinner *ngIf="loading" text="Loading escalation details..."></ui-loading-spinner>

      <div *ngIf="errorMsg" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
        {{ errorMsg }}
      </div>

      <div *ngIf="!loading && escalation" class="space-y-6">
        <ui-page-header title="Escalation" [subtitle]="escalation.subject || ('#' + escalation.id)"></ui-page-header>

        <!-- Details card -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Subject</p>
              <p class="text-sm font-medium text-gray-900 mt-0.5">{{ escalation.subject || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Status</p>
              <span class="mt-0.5 inline-block px-2 py-0.5 text-xs font-medium rounded-full"
                    [ngClass]="{
                      'bg-yellow-100 text-yellow-700': escalation.status === 'OPEN',
                      'bg-green-100 text-green-700': escalation.status === 'CLOSED' || escalation.status === 'RESOLVED',
                      'bg-red-100 text-red-700': escalation.status === 'CRITICAL',
                      'bg-gray-100 text-gray-700': !['OPEN','CLOSED','RESOLVED','CRITICAL'].includes(escalation.status)
                    }">
                {{ escalation.status }}
              </span>
            </div>
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Created</p>
              <p class="text-sm font-medium text-gray-900 mt-0.5">
                {{ escalation.createdAt ? (escalation.createdAt | date:'medium') : '—' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Comments Thread -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-base font-semibold text-gray-900 mb-4">Comments</h3>

          <div *ngIf="!escalation.comments || escalation.comments.length === 0"
               class="text-sm text-gray-500">No comments yet.</div>

          <div *ngIf="escalation.comments && escalation.comments.length > 0" class="space-y-3 mb-4">
            <div *ngFor="let c of escalation.comments"
                 class="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-gray-700">{{ c.userName || c.userEmail || 'User' }}</span>
                <span class="text-xs text-gray-400">{{ c.createdAt | date:'short' }}</span>
              </div>
              <p class="text-sm text-gray-800">{{ c.message }}</p>
            </div>
          </div>

          <!-- Add Comment -->
          <div *ngIf="escalation.status !== 'CLOSED' && escalation.status !== 'RESOLVED'">
            <div *ngIf="actionMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-3 text-sm">
              {{ actionMsg }}
            </div>
            <div *ngIf="actionErr" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-3 text-sm">
              {{ actionErr }}
            </div>

            <div class="mb-3">
              <textarea autocomplete="off" id="ed-new-comment" name="newComment" [(ngModel)]="newComment" rows="2" placeholder="Add a comment..."
                        class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"></textarea>
            </div>

            <div class="flex gap-3">
              <button (click)="onComment()" [disabled]="submitting || !newComment.trim()"
                      class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                             hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {{ submitting ? 'Posting...' : 'Post Comment' }}
              </button>
              <button (click)="onClose()" [disabled]="submitting"
                      class="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium
                             hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {{ submitting ? 'Processing...' : 'Close Escalation' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class EscalationDetailsComponent implements OnInit, OnDestroy {
  escalation: CeoEscalation | null = null;
  loading = true;
  errorMsg: string | null = null;
  newComment = '';
  submitting = false;
  actionMsg: string | null = null;
  actionErr: string | null = null;

  private escalationId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ceoApi: CeoApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.escalationId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadEscalation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEscalation(): void {
    if (!this.escalationId) {
      this.errorMsg = 'No escalation ID provided.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.errorMsg = null;

    this.ceoApi.getEscalation(this.escalationId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.escalation = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Failed to load escalation details.';
        this.cdr.detectChanges();
      },
    });
  }

  onComment(): void {
    if (this.submitting || !this.newComment.trim()) return;
    this.submitting = true;
    this.actionMsg = null;
    this.actionErr = null;

    this.ceoApi.commentOnEscalation(this.escalationId, this.newComment.trim()).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionMsg = 'Comment posted.';
        this.newComment = '';
        this.submitting = false;
        this.cdr.detectChanges();
        this.loadEscalation();
      },
      error: (err) => {
        this.actionErr = err?.error?.message || 'Failed to post comment.';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  onClose(): void {
    if (this.submitting) return;
    const note = this.newComment.trim() || 'Closed by CEO.';
    this.submitting = true;
    this.actionMsg = null;
    this.actionErr = null;

    this.ceoApi.closeEscalation(this.escalationId, note).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionMsg = 'Escalation closed.';
        this.submitting = false;
        this.cdr.detectChanges();
        this.loadEscalation();
      },
      error: (err) => {
        this.actionErr = err?.error?.message || 'Failed to close escalation.';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/ceo/escalations']);
  }
}
