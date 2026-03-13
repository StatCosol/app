import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <h1 class="text-6xl font-bold text-red-500 mb-4">403</h1>
        <p class="text-xl text-gray-600 mb-6">You are not authorized to view this page.</p>
        <a routerLink="/login" class="text-indigo-600 hover:text-indigo-800 font-medium">
          Back to Login
        </a>
      </div>
    </div>
  `,
})
export class UnauthorizedComponent {}
