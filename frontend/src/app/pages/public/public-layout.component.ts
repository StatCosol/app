
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="top-header">
      <div class="logo-block">
        <svg xmlns="http://www.w3.org/2000/svg" width="480" height="80" viewBox="0 0 520 110" role="img" aria-label="StatCo Solutions">
          <circle cx="55" cy="55" r="30" fill="#01A2EB"/>
          <circle cx="90" cy="55" r="30" fill="#02256C"/>
          <rect x="130" y="22" width="5" height="66" fill="#000000"/>
          <text x="150" y="68" font-family="Times New Roman, Georgia, serif" font-size="40" font-weight="700" fill="#02256C">StatCo Solutions</text>
        </svg>
      </div>
      <div class="contact-block">
        <span class="contact-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#02256C" viewBox="0 0 24 24" class="contact-icon"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 2v.01L12 13 4 6.01V6h16zM4 20V8.99l8 7 8-7V20H4z"/></svg>
          <a href="mailto:compliance@statcosol.com">compliance@statcosol.com</a>
        </span>
        <span class="contact-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#02256C" viewBox="0 0 24 24" class="contact-icon"><path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.21c1.21.49 2.53.76 3.88.76a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.35.26 2.67.76 3.88a1 1 0 01-.21 1.11l-2.2 2.2z"/></svg>
          <a href="tel:+919000607839">+91 9000607839</a>
        </span>
      </div>
    </div>
    <div class="public-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./public-layout.component.scss']
})
export class PublicLayoutComponent {}
