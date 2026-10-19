import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-news-body',
  standalone: true,
  template: `<div class="whitespace-pre-wrap break-words">@for (part of parts; track $index) {@if (part.url) {<a [href]="part.url" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline">{{ part.text }}</a>} @else {<span>{{ part.text }}</span>}}</div>`,
})
export class NewsBodyComponent {
  parts: Array<{ text: string; url?: string }> = [];

  @Input() set body(value: string) {
    let text = value || '';
    if (text.startsWith('An automated compliance monitor detected a new update on ')) {
      const source = text.split('\n').find(line => line.startsWith('Official source:'));
      text = 'This older notice recorded a website change only. No specific notification details were captured.' + (source ? '\n\n' + source : '');
    }
    this.parts = text.split(/(https?:\/\/[^\s<>"\u0027]+)/g).filter(Boolean).map(part => {
      if (!/^https?:\/\//i.test(part)) return { text: part };
      try {
        const url = new URL(part);
        if (url.username || url.password) return { text: part };
        return { text: part, url: url.href };
      } catch { return { text: part }; }
    });
  }
}
