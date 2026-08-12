import { Component } from '@angular/core';

@Component({
  selector: 'app-statco-wordmark',
  standalone: true,
  template: `
    <img
      src="assets/images/statco-wordmark.svg"
      alt="StatCo Solutions"
      class="wordmark"
    />
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      flex: 0 1 auto;
      min-width: 0;
    }

    .wordmark {
      display: block;
      width: 190px;
      height: 48px;
      object-fit: contain;
      object-position: left center;
    }

    @media (max-width: 639px) {
      .wordmark {
        width: 132px;
        height: 42px;
      }
    }
  `],
})
export class StatcoWordmarkComponent {}
