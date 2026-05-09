import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NewsService, NewsItem } from '../../shared/services/news.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-news-ticker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="newsItems.length" class="news-ticker-bar">
      <div class="ticker-label" (click)="openAllNews()" style="cursor:pointer">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <span>Latest News</span>
        <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </div>
      <div class="ticker-track">
        <div class="ticker-scroll" [style.animation-duration]="scrollDuration">
          <ng-container *ngFor="let item of doubledItems; let i = index">
            <span
              class="ticker-item"
              (click)="openNews(newsItems[i % newsItems.length])"
              [title]="item.title"
            >
              {{ item.title }}
            </span>
            <span class="ticker-separator">•</span>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .news-ticker-bar {
      display: flex;
      align-items: center;
      background: linear-gradient(135deg, #0a2656, #144B7A);
      color: #fff;
      overflow: hidden;
      height: 36px;
      font-size: 0.8125rem;
      position: relative;
      z-index: 39;
    }

    .ticker-label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px;
      background: rgba(0,0,0,0.25);
      height: 100%;
      white-space: nowrap;
      font-weight: 600;
      letter-spacing: 0.025em;
      flex-shrink: 0;
    }

    .ticker-track {
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .ticker-scroll {
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      animation: ticker-move linear infinite;
    }

    .ticker-item {
      cursor: pointer;
      padding: 0 8px;
      transition: color 0.2s;
    }
    .ticker-item:hover {
      color: #60a5fa;
      text-decoration: underline;
    }

    .ticker-separator {
      opacity: 0.4;
      padding: 0 4px;
    }

    @keyframes ticker-move {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
  `]
})
export class NewsTickerComponent implements OnInit, OnDestroy {
  newsItems: NewsItem[] = [];
  doubledItems: NewsItem[] = [];
  scrollDuration = '20s';

  private destroy$ = new Subject<void>();

  constructor(
    private newsService: NewsService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.newsService.getActiveNews()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.newsItems = items;
          // Double the items so the scroll loops seamlessly
          this.doubledItems = [...items, ...items];
          // Scale duration by number of items (approx 5s per item)
          this.scrollDuration = Math.max(10, items.length * 5) + 's';
        },
      });
  }

  openNews(item: NewsItem): void {
    // Navigate to news detail within the current portal
    const url = this.router.url;
    let portalBase = '/';
    if (url.startsWith('/contractor')) portalBase = '/contractor';
    else if (url.startsWith('/client')) portalBase = '/client';
    else if (url.startsWith('/branch')) portalBase = '/branch';

    this.router.navigate([portalBase, 'news', item.id]);
  }

  openAllNews(): void {
    const url = this.router.url;
    let portalBase = '/';
    if (url.startsWith('/contractor')) portalBase = '/contractor';
    else if (url.startsWith('/client')) portalBase = '/client';
    else if (url.startsWith('/branch')) portalBase = '/branch';
    this.router.navigate([portalBase, 'news']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
