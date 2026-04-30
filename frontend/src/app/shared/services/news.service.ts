import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type NewsCategory = 'GENERAL' | 'COMPLIANCE' | 'HR' | 'PAYROLL' | 'ANNOUNCEMENT';
export const NEWS_CATEGORIES: NewsCategory[] = ['GENERAL', 'COMPLIANCE', 'HR', 'PAYROLL', 'ANNOUNCEMENT'];

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  category: NewsCategory;
  pinned: boolean;
  isActive: boolean;
  expiresAt: string | null;
  imageUrl: string | null;
  createdBy: string;
  creator?: { id: string; name: string };
  updatedBy: string | null;
  updater?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface NewsPaginated {
  data: NewsItem[];
  total: number;
  page: number;
  limit: number;
}

export interface NewsAdminQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: string;
}

export interface CreateNewsPayload {
  title: string;
  body: string;
  category?: NewsCategory;
  pinned?: boolean;
  expiresAt?: string;
  imageUrl?: string;
}

export interface UpdateNewsPayload extends Partial<CreateNewsPayload> {
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NewsService {
  constructor(private http: HttpClient) {}

  /** Active news for ticker / public display */
  getActiveNews(): Observable<NewsItem[]> {
    return this.http.get<NewsItem[]>('/api/v1/news');
  }

  /** Single news item */
  getNewsItem(id: string): Observable<NewsItem> {
    return this.http.get<NewsItem>(`/api/v1/news/${encodeURIComponent(id)}`);
  }

  /** Admin: paginated list with filters */
  getAllNews(query: NewsAdminQuery = {}): Observable<NewsPaginated> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.search) params = params.set('search', query.search);
    if (query.category) params = params.set('category', query.category);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<NewsPaginated>('/api/v1/news/admin/all', { params });
  }

  /** Admin: create */
  createNews(data: CreateNewsPayload): Observable<NewsItem> {
    return this.http.post<NewsItem>('/api/v1/news', data);
  }

  /** Admin: upload news image */
  uploadNewsImage(file: File): Observable<{ imageUrl: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ imageUrl: string }>('/api/v1/news/upload-image', fd);
  }

  /** Admin: update */
  updateNews(id: string, data: UpdateNewsPayload): Observable<NewsItem> {
    return this.http.patch<NewsItem>(`/api/v1/news/${encodeURIComponent(id)}`, data);
  }

  /** Admin: delete */
  deleteNews(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/v1/news/${encodeURIComponent(id)}`);
  }
}
