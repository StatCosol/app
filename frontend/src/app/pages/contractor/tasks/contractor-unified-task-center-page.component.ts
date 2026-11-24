import { Component, ViewChild } from '@angular/core';
import { ContractorTasksComponent } from './contractor-tasks.component';

@Component({
  standalone: true,
  selector: 'app-contractor-unified-task-center-page',
  imports: [ContractorTasksComponent],
  template: `<app-contractor-tasks></app-contractor-tasks>`,
})
export class ContractorUnifiedTaskCenterPageComponent {
  @ViewChild(ContractorTasksComponent) tasks?: ContractorTasksComponent;
  canLeave(): boolean {
    return !this.tasks?.auditDocUploading && !this.tasks?.actionBusy;
  }
}

