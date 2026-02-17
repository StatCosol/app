import { Routes } from '@angular/router';
import { branchPortalGuard } from '../../core/branch-portal.guard';

const BranchLayoutComponent = () =>
  import('./branch-layout/branch-layout.component').then((m) => m.BranchLayoutComponent);
const BranchDashboardComponent = () =>
  import('./branch-dashboard.component').then((m) => m.BranchDashboardComponent);
const BranchMcdUploadsComponent = () =>
  import('../client/compliance/client-mcd-uploads.component').then((m) => m.ClientMcdUploadsComponent);
const BranchReturnsComponent = () =>
  import('../client/compliance/client-returns.component').then((m) => m.ClientReturnsComponent);

export const BRANCH_ROUTES: Routes = [
  {
    path: 'branch',
    loadComponent: BranchLayoutComponent,
    canActivate: [branchPortalGuard],
    children: [
      { path: 'dashboard', loadComponent: BranchDashboardComponent },
      { path: 'mcd', loadComponent: BranchMcdUploadsComponent },
      { path: 'returns', loadComponent: BranchReturnsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];
