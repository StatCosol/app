import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-sales-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl mx-auto space-y-5">
      <h2 class="text-2xl font-bold text-gray-900">My Profile</h2>
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div *ngIf="!user" class="text-gray-500 text-sm">Loading…</div>
        <dl *ngIf="user" class="text-sm divide-y divide-gray-100">
          <div class="py-2 grid grid-cols-3 gap-2"><dt class="text-gray-500">Name</dt><dd class="col-span-2 text-gray-900 font-medium">{{ user.name }}</dd></div>
          <div class="py-2 grid grid-cols-3 gap-2"><dt class="text-gray-500">Email</dt><dd class="col-span-2">{{ user.email }}</dd></div>
          <div class="py-2 grid grid-cols-3 gap-2"><dt class="text-gray-500">Role</dt><dd class="col-span-2">{{ user.roleCode }}</dd></div>
        </dl>
      </div>
    </div>
  `,
})
export class SalesProfileComponent implements OnInit {
  user: any = null;
  constructor(private auth: AuthService) {}
  ngOnInit(): void {
    this.user = this.auth.getUser();
    this.auth.fetchMe().subscribe((u) => (this.user = u || this.user));
  }
}
