import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, finalize, timeout } from 'rxjs';
import { NewsService, NewsItem } from '../../shared/services/news.service';

@Component({
  selector: 'app-news-detail',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <!-- ============== LOADING STATE ============== -->
    <div *ngIf="loading" class="flex items-center justify-center min-h-[60vh]">
      <div class="flex flex-col items-center gap-3">
        <div class="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <span class="text-sm text-gray-400 font-medium">Loading news&hellip;</span>
      </div>
    </div>

    <!-- ============== MAIN CONTENT ============== -->
    <div *ngIf="!loading" class="news-page">

      <!-- ── Hero header ── -->
      <div class="hero-banner">
        <div class="hero-inner">
          <button (click)="goBack()" class="back-btn group">
            <svg class="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            <span>Back to Dashboard</span>
          </button>

          <div class="hero-title-row">
            <div class="hero-icon-wrapper">
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">Latest News</h1>
              <p class="text-blue-200 text-sm mt-0.5">Stay updated with the latest announcements</p>
            </div>
          </div>
        </div>
        <!-- Decorative wave -->
        <svg class="hero-wave" viewBox="0 0 1440 60" preserveAspectRatio="none">
          <path d="M0,0 C360,50 1080,50 1440,0 L1440,60 L0,60 Z" fill="currentColor"/>
        </svg>
      </div>

      <!-- ── Single article view (when opened from ticker with newsId) ── -->
      <div *ngIf="selectedItem" class="max-w-4xl mx-auto px-4 sm:px-6 pb-10 -mt-4">
        <article class="article-card article-card--featured animate-rise">
          <div class="article-accent"></div>
          <!-- Image banner -->
          <img *ngIf="selectedItem.imageUrl && !isPdf(selectedItem.imageUrl)" [src]="selectedItem.imageUrl" alt="" class="w-full h-52 object-cover" (error)="onImgError($event)" />
          <a *ngIf="selectedItem.imageUrl && isPdf(selectedItem.imageUrl)" [href]="selectedItem.imageUrl" target="_blank"
             class="flex items-center gap-2 px-6 py-4 bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition-colors">
            📄 View attached PDF
          </a>
          <div class="p-6 sm:p-8">
            <div class="flex items-center gap-3 mb-4 flex-wrap">
              <span *ngIf="selectedItem.pinned" class="pinned-badge">📌 Pinned</span>
              <span class="category-chip" [attr.data-cat]="selectedItem.category">{{ selectedItem.category }}</span>
              <span class="date-chip">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {{ selectedItem.createdAt | date:'MMMM d, yyyy' }}
              </span>
              <span class="new-badge" *ngIf="isRecent(selectedItem)">NEW</span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug mb-1">
              {{ selectedItem.title }}
            </h2>
            <p *ngIf="selectedItem.creator?.name" class="text-sm text-gray-400 mb-4">By {{ selectedItem.creator?.name }}</p>
            <div class="article-divider"></div>
            <div class="text-gray-700 leading-relaxed whitespace-pre-wrap text-base sm:text-lg">
              {{ selectedItem.body }}
            </div>
          </div>
        </article>

        <!-- Other news below -->
        <div *ngIf="otherItems.length" class="mt-10">
          <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
            </svg>
            More News
          </h3>
          <div class="news-grid">
            <article
              *ngFor="let n of otherItems; let i = index"
              class="article-card article-card--grid animate-rise cursor-pointer"
              [style.animation-delay]="(i * 80) + 'ms'"
              (click)="selectItem(n)"
            >
              <div class="article-accent" [style.background]="accentColors[i % accentColors.length]"></div>
              <img *ngIf="n.imageUrl && !isPdf(n.imageUrl)" [src]="n.imageUrl" alt="" class="w-full h-36 object-cover" (error)="onImgError($event)" />
              <div *ngIf="n.imageUrl && isPdf(n.imageUrl)" class="w-full h-36 bg-red-50 flex items-center justify-center text-red-600 font-bold">📄 PDF</div>
              <div class="p-5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span *ngIf="n.pinned" class="text-amber-500 text-xs">📌</span>
                  <span class="category-chip category-chip--sm" [attr.data-cat]="n.category">{{ n.category }}</span>
                  <span class="date-chip date-chip--sm">
                    {{ n.createdAt | date:'MMM d, yyyy' }}
                  </span>
                  <span class="new-badge ml-1" *ngIf="isRecent(n)">NEW</span>
                </div>
                <h4 class="text-base font-semibold text-gray-900 mt-2.5 leading-snug line-clamp-2">{{ n.title }}</h4>
                <p class="text-sm text-gray-500 mt-2 line-clamp-3">{{ n.body }}</p>
                <span class="read-more">
                  Read more
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>

      <!-- ── All-news listing (when no specific newsId) ── -->
      <div *ngIf="!selectedItem && allItems.length" class="max-w-5xl mx-auto px-4 sm:px-6 pb-10 -mt-4">
        <!-- Featured (first item) -->
        <article
          class="article-card article-card--featured animate-rise cursor-pointer"
          (click)="selectItem(allItems[0])"
        >
          <div class="article-accent"></div>
          <img *ngIf="allItems[0].imageUrl && !isPdf(allItems[0].imageUrl)" [src]="allItems[0].imageUrl" alt="" class="w-full h-56 object-cover" (error)="onImgError($event)" />
            <a *ngIf="allItems[0].imageUrl && isPdf(allItems[0].imageUrl)" [href]="allItems[0].imageUrl" target="_blank"
               class="flex items-center gap-2 px-5 py-3 bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition-colors">
              📄 View attached PDF
            </a>
          <div class="p-6 sm:p-8">
            <div class="flex items-center gap-3 mb-3 flex-wrap">
              <span class="featured-label">FEATURED</span>
              <span *ngIf="allItems[0].pinned" class="pinned-badge">📌 Pinned</span>
              <span class="category-chip" [attr.data-cat]="allItems[0].category">{{ allItems[0].category }}</span>
              <span class="date-chip">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {{ allItems[0].createdAt | date:'MMMM d, yyyy' }}
              </span>
              <span class="new-badge" *ngIf="isRecent(allItems[0])">NEW</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-bold text-gray-900 leading-snug mb-2">{{ allItems[0].title }}</h2>
            <p *ngIf="allItems[0].creator?.name" class="text-sm text-gray-400 mb-1">By {{ allItems[0].creator?.name }}</p>
            <p class="text-gray-600 leading-relaxed line-clamp-4">{{ allItems[0].body }}</p>
            <span class="read-more read-more--lg">
              Read full article
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </article>

        <!-- Grid of remaining news -->
        <div *ngIf="allItems.length > 1" class="news-grid mt-8">
          <article
            *ngFor="let n of allItems.slice(1); let i = index"
            class="article-card article-card--grid animate-rise cursor-pointer"
            [style.animation-delay]="(i * 80) + 'ms'"
            (click)="selectItem(n)"
          >
            <div class="article-accent" [style.background]="accentColors[i % accentColors.length]"></div>
            <img *ngIf="n.imageUrl && !isPdf(n.imageUrl)" [src]="n.imageUrl" alt="" class="w-full h-36 object-cover" (error)="onImgError($event)" />
            <div *ngIf="n.imageUrl && isPdf(n.imageUrl)" class="w-full h-36 bg-red-50 flex items-center justify-center text-red-600 font-bold">📄 PDF</div>
            <div class="p-5">
              <div class="flex items-center gap-2 flex-wrap">
                <span *ngIf="n.pinned" class="text-amber-500 text-xs">📌</span>
                <span class="category-chip category-chip--sm" [attr.data-cat]="n.category">{{ n.category }}</span>
                <span class="date-chip date-chip--sm">
                  {{ n.createdAt | date:'MMM d, yyyy' }}
                </span>
                <span class="new-badge ml-1" *ngIf="isRecent(n)">NEW</span>
              </div>
              <h4 class="text-base font-semibold text-gray-900 mt-2.5 leading-snug line-clamp-2">{{ n.title }}</h4>
              <p class="text-sm text-gray-500 mt-2 line-clamp-3">{{ n.body }}</p>
              <span class="read-more">
                Read more
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </span>
            </div>
          </article>
        </div>
      </div>

      <!-- ── Empty state ── -->
      <div *ngIf="!selectedItem && !allItems.length" class="max-w-md mx-auto text-center py-20 px-4">
        <div class="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <svg class="w-10 h-10 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-700">No News Yet</h3>
        <p class="text-gray-400 mt-2 text-sm">Check back later for the latest announcements.</p>
      </div>

    </div>
  `,
  styles: [`
    /* ── Page ── */
    .news-page {
      min-height: calc(100vh - 120px);
      background: linear-gradient(180deg, transparent 0%, #f8fafc 10%);
    }

    /* ── Hero Banner ── */
    .hero-banner {
      background: linear-gradient(135deg, #0a2656 0%, #144B7A 50%, #1a6fb5 100%);
      padding: 2rem 1.5rem 3.5rem;
      position: relative;
    }
    .hero-inner {
      max-width: 72rem;
      margin: 0 auto;
    }
    .hero-wave {
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 100%;
      height: 28px;
      color: #f8fafc;
    }
    .hero-title-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
    }
    .hero-icon-wrapper {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.15);
    }

    /* ── Back button ── */
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgba(255,255,255,0.7);
      transition: color 0.2s;
      background: none;
      border: none;
      cursor: pointer;
    }
    .back-btn:hover { color: #fff; }

    /* ── Article cards ── */
    .article-card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.04);
      overflow: hidden;
      position: relative;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }
    .article-card--featured {
      border: 1px solid rgba(10,38,86,0.08);
    }
    .article-card--grid:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
    }
    .article-accent {
      height: 4px;
      background: linear-gradient(90deg, #0a2656, #2980d9);
    }

    /* ── Grid ── */
    .news-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.25rem;
    }
    @media (max-width: 640px) {
      .news-grid { grid-template-columns: 1fr; }
    }

    /* ── Badges & chips ── */
    .date-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: #64748b;
      background: #f1f5f9;
    }
    .date-chip--sm { font-size: 0.6875rem; padding: 3px 8px; }

    .new-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #fff;
      background: linear-gradient(135deg, #ef4444, #f97316);
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .featured-label {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #0a2656;
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    }

    /* ── Read-more link ── */
    .read-more {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 0.75rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #2563eb;
      transition: gap 0.2s;
    }
    .read-more:hover { gap: 8px; }
    .read-more--lg { font-size: 0.875rem; margin-top: 1rem; }

    /* ── Divider ── */
    .article-divider {
      height: 3px;
      width: 50px;
      border-radius: 3px;
      background: linear-gradient(90deg, #0a2656, #2980d9);
      margin-bottom: 1.25rem;
    }

    /* ── Category chips ── */
    .category-chip {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      background: #e0f2fe;
      color: #0369a1;
    }
    .category-chip[data-cat="COMPLIANCE"] { background: #dcfce7; color: #15803d; }
    .category-chip[data-cat="HR"]         { background: #fce7f3; color: #be185d; }
    .category-chip[data-cat="PAYROLL"]    { background: #fef3c7; color: #b45309; }
    .category-chip[data-cat="ANNOUNCEMENT"] { background: #ede9fe; color: #7c3aed; }
    .category-chip--sm { font-size: 0.625rem; padding: 2px 7px; }

    /* ── Pinned badge ── */
    .pinned-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;
    }

    /* ── Clamp ── */
    .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .line-clamp-4 { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }

    /* ── Animations ── */
    .animate-rise {
      opacity: 0;
      transform: translateY(16px);
      animation: rise 0.5s ease forwards;
    }
    @keyframes rise {
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
      50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }
  `]
})
export class NewsDetailComponent implements OnInit, OnDestroy {
  loading = true;
  selectedItem: NewsItem | null = null;
  allItems: NewsItem[] = [];
  otherItems: NewsItem[] = [];
  private destroy$ = new Subject<void>();

  accentColors = [
    'linear-gradient(90deg, #0a2656, #2980d9)',
    'linear-gradient(90deg, #065f46, #10b981)',
    'linear-gradient(90deg, #7c3aed, #a78bfa)',
    'linear-gradient(90deg, #b45309, #f59e0b)',
    'linear-gradient(90deg, #be123c, #fb7185)',
    'linear-gradient(90deg, #0e7490, #22d3ee)',
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private newsService: NewsService,
    private location: Location,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const newsId = this.route.snapshot.paramMap.get('newsId');

    // Always load all active news
    this.newsService.getActiveNews().pipe(
      timeout(15000),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (items) => {
        this.allItems = items;

        if (newsId) {
          // If a specific item was clicked from the ticker
          this.selectedItem = items.find(i => i.id === newsId) || null;
          this.otherItems = items.filter(i => i.id !== newsId);

          // If not in the active list, fetch it directly
          if (!this.selectedItem) {
            this.newsService.getNewsItem(newsId).pipe(
              timeout(15000),
              takeUntil(this.destroy$),
              finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
            ).subscribe({
              next: (item) => {
                this.selectedItem = item;
                this.otherItems = items;
                this.cdr.markForCheck();
              },
            });
            return;
          }
        }
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectItem(item: NewsItem): void {
    this.selectedItem = item;
    this.otherItems = this.allItems.filter(i => i.id !== item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  isRecent(item: NewsItem): boolean {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    return new Date(item.createdAt).getTime() > twoDaysAgo;
  }

  onImgError(event: Event): void {
    (event.target as HTMLElement).style.display = 'none';
  }

  isPdf(url: string): boolean {
    return url?.toLowerCase().endsWith('.pdf');
  }

  goBack(): void {
    this.location.back();
  }
}
