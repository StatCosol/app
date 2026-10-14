import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { BranchInternsComponent } from '../../branch/branch-interns/branch-interns.component';
@Component({
  standalone: true,
  selector: 'app-client-interns',
  imports: [BranchInternsComponent],
  template: `
    @if (error) {
      <p role="alert" class="p-4 text-red-700">
        {{ error }} <button type="button" (click)="loadBranches()">Retry</button>
      </p>
    }
    <app-branch-interns [clientMode]="true" [branches]="branches" />
  `,
})
export class ClientInternsComponent implements OnInit, OnDestroy {
  branches: { id: string; name: string }[] = [];
  error = '';
  private destroy$ = new Subject<void>();
  constructor(private branchService: ClientBranchesService) {}
  ngOnInit(): void {
    this.loadBranches();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  loadBranches(): void {
    this.error = '';
    this.branchService
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) =>
          (this.branches = rows.map((b) => ({
            id: b.id,
            name:
              b.branchName || b.branchname || b.name || b.branchCode || 'Branch name unavailable',
          }))),
        error: () => (this.error = 'Unable to load branch names.'),
      });
  }
}
