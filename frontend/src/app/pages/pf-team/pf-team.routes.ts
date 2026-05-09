import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const PfTeamLayoutComponent = () =>
  import('./pf-team-layout/pf-team-layout.component').then((m) => m.PfTeamLayoutComponent);
const PfTeamDashboardComponent = () =>
  import('./dashboard/pf-team-dashboard.component').then((m) => m.PfTeamDashboardComponent);
const PfTeamTicketsComponent = () =>
  import('./tickets/pf-team-tickets.component').then((m) => m.PfTeamTicketsComponent);
const PfTeamTicketDetailComponent = () =>
  import('./tickets/pf-team-ticket-detail.component').then((m) => m.PfTeamTicketDetailComponent);

export const PF_TEAM_ROUTES: Routes = [
  {
    path: 'pf-team',
    loadComponent: PfTeamLayoutComponent,
    canActivate: [roleGuard(['PF_TEAM'])],
    children: [
      { path: 'dashboard', loadComponent: PfTeamDashboardComponent },
      { path: 'tickets', loadComponent: PfTeamTicketsComponent },
      { path: 'tickets/:id', loadComponent: PfTeamTicketDetailComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];
