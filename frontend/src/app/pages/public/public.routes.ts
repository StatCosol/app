import { Routes } from '@angular/router';

const PublicLayoutComponent = () =>
  import('./public-layout.component').then((m) => m.PublicLayoutComponent);
// Import your public page components here
// import { HomeComponent } from './home/home.component';
// import { AboutComponent } from './about/about.component';
// ...

export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: PublicLayoutComponent,
    children: [
      // { path: '', component: HomeComponent },
      // { path: 'about', component: AboutComponent },
      // { path: 'services', component: ServicesComponent },
      // { path: 'contact', component: ContactComponent },
      // { path: 'blog', component: BlogComponent },
      // { path: 'support', component: SupportComponent },
      // etc.
    ],
  },
];
