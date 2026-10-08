import { Observable, Subscription, finalize } from 'rxjs';

/** Cancel obsolete list requests before changing assignment or wage period. */
export class ClraListState<T> {
  rows: T[] = [];
  loading = false;
  error = '';
  private request?: Subscription;

  constructor(private readonly changed: () => void) {}

  reset(): void {
    this.request?.unsubscribe();
    this.request = undefined;
    this.rows = [];
    this.loading = false;
    this.error = '';
    this.changed();
  }

  load(source: Observable<T[]>, label: string): void {
    this.reset();
    this.loading = true;
    this.changed();
    this.request = source.pipe(finalize(() => {
      this.loading = false;
      this.changed();
    })).subscribe({
      next: rows => { this.rows = rows || []; this.changed(); },
      error: () => {
        this.error = `Could not load ${label}. Please retry.`;
        this.changed();
      },
    });
  }
}
