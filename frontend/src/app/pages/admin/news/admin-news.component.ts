import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NewsService,
  NewsItem,
  NEWS_CATEGORIES,
  NewsCategory,
  CreateNewsPayload,
} from '../../../shared/services/news.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-admin-news',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, PageHeaderComponent],
  template: `
    <ui-page-header
      title="Latest News Management"
      subtitle="Create and manage news items displayed on portal tickers"
      [breadcrumbs]="[{ label: 'Admin', route: '/admin/dashboard' }, { label: 'News' }]"
    ></ui-page-header>

    <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">

      <!-- ───── Create / Edit form ───── -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          {{ editing ? 'Edit News Item' : 'Post New News' }}
        </h2>
        <div class="space-y-4">
          <!-- Title -->
          <div>
            <label for="news-title" class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
            <input autocomplete="off"
              id="news-title"
              name="title"
              [(ngModel)]="form.title"
              type="text"
              maxlength="255"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="News headline..."
            />
          </div>

          <!-- Body -->
          <div>
            <label for="news-body" class="block text-sm font-medium text-gray-700 mb-1">Body <span class="text-red-500">*</span></label>
            <textarea autocomplete="off"
              id="news-body"
              name="body"
              [(ngModel)]="form.body"
              rows="5"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Full news content..."
            ></textarea>
          </div>

          <!-- Row: Category + Pinned -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label for="news-category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                id="news-category"
                name="category"
                [(ngModel)]="form.category"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
              </select>
            </div>
            <div>
              <label for="news-expiry" class="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input autocomplete="off"
                id="news-expiry"
                name="expiresAt"
                [(ngModel)]="form.expiresAt"
                type="date"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">News Image</label>
              <!-- Current file preview -->
              <div *ngIf="form.imageUrl" class="mb-2 relative inline-block">
                <img *ngIf="!isPdf(form.imageUrl)" [src]="form.imageUrl" alt="Preview" class="h-20 rounded-lg border border-gray-200 object-cover" (error)="onImgError($event)" />
                <a *ngIf="isPdf(form.imageUrl)" [href]="form.imageUrl" target="_blank"
                   class="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-blue-700 hover:bg-blue-50">
                  📄 View PDF
                </a>
                <button
                  type="button"
                  (click)="removeImage()"
                  class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
                  title="Remove file"
                >&times;</button>
              </div>
              <!-- Upload input -->
              <div class="flex items-center gap-2">
                <label
                  class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  {{ uploadingImage ? 'Uploading...' : 'Upload Image / PDF' }}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.pdf"
                    class="hidden"
                    (change)="onImageFileChange($event)"
                    [disabled]="uploadingImage"
                  />
                </label>
                <span *ngIf="uploadingImage" class="text-xs text-gray-400">Please wait...</span>
              </div>
              <p class="text-xs text-gray-400 mt-1">PNG, JPEG, GIF, WEBP or PDF. Max 5 MB.</p>
            </div>
          </div>

          <!-- Pinned toggle -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input autocomplete="off" id="news-pinned" name="pinned" [(ngModel)]="form.pinned" type="checkbox" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span class="text-sm text-gray-700 font-medium">📌 Pin to top</span>
          </label>

          <!-- Actions -->
          <div class="flex items-center gap-4 pt-2">
            <button
              (click)="save()"
              [disabled]="!form.title.trim() || !form.body.trim()"
              class="px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style="background: linear-gradient(135deg, #0a2656, #1a3a6e);"
            >
              {{ editing ? 'Update' : 'Publish' }}
            </button>
            <button
              *ngIf="editing"
              (click)="cancelEdit()"
              class="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- ───── Filters bar ───── -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Search -->
          <div class="flex-1 min-w-[200px]">
            <input autocomplete="off"
              id="news-search"
              name="filterSearch"
              [(ngModel)]="filterSearch"
              (ngModelChange)="onFilterChange()"
              type="text"
              placeholder="Search by title or body..."
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <!-- Category filter -->
          <select
            id="news-filter-category"
            name="filterCategory"
            [(ngModel)]="filterCategory"
            (ngModelChange)="onFilterChange()"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">All Categories</option>
            <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
          </select>
          <!-- Status filter -->
          <select
            id="news-filter-status"
            name="filterStatus"
            [(ngModel)]="filterStatus"
            (ngModelChange)="onFilterChange()"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>
          <!-- Total -->
          <span class="text-xs text-gray-500 font-medium">{{ total }} item{{ total !== 1 ? 's' : '' }}</span>
        </div>
      </div>

      <!-- ───── News list ───── -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">All News Items</h2>
        </div>

        <div *ngIf="loading" class="px-6 py-8 text-center text-gray-500">Loading...</div>

        <div *ngIf="!loading && !newsItems.length" class="px-6 py-8 text-center text-gray-400">
          No news items found.
        </div>

        <div *ngIf="!loading && newsItems.length" class="divide-y divide-gray-100">
          <div
            *ngFor="let item of newsItems"
            class="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors"
          >
            <!-- Thumbnail -->
            <div *ngIf="item.imageUrl" class="flex-shrink-0 hidden sm:block">
              <img *ngIf="!isPdf(item.imageUrl)" [src]="item.imageUrl" alt="" class="w-16 h-16 rounded-lg object-cover border border-gray-200" (error)="onImgError($event)" />
              <a *ngIf="isPdf(item.imageUrl)" [href]="item.imageUrl" target="_blank"
                 class="w-16 h-16 rounded-lg border border-gray-200 bg-red-50 flex items-center justify-center text-red-600 text-xs font-bold"
                 title="View PDF">PDF</a>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Pinned -->
                <span *ngIf="item.pinned" class="text-amber-500 text-sm" title="Pinned">📌</span>
                <!-- Title -->
                <h3 class="text-sm font-semibold text-gray-900 truncate">{{ item.title }}</h3>
                <!-- Category -->
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                  {{ item.category }}
                </span>
                <!-- Active/Inactive -->
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                  [class]="item.isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'"
                >
                  {{ item.isActive ? 'Active' : 'Inactive' }}
                </span>
                <!-- Expired -->
                <span
                  *ngIf="isExpired(item)"
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                >
                  Expired
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ item.createdAt | date:'medium' }}
                <span *ngIf="item.creator?.name"> &middot; by {{ item.creator?.name }}</span>
                <span *ngIf="item.expiresAt"> &middot; Expires {{ item.expiresAt | date:'MMM d, yyyy' }}</span>
              </p>
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{{ item.body }}</p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                (click)="togglePin(item)"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                [class]="item.pinned
                  ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'"
                [title]="item.pinned ? 'Unpin' : 'Pin to top'"
              >
                {{ item.pinned ? 'Unpin' : 'Pin' }}
              </button>
              <button
                (click)="toggleActive(item)"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                [class]="item.isActive
                  ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                  : 'border-green-300 text-green-700 hover:bg-green-50'"
              >
                {{ item.isActive ? 'Deactivate' : 'Activate' }}
              </button>
              <button
                (click)="startEdit(item)"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
              >
                Edit
              </button>
              <button
                (click)="deleteItem(item)"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div *ngIf="totalPages > 1" class="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span class="text-xs text-gray-500">Page {{ page }} of {{ totalPages }}</span>
          <div class="flex items-center gap-2">
            <button
              (click)="goPage(page - 1)"
              [disabled]="page <= 1"
              class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              (click)="goPage(page + 1)"
              [disabled]="page >= totalPages"
              class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `]
})
export class AdminNewsComponent implements OnInit {
  newsItems: NewsItem[] = [];
  loading = true;
  editing: NewsItem | null = null;
  categories = NEWS_CATEGORIES;

  form: {
    title: string;
    body: string;
    category: NewsCategory;
    pinned: boolean;
    expiresAt: string;
    imageUrl: string;
  } = { title: '', body: '', category: 'GENERAL', pinned: false, expiresAt: '', imageUrl: '' };

  filterSearch = '';
  filterCategory = '';
  filterStatus = 'all';
  uploadingImage = false;

  page = 1;
  limit = 20;
  total = 0;
  totalPages = 1;

  private debounceTimer: any;

  constructor(private newsService: NewsService) {}

  ngOnInit(): void {
    this.loadNews();
  }

  loadNews(): void {
    this.loading = true;
    this.newsService
      .getAllNews({
        page: this.page,
        limit: this.limit,
        search: this.filterSearch || undefined,
        category: this.filterCategory || undefined,
        status: this.filterStatus || undefined,
      })
      .subscribe({
        next: (res) => {
          this.newsItems = res.data;
          this.total = res.total;
          this.totalPages = Math.ceil(res.total / this.limit) || 1;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page = 1;
      this.loadNews();
    }, 350);
  }

  goPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.loadNews();
  }

  save(): void {
    if (!this.form.title?.trim() || !this.form.body?.trim()) return;

    const payload: CreateNewsPayload & { isActive?: boolean } = {
      title: this.form.title.trim(),
      body: this.form.body.trim(),
      category: this.form.category,
      pinned: this.form.pinned,
      expiresAt: this.form.expiresAt ? new Date(this.form.expiresAt).toISOString() : undefined,
      imageUrl: this.form.imageUrl?.trim() || undefined,
    };

    if (this.editing) {
      this.newsService
        .updateNews(this.editing.id, payload)
        .subscribe({ next: () => { this.cancelEdit(); this.loadNews(); } });
    } else {
      this.newsService
        .createNews(payload)
        .subscribe({ next: () => { this.resetForm(); this.loadNews(); } });
    }
  }

  startEdit(item: NewsItem): void {
    this.editing = item;
    this.form = {
      title: item.title,
      body: item.body,
      category: item.category,
      pinned: item.pinned,
      expiresAt: item.expiresAt ? item.expiresAt.substring(0, 10) : '',
      imageUrl: item.imageUrl || '',
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editing = null;
    this.resetForm();
  }

  toggleActive(item: NewsItem): void {
    this.newsService
      .updateNews(item.id, { isActive: !item.isActive })
      .subscribe({ next: () => this.loadNews() });
  }

  togglePin(item: NewsItem): void {
    this.newsService
      .updateNews(item.id, { pinned: !item.pinned })
      .subscribe({ next: () => this.loadNews() });
  }

  deleteItem(item: NewsItem): void {
    if (!confirm(`Delete "${item.title}"?`)) return;
    this.newsService.deleteNews(item.id).subscribe({ next: () => this.loadNews() });
  }

  isExpired(item: NewsItem): boolean {
    return !!item.expiresAt && new Date(item.expiresAt) <= new Date();
  }

  onImgError(event: Event): void {
    (event.target as HTMLElement).style.display = 'none';
  }

  isPdf(url: string): boolean {
    return url?.toLowerCase().endsWith('.pdf');
  }

  onImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File must be less than 5 MB');
      input.value = '';
      return;
    }
    this.uploadingImage = true;
    this.newsService.uploadNewsImage(file).subscribe({
      next: (res) => {
        this.form.imageUrl = res.imageUrl;
        this.uploadingImage = false;
        input.value = '';
      },
      error: () => {
        alert('Image upload failed. Please try again.');
        this.uploadingImage = false;
        input.value = '';
      },
    });
  }

  removeImage(): void {
    this.form.imageUrl = '';
  }

  private resetForm(): void {
    this.form = { title: '', body: '', category: 'GENERAL', pinned: false, expiresAt: '', imageUrl: '' };
  }
}
