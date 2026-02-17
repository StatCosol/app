import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface Breadcrumb {
  label: string;
  route?: string;
}

@Component({
  selector: 'ui-page-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="mb-6">
      <!-- Breadcrumbs -->
      <nav *ngIf="breadcrumbs.length" class="flex mb-3" aria-label="Breadcrumb">
        <ol class="inline-flex items-center space-x-1 md:space-x-2">
          <li *ngFor="let crumb of breadcrumbs; let last = last" class="inline-flex items-center">
            <ng-container *ngIf="!last && crumb.route">
              <a [routerLink]="crumb.route"
                 class="inline-flex items-center text-sm font-medium text-gray-500 hover:text-statco-blue transition-colors">
                {{ crumb.label }}
              </a>
              <svg class="w-4 h-4 mx-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
              </svg>
            </ng-container>
            <ng-container *ngIf="!last && !crumb.route">
              <span class="text-sm font-medium text-gray-500">{{ crumb.label }}</span>
              <svg class="w-4 h-4 mx-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
              </svg>
            </ng-container>
            <span *ngIf="last" class="text-sm font-medium text-gray-900">{{ crumb.label }}</span>
          </li>
        </ol>
      </nav>

      <!-- Header Row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 tracking-tight">{{ title }}</h1>
          <p *ngIf="subtitle" class="mt-1 text-sm text-gray-500">{{ subtitle }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() breadcrumbs: Breadcrumb[] = [];
}
