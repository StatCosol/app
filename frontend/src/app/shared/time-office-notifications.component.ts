import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-time-office-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="p-5 bg-white border rounded-xl">
      <div class="flex justify-between gap-4">
        <h2 class="text-xl font-semibold">Notifications &amp; escalations</h2>
        <button class="border rounded px-3 py-2" (click)="load()">Refresh</button>
      </div>
      <p class="text-sm text-gray-500 my-3">
        Attendance reminders, branch escalations and replies. Only conversations sent to you or
        started by you are shown.
      </p>
      @if (error) {
        <p role="alert" class="text-red-700 my-3">{{ error }}</p>
      }
      @if (loading) {
        <p role="status">Loading…</p>
      }
      @if (detail) {
        <button class="underline my-3" (click)="detail = null">Back to notifications</button>
        <h3 class="font-semibold">{{ detail.thread.subject }}</h3>
        <p class="text-sm text-gray-500">{{ detail.thread.status }}</p>
        @for (message of detail.messages; track message.id) {
          <article class="border rounded p-3 my-3">
            <strong>{{ message.from?.name }}</strong
            ><small class="ml-3">{{ message.createdAt | date: 'medium' }}</small>
            <p class="whitespace-pre-wrap mt-2">{{ message.message }}</p>
          </article>
        }
        @if (detail.thread.status !== 'CLOSED') {
          <form (ngSubmit)="reply()">
            <label class="block"
              >Reply<textarea
                class="block border rounded w-full p-3 my-2"
                name="reply"
                [(ngModel)]="message"
                maxlength="2000"
                required
                rows="3"
              ></textarea></label
            ><button
              class="bg-blue-900 text-white rounded px-4 py-2"
              [disabled]="sending || !message.trim()"
            >
              {{ sending ? 'Sending…' : 'Send reply' }}
            </button>
          </form>
        }
      } @else {
        @for (row of rows; track row.id) {
          <button class="block w-full text-left border-b py-4" (click)="open(row.id)">
            <strong>{{ row.subject }}</strong
            ><span class="block text-sm text-gray-500"
              >{{ row.status }} · {{ row.createdAt | date: 'medium' }} ·
              {{ row.assignedTo?.name }}</span
            >
          </button>
        } @empty {
          @if (!loading) {
            <p class="py-6 text-gray-500">No notifications yet.</p>
          }
        }
        <div class="flex gap-4 items-center mt-4">
          <button
            class="border rounded px-3 py-2"
            [disabled]="page === 1 || loading"
            (click)="page = page - 1; load()"
          >
            Previous</button
          ><span>Page {{ page }} · {{ total }} conversations</span
          ><button
            class="border rounded px-3 py-2"
            [disabled]="page * 20 >= total || loading"
            (click)="page = page + 1; load()"
          >
            Next
          </button>
        </div>
      }
    </section>
  `,
})
export class TimeOfficeNotificationsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroy$ = new Subject<void>();
  private readonly base = `${environment.apiBaseUrl}/api/v1/notifications`;
  rows: any[] = [];
  detail: any = null;
  page = 1;
  total = 0;
  message = '';
  error = '';
  loading = false;
  sending = false;
  private generation = 0;
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  load() {
    const generation = ++this.generation;
    this.loading = true;
    this.error = '';
    this.detail = null;
    this.http
      .get<any>(this.base + '/inbox', { params: { page: this.page, limit: 20 } })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (value) => {
          if (generation !== this.generation) return;
          this.rows = value.data;
          this.total = value.total;
          this.loading = false;
        },
        error: () => {
          if (generation !== this.generation) return;
          this.error = 'Unable to load notifications. Please retry.';
          this.loading = false;
        },
      });
  }
  open(id: string) {
    const generation = ++this.generation;
    this.error = '';
    this.message = '';
    this.loading = true;
    this.http
      .get<any>(this.base + '/threads/' + id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (value) => {
          if (generation !== this.generation) return;
          this.detail = value;
          this.loading = false;
        },
        error: () => {
          if (generation !== this.generation) return;
          this.error = 'Unable to open notification.';
          this.loading = false;
        },
      });
  }
  reply() {
    if (!this.detail || this.sending || !this.message.trim()) return;
    const id = this.detail.thread.id;
    this.sending = true;
    this.error = '';
    this.http
      .post(this.base + '/threads/' + id + '/reply', { message: this.message.trim() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.sending = false;
          this.open(id);
        },
        error: () => {
          this.sending = false;
          this.error = 'Reply was not sent. Please retry.';
        },
      });
  }
}
