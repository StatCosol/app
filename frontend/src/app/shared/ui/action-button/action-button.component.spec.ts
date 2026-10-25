import { page } from '@vitest/browser/context';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { ActionButtonComponent } from './action-button.component';

@Component({
  standalone: true,
  imports: [ActionButtonComponent, RouterModule],
  template: `
    <div style="width:140px"><ui-button id="long-action" icon="user-plus">Register Employee</ui-button></div>
    <ui-button id="sm" size="sm">Small</ui-button>
    <ui-button id="md">Default</ui-button>
    <ui-button id="lg" size="lg">Large</ui-button>
    <ui-button id="scoped" [routerLink]="['/auditor/observations']" [queryParams]="{ auditId: 'audit-b' }">View</ui-button>
    <ui-button id="disabled-link" [routerLink]="['/auditor/observations']" [queryParams]="{ auditId: 'audit-b' }" [disabled]="true">Disabled</ui-button>
  `,
})
class HostComponent {}

describe('ActionButtonComponent sizes', () => {
  function classesOf(id: string): string[] {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(`#${id} button`) as HTMLButtonElement;
    return button.className.split(/\s+/);
  }

  // The host is a .bs-surface: without Bootstrap's own size class, `.bs-surface .btn`
  // padding wins and every size renders full-size.
  it('adds btn-sm for small buttons', () => {
    expect(classesOf('sm')).toContain('btn-sm');
  });

  it('adds no Bootstrap size class for the default size', () => {
    const classes = classesOf('md');
    expect(classes).not.toContain('btn-sm');
    expect(classes).not.toContain('btn-lg');
  });

  it('adds btn-lg for large buttons', () => {
    expect(classesOf('lg')).toContain('btn-lg');
  });

  it('preserves the audit scope on the clickable link and keeps disabled links inactive', () => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#scoped a').getAttribute('href')).toBe('/auditor/observations?auditId=audit-b');
    expect(fixture.nativeElement.querySelector('#disabled-link a').hasAttribute('href')).toBe(false);
  });
});

describe('Form action labels in narrow containers', () => {
  it.each([390, 768, 1280])('keeps the action readable and inside its container at %s', async width => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({imports:[HostComponent],providers:[provideRouter([])]}).compileComponents();
    const fixture=TestBed.createComponent(HostComponent); fixture.detectChanges();
    const host=fixture.nativeElement.querySelector('#long-action') as HTMLElement;
    const button=host.querySelector('button')!;
    expect(host.getBoundingClientRect().width).toBeLessThanOrEqual(140);
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth+1);
    expect(button.querySelector('.action-label-hidden')).toBeNull();
    expect(button.textContent).toContain('Register Employee');
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
