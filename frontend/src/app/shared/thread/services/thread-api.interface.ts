import { Observable } from 'rxjs';
import { PageRes } from '../../models/paging.model';
import { ThreadDetail, ThreadFilters, ThreadListItem } from '../models/thread.model';

/**
 * Pluggable API interface for the shared Thread UI system.
 * Each module implements this with its own endpoints.
 */
export interface ThreadApi {
  /** List threads with optional filters + paging */
  list(filters: ThreadFilters): Observable<PageRes<ThreadListItem>>;

  /** Read a single thread with all messages */
  read(id: string): Observable<ThreadDetail>;

  /** Reply to a thread — supports file attachments */
  reply(id: string, message: string, files?: File[]): Observable<any>;

  /** Close a thread (optional — hide Close button if absent) */
  close?(id: string): Observable<any>;

  /** Resolve a thread (optional) */
  resolve?(id: string): Observable<any>;

  /** Reopen a closed thread (optional) */
  reopen?(id: string): Observable<any>;
}
