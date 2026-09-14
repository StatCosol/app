import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  standalone: true,
  imports: [StatusBadgeComponent],
  template: `
    <ui-status-badge id="projected" variant="success">Active</ui-status-badge>
    <ui-status-badge id="status" status="IN_PROGRESS">ignored text</ui-status-badge>
    <ui-status-badge id="label" variant="info" label="3 / 42">ignored text</ui-status-badge>
    <ui-status-badge id="empty" variant="gray"></ui-status-badge>
  `,
})
class HostComponent {}

describe('StatusBadgeComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const text = (id: string) =>
      (fixture.nativeElement.querySelector(`#${id}`) as HTMLElement).textContent?.trim();
    return { text };
  }

  it('shows text placed between the tags when no status or label is given', () => {
    // Admin screens pass only a variant; the badge used to render an empty pill.
    expect(render().text('projected')).toBe('Active');
  });

  it('keeps the status label ahead of any inner text', () => {
    expect(render().text('status')).toBe('In Progress');
  });

  it('keeps an explicit label ahead of any inner text', () => {
    expect(render().text('label')).toBe('3 / 42');
  });

  it('renders nothing inside a badge with no status, label or text', () => {
    expect(render().text('empty')).toBe('');
  });
});
