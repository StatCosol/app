import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  ClraApiService,
  ClraAssignment,
  ClraAttendance,
  ClraContractor,
  ClraDeployment,
  ClraWage,
  ClraWagePeriod,
  ClraWorker,
  ClraRegisterRun,
  CreateDeploymentPayload,
  CreateWagePeriodPayload,
  UpsertAttendancePayload,
  UpsertWagePayload,
} from '../../../core/clra-api.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';

type DetailTab = 'deployments' | 'wage-periods' | 'attendance' | 'wages' | 'registers';

@Component({
  selector: 'app-crm-clra-assignment-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-900">{{ assignment.assignmentCode }}</h3>
            <p class="text-xs text-gray-500 mt-0.5">
              {{ assignment.natureOfWork }} · {{ assignment.stateCode }} · {{ assignment.status || 'ACTIVE' }}
            </p>
          </div>
          <div class="flex gap-1">
            @for (t of detailTabs; track t.id) {
              <button
                type="button"
                class="px-3 py-1.5 text-xs font-medium rounded-lg"
                [class.bg-emerald-600]="detailTab === t.id"
                [class.text-white]="detailTab === t.id"
                [class.text-gray-600]="detailTab !== t.id"
                [class.hover:bg-gray-100]="detailTab !== t.id"
                (click)="setDetailTab(t.id)">
                {{ t.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <div class="p-5">
        @if (loading) {
          <ui-loading-spinner size="sm" />
        }

        @if (!loading && detailTab === 'deployments') {
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-600">{{ deployments.length }} deployment(s)</span>
            <ui-button variant="primary" (clicked)="openDeploymentForm()">+ Add Deployment</ui-button>
          </div>
          @if (!deployments.length) {
            <ui-empty-state message="No worker deployments for this assignment." />
          } @else {
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500 border-b">
                    <th class="py-2 pr-4">Worker</th>
                    <th class="py-2 pr-4">Start</th>
                    <th class="py-2 pr-4">End</th>
                    <th class="py-2 pr-4">Rate/mo</th>
                    <th class="py-2 pr-4">Status</th>
                    <th class="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of deployments; track row.id) {
                    <tr class="border-b border-gray-50">
                      <td class="py-2 pr-4">{{ workerLabel(row.workerId) }}</td>
                      <td class="py-2 pr-4">{{ row.deploymentStart }}</td>
                      <td class="py-2 pr-4">{{ row.deploymentEnd || '—' }}</td>
                      <td class="py-2 pr-4">{{ row.ratePerMonth ?? '—' }}</td>
                      <td class="py-2 pr-4"><ui-status-badge [label]="row.status || 'ACTIVE'" /></td>
                      <td class="py-2">
                        <button class="text-brand-600 hover:underline text-xs" (click)="openDeploymentForm(row)">Edit</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        @if (!loading && detailTab === 'wage-periods') {
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-600">{{ wagePeriods.length }} wage period(s)</span>
            <ui-button variant="primary" (clicked)="openWagePeriodForm()">+ Add Wage Period</ui-button>
          </div>
          @if (!wagePeriods.length) {
            <ui-empty-state message="No wage periods yet." />
          } @else {
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500 border-b">
                    <th class="py-2 pr-4">Period</th>
                    <th class="py-2 pr-4">Month/Year</th>
                    <th class="py-2 pr-4">Status</th>
                    <th class="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of wagePeriods; track row.id) {
                    <tr class="border-b border-gray-50" [class.bg-emerald-50]="selectedWagePeriodId === row.id">
                      <td class="py-2 pr-4">{{ row.periodFrom }} → {{ row.periodTo }}</td>
                      <td class="py-2 pr-4">{{ row.wageMonth }}/{{ row.wageYear }}</td>
                      <td class="py-2 pr-4"><ui-status-badge [label]="row.status || 'OPEN'" /></td>
                      <td class="py-2 flex gap-2">
                        <button class="text-emerald-700 hover:underline text-xs" (click)="selectWagePeriod(row)">Manage</button>
                        @if (row.status !== 'CLOSED') {
                          <button class="text-amber-700 hover:underline text-xs" (click)="closePeriod(row)">Close</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (selectedWagePeriodId) {
              <p class="text-xs text-gray-500 mt-3">
                Selected period for attendance & wages. Switch to Attendance or Wages tab.
              </p>
            }
          }
        }

        @if (!loading && detailTab === 'attendance') {
          @if (!selectedWagePeriodId) {
            <ui-empty-state message="Select a wage period from the Wage Periods tab first." />
          } @else {
            <div class="flex justify-between items-center mb-3">
              <span class="text-sm text-gray-600">{{ attendance.length }} record(s)</span>
              <ui-button variant="primary" (clicked)="openAttendanceForm()">+ Add / Update</ui-button>
            </div>
            @if (!attendance.length) {
              <ui-empty-state message="No attendance records for this period." />
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500 border-b">
                      <th class="py-2 pr-4">Date</th>
                      <th class="py-2 pr-4">Worker</th>
                      <th class="py-2 pr-4">Status</th>
                      <th class="py-2 pr-4">Hours</th>
                      <th class="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of attendance; track row.id) {
                      <tr class="border-b border-gray-50">
                        <td class="py-2 pr-4">{{ row.attendanceDate }}</td>
                        <td class="py-2 pr-4">{{ deploymentWorkerLabel(row.workerDeploymentId) }}</td>
                        <td class="py-2 pr-4">{{ row.status }}</td>
                        <td class="py-2 pr-4">{{ row.normalHours ?? '—' }} / OT {{ row.otHours ?? '—' }}</td>
                        <td class="py-2">
                          <button class="text-brand-600 hover:underline text-xs" (click)="openAttendanceForm(row)">Edit</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }

        @if (!loading && detailTab === 'wages') {
          @if (!selectedWagePeriodId) {
            <ui-empty-state message="Select a wage period from the Wage Periods tab first." />
          } @else {
            <div class="flex justify-between items-center mb-3">
              <span class="text-sm text-gray-600">{{ wages.length }} wage record(s)</span>
              <ui-button variant="primary" (clicked)="openWageForm()">+ Add / Update</ui-button>
            </div>
            @if (!wages.length) {
              <ui-empty-state message="No wage records for this period." />
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500 border-b">
                      <th class="py-2 pr-4">Worker</th>
                      <th class="py-2 pr-4">Days</th>
                      <th class="py-2 pr-4">Gross</th>
                      <th class="py-2 pr-4">Net</th>
                      <th class="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of wages; track row.id) {
                      <tr class="border-b border-gray-50">
                        <td class="py-2 pr-4">{{ deploymentWorkerLabel(row.workerDeploymentId) }}</td>
                        <td class="py-2 pr-4">{{ row.daysWorked }}</td>
                        <td class="py-2 pr-4">₹{{ row.grossWages | number:'1.2-2' }}</td>
                        <td class="py-2 pr-4">₹{{ row.netWages | number:'1.2-2' }}</td>
                        <td class="py-2">
                          <button class="text-brand-600 hover:underline text-xs" (click)="openWageForm(row)">Edit</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }

        @if (!loading && detailTab === 'registers') {
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-600">{{ registerRuns.length }} register run(s)</span>
            <ui-button variant="primary" (clicked)="openRegisterForm()">+ Record Register Run</ui-button>
          </div>
          @if (!registerRuns.length) {
            <ui-empty-state message="No register runs yet." />
          } @else {
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500 border-b">
                    <th class="py-2 pr-4">Register</th>
                    <th class="py-2 pr-4">Status</th>
                    <th class="py-2 pr-4">File</th>
                    <th class="py-2">Generated</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of registerRuns; track row.id) {
                    <tr class="border-b border-gray-50">
                      <td class="py-2 pr-4">{{ row.registerCode }}</td>
                      <td class="py-2 pr-4">{{ row.status || 'GENERATED' }}</td>
                      <td class="py-2 pr-4">
                        @if (row.fileUrl) {
                          <a [href]="downloadRegisterHref(row.id)" target="_blank" class="text-brand-600 hover:underline">{{ row.fileName || 'Download' }}</a>
                        } @else {
                          {{ row.fileName || '—' }}
                        }
                      </td>
                      <td class="py-2">{{ row.generatedAt || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </div>
    </div>

    @if (showRegisterForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">Record Register Run</h3>
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Register Code *</label>
              <select [(ngModel)]="registerForm.registerCode" class="w-full rounded-lg border-gray-300">
                <option value="FORM_XII">FORM_XII</option>
                <option value="FORM_XIII">FORM_XIII</option>
                <option value="FORM_XIV">FORM_XIV</option>
                <option value="FORM_XV">FORM_XV</option>
                <option value="FORM_XVI">FORM_XVI</option>
                <option value="FORM_XVII">FORM_XVII</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Wage Period</label>
              <select [(ngModel)]="registerForm.wagePeriodId" class="w-full rounded-lg border-gray-300">
                <option value="">— None —</option>
                @for (wp of wagePeriods; track wp.id) {
                  <option [value]="wp.id">{{ wp.wageMonth }}/{{ wp.wageYear }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Register file (PDF/Excel)</label>
              <input type="file" accept=".pdf,.xlsx,.xls,.csv" (change)="onRegisterFile($event)" class="w-full text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Or file URL (optional)</label>
              <input type="text" [(ngModel)]="registerForm.fileUrl" placeholder="https://..." class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveRegisterRun()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showDeploymentForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ deploymentForm.id ? 'Edit' : 'Add' }} Deployment</h3>
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Worker *</label>
              <select [(ngModel)]="deploymentForm.workerId" class="w-full rounded-lg border-gray-300" [disabled]="!!deploymentForm.id">
                @for (w of contractorWorkers; track w.id) {
                  <option [value]="w.id">{{ w.workerCode }} — {{ w.fullName }}</option>
                }
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start *</label>
                <input type="date" [(ngModel)]="deploymentForm.deploymentStart" class="w-full rounded-lg border-gray-300" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">End</label>
                <input type="date" [(ngModel)]="deploymentForm.deploymentEnd" class="w-full rounded-lg border-gray-300" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Rate/day</label>
                <input type="number" [(ngModel)]="deploymentForm.ratePerDay" class="w-full rounded-lg border-gray-300" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Rate/mo</label>
                <input type="number" [(ngModel)]="deploymentForm.ratePerMonth" class="w-full rounded-lg border-gray-300" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OT/hr</label>
                <input type="number" [(ngModel)]="deploymentForm.otRatePerHour" class="w-full rounded-lg border-gray-300" />
              </div>
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveDeployment()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showWagePeriodForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">Add Wage Period</h3>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">From *</label>
              <input type="date" [(ngModel)]="wagePeriodForm.periodFrom" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">To *</label>
              <input type="date" [(ngModel)]="wagePeriodForm.periodTo" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Month *</label>
              <input type="number" min="1" max="12" [(ngModel)]="wagePeriodForm.wageMonth" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Year *</label>
              <input type="number" [(ngModel)]="wagePeriodForm.wageYear" class="w-full rounded-lg border-gray-300" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Payment place</label>
              <input type="text" [(ngModel)]="wagePeriodForm.paymentPlace" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveWagePeriod()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showAttendanceForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ attendanceForm.existingId ? 'Edit' : 'Add' }} Attendance</h3>
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deployment *</label>
              <select [(ngModel)]="attendanceForm.workerDeploymentId" class="w-full rounded-lg border-gray-300">
                @for (d of deployments; track d.id) {
                  <option [value]="d.id">{{ workerLabel(d.workerId) }}</option>
                }
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input type="date" [(ngModel)]="attendanceForm.attendanceDate" class="w-full rounded-lg border-gray-300" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select [(ngModel)]="attendanceForm.status" class="w-full rounded-lg border-gray-300">
                  @for (s of attendanceStatuses; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Normal hours</label>
                <input type="number" step="0.5" [(ngModel)]="attendanceForm.normalHours" class="w-full rounded-lg border-gray-300" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">OT hours</label>
                <input type="number" step="0.5" [(ngModel)]="attendanceForm.otHours" class="w-full rounded-lg border-gray-300" />
              </div>
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveAttendance()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }

    @if (showWageForm) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeForms()">
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold mb-4">{{ wageForm.existingId ? 'Edit' : 'Add' }} Wage</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Deployment *</label>
              <select [(ngModel)]="wageForm.workerDeploymentId" class="w-full rounded-lg border-gray-300">
                @for (d of deployments; track d.id) {
                  <option [value]="d.id">{{ workerLabel(d.workerId) }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Days worked *</label>
              <input type="number" [(ngModel)]="wageForm.daysWorked" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Basic wage *</label>
              <input type="number" [(ngModel)]="wageForm.basicWage" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">DA</label>
              <input type="number" [(ngModel)]="wageForm.da" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">HRA</label>
              <input type="number" [(ngModel)]="wageForm.hra" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">OT wages</label>
              <input type="number" [(ngModel)]="wageForm.otWages" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Allowances</label>
              <input type="number" [(ngModel)]="wageForm.allowances" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Gross *</label>
              <input type="number" [(ngModel)]="wageForm.grossWages" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PF</label>
              <input type="number" [(ngModel)]="wageForm.pfDeduction" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ESI</label>
              <input type="number" [(ngModel)]="wageForm.esiDeduction" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PT</label>
              <input type="number" [(ngModel)]="wageForm.ptDeduction" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Other ded.</label>
              <input type="number" [(ngModel)]="wageForm.otherDeductions" class="w-full rounded-lg border-gray-300" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Net *</label>
              <input type="number" [(ngModel)]="wageForm.netWages" class="w-full rounded-lg border-gray-300" />
            </div>
          </div>
          <div class="flex gap-2 mt-5 justify-end">
            <ui-button variant="secondary" (clicked)="closeForms()">Cancel</ui-button>
            <ui-button variant="primary" (clicked)="saveWage()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</ui-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CrmClraAssignmentDetailComponent implements OnChanges {
  @Input({ required: true }) assignment!: ClraAssignment;
  @Input() contractors: ClraContractor[] = [];
  @Input() portalMode = false;

  readonly detailTabs = [
    { id: 'deployments' as DetailTab, label: 'Deployments' },
    { id: 'wage-periods' as DetailTab, label: 'Wage Periods' },
    { id: 'attendance' as DetailTab, label: 'Attendance' },
    { id: 'wages' as DetailTab, label: 'Wages' },
    { id: 'registers' as DetailTab, label: 'Registers' },
  ];
  readonly attendanceStatuses = ['P', 'A', 'H', 'L', 'WO'];

  detailTab: DetailTab = 'deployments';
  loading = false;
  saving = false;

  deployments: ClraDeployment[] = [];
  wagePeriods: ClraWagePeriod[] = [];
  attendance: ClraAttendance[] = [];
  wages: ClraWage[] = [];
  registerRuns: ClraRegisterRun[] = [];
  contractorWorkers: ClraWorker[] = [];
  selectedWagePeriodId = '';

  showDeploymentForm = false;
  showWagePeriodForm = false;
  showAttendanceForm = false;
  showWageForm = false;
  showRegisterForm = false;

  registerForm = { registerCode: 'FORM_XII', wagePeriodId: '', fileUrl: '' };
  registerFile: File | null = null;

  deploymentForm: CreateDeploymentPayload & { id?: string } = this.emptyDeploymentForm();
  wagePeriodForm: CreateWagePeriodPayload = this.emptyWagePeriodForm();
  attendanceForm: UpsertAttendancePayload & { existingId?: string } = this.emptyAttendanceForm();
  wageForm: UpsertWagePayload & { existingId?: string } = this.emptyWageForm();

  constructor(
    private clra: ClraApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignment'] && this.assignment?.id) {
      this.selectedWagePeriodId = '';
      this.loadContractorWorkers();
      this.reloadDetail();
    }
  }

  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
    if (tab === 'attendance' && this.selectedWagePeriodId) this.loadAttendance();
    if (tab === 'wages' && this.selectedWagePeriodId) this.loadWages();
    if (tab === 'registers') this.loadRegisterRuns();
    this.cdr.markForCheck();
  }

  selectWagePeriod(row: ClraWagePeriod): void {
    this.selectedWagePeriodId = row.id;
    this.cdr.markForCheck();
  }

  workerLabel(workerId: string): string {
    const w = this.contractorWorkers.find((x) => x.id === workerId);
    return w ? `${w.workerCode} — ${w.fullName}` : workerId;
  }

  deploymentWorkerLabel(deploymentId: string): string {
    const d = this.deployments.find((x) => x.id === deploymentId);
    return d ? this.workerLabel(d.workerId) : deploymentId;
  }

  openDeploymentForm(row?: ClraDeployment): void {
    if (row) {
      this.deploymentForm = {
        id: row.id,
        assignmentId: row.assignmentId,
        workerId: row.workerId,
        deploymentStart: row.deploymentStart,
        deploymentEnd: row.deploymentEnd || undefined,
        ratePerDay: row.ratePerDay ?? undefined,
        ratePerMonth: row.ratePerMonth ?? undefined,
        otRatePerHour: row.otRatePerHour ?? undefined,
      };
    } else {
      this.deploymentForm = this.emptyDeploymentForm();
    }
    this.showDeploymentForm = true;
    this.cdr.markForCheck();
  }

  openWagePeriodForm(): void {
    this.wagePeriodForm = this.emptyWagePeriodForm();
    this.showWagePeriodForm = true;
    this.cdr.markForCheck();
  }

  openAttendanceForm(row?: ClraAttendance): void {
    if (!this.selectedWagePeriodId) {
      this.toast.warning('Select wage period', 'Choose a wage period first.');
      return;
    }
    if (row) {
      this.attendanceForm = {
        existingId: row.id,
        wagePeriodId: row.wagePeriodId,
        workerDeploymentId: row.workerDeploymentId,
        attendanceDate: row.attendanceDate,
        status: row.status,
        normalHours: row.normalHours ?? undefined,
        otHours: row.otHours ?? undefined,
      };
    } else {
      this.attendanceForm = this.emptyAttendanceForm();
    }
    this.showAttendanceForm = true;
    this.cdr.markForCheck();
  }

  openWageForm(row?: ClraWage): void {
    if (!this.selectedWagePeriodId) {
      this.toast.warning('Select wage period', 'Choose a wage period first.');
      return;
    }
    if (row) {
      this.wageForm = {
        existingId: row.id,
        wagePeriodId: row.wagePeriodId,
        workerDeploymentId: row.workerDeploymentId,
        daysWorked: row.daysWorked,
        basicWage: row.basicWage,
        grossWages: row.grossWages,
        netWages: row.netWages,
        da: row.da ?? undefined,
        hra: row.hra ?? undefined,
        otWages: row.otWages ?? undefined,
        allowances: row.allowances ?? undefined,
        pfDeduction: row.pfDeduction ?? undefined,
        esiDeduction: row.esiDeduction ?? undefined,
        ptDeduction: row.ptDeduction ?? undefined,
        otherDeductions: row.otherDeductions ?? undefined,
      };
    } else {
      this.wageForm = this.emptyWageForm();
    }
    this.showWageForm = true;
    this.cdr.markForCheck();
  }

  closeForms(): void {
    this.showDeploymentForm = false;
    this.showWagePeriodForm = false;
    this.showAttendanceForm = false;
    this.showWageForm = false;
    this.showRegisterForm = false;
    this.cdr.markForCheck();
  }

  openRegisterForm(): void {
    this.registerForm = {
      registerCode: 'FORM_XII',
      wagePeriodId: this.selectedWagePeriodId || '',
      fileUrl: '',
    };
    this.registerFile = null;
    this.showRegisterForm = true;
    this.cdr.markForCheck();
  }

  onRegisterFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.registerFile = input.files?.[0] ?? null;
    this.cdr.markForCheck();
  }

  downloadRegisterHref(id: string): string {
    return this.clra.downloadRegisterRunUrl(id, this.portalMode);
  }

  saveRegisterRun(): void {
    if (!this.registerForm.registerCode) {
      this.toast.error('Validation', 'Register code is required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();

    const done = () => {
      this.toast.success('Saved', 'Register run recorded.');
      this.closeForms();
      this.loadRegisterRuns();
    };
    const fail = (err: any) =>
      this.toast.error('Save failed', err?.error?.message || 'Could not save register run.');

    if (this.registerFile) {
      const fd = new FormData();
      fd.append('file', this.registerFile);
      fd.append('assignmentId', this.assignment.id);
      fd.append('registerCode', this.registerForm.registerCode);
      if (this.registerForm.wagePeriodId) {
        fd.append('wagePeriodId', this.registerForm.wagePeriodId);
      }
      this.clra
        .uploadRegisterRun(fd, this.portalMode)
        .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
        .subscribe({ next: done, error: fail });
      return;
    }

    const body = {
      assignmentId: this.assignment.id,
      registerCode: this.registerForm.registerCode,
      wagePeriodId: this.registerForm.wagePeriodId || undefined,
      fileUrl: this.registerForm.fileUrl || undefined,
    };
    const req = this.portalMode
      ? this.clra.createMyRegisterRun(body)
      : this.clra.createRegisterRun(body);
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: done,
      error: fail,
    });
  }

  saveDeployment(): void {
    if (!this.deploymentForm.workerId || !this.deploymentForm.deploymentStart) {
      this.toast.error('Validation', 'Worker and start date are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const { id, ...body } = this.deploymentForm;
    const req = id
      ? (this.portalMode ? this.clra.updateMyDeployment(id, body) : this.clra.updateDeployment(id, body))
      : (this.portalMode
        ? this.clra.createMyDeployment({ ...body, assignmentId: this.assignment.id })
        : this.clra.createDeployment({ ...body, assignmentId: this.assignment.id }));
    req.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Saved', 'Deployment saved.');
        this.closeForms();
        this.loadDeployments();
      },
      error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save deployment.'),
    });
  }

  saveWagePeriod(): void {
    if (!this.wagePeriodForm.periodFrom || !this.wagePeriodForm.periodTo) {
      this.toast.error('Validation', 'Period dates are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.createMyWagePeriod({ ...this.wagePeriodForm, assignmentId: this.assignment.id })
      : this.clra.createWagePeriod({ ...this.wagePeriodForm, assignmentId: this.assignment.id });
    req
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Saved', 'Wage period created.');
          this.closeForms();
          this.loadWagePeriods();
        },
        error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not create wage period.'),
      });
  }

  closePeriod(row: ClraWagePeriod): void {
    const req = this.portalMode ? this.clra.closeMyWagePeriod(row.id) : this.clra.closeWagePeriod(row.id);
    req.subscribe({
      next: () => {
        this.toast.success('Closed', 'Wage period closed.');
        this.loadWagePeriods();
      },
      error: (err) => this.toast.error('Close failed', err?.error?.message || 'Could not close period.'),
    });
  }

  saveAttendance(): void {
    if (!this.attendanceForm.workerDeploymentId || !this.attendanceForm.attendanceDate) {
      this.toast.error('Validation', 'Deployment and date are required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.upsertMyAttendance({ ...this.attendanceForm, wagePeriodId: this.selectedWagePeriodId })
      : this.clra.upsertAttendance({ ...this.attendanceForm, wagePeriodId: this.selectedWagePeriodId });
    req
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Saved', 'Attendance saved.');
          this.closeForms();
          this.loadAttendance();
        },
        error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save attendance.'),
      });
  }

  saveWage(): void {
    if (!this.wageForm.workerDeploymentId) {
      this.toast.error('Validation', 'Deployment is required.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.upsertMyWage({ ...this.wageForm, wagePeriodId: this.selectedWagePeriodId })
      : this.clra.upsertWage({ ...this.wageForm, wagePeriodId: this.selectedWagePeriodId });
    req
      .pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Saved', 'Wage record saved.');
          this.closeForms();
          this.loadWages();
        },
        error: (err) => this.toast.error('Save failed', err?.error?.message || 'Could not save wage.'),
      });
  }

  private reloadDetail(): void {
    this.loadDeployments();
    this.loadWagePeriods();
  }

  private loadContractorWorkers(): void {
    if (!this.assignment?.contractorId && !this.portalMode) return;
    const req = this.portalMode
      ? this.clra.listMyWorkers()
      : this.clra.listWorkers(this.assignment.contractorId);
    req.subscribe({
      next: (rows) => {
        this.contractorWorkers = rows || [];
        this.cdr.markForCheck();
      },
    });
  }

  private loadDeployments(): void {
    this.loading = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.listMyDeployments(this.assignment.id)
      : this.clra.listDeployments(this.assignment.id);
    req
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          this.deployments = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.deployments = [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadWagePeriods(): void {
    const req = this.portalMode
      ? this.clra.listMyWagePeriods(this.assignment.id)
      : this.clra.listWagePeriods(this.assignment.id);
    req.subscribe({
      next: (rows) => {
        this.wagePeriods = rows || [];
        this.cdr.markForCheck();
      },
    });
  }

  private loadAttendance(): void {
    if (!this.selectedWagePeriodId) return;
    this.loading = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.listMyAttendance(this.selectedWagePeriodId)
      : this.clra.listAttendance(this.selectedWagePeriodId);
    req
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          this.attendance = rows || [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadWages(): void {
    if (!this.selectedWagePeriodId) return;
    this.loading = true;
    this.cdr.markForCheck();
    const req = this.portalMode
      ? this.clra.listMyWages(this.selectedWagePeriodId)
      : this.clra.listWages(this.selectedWagePeriodId);
    req
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => {
          this.wages = rows || [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadRegisterRuns(): void {
    const req = this.portalMode
      ? this.clra.listMyRegisterRuns(this.assignment.id)
      : this.clra.listRegisterRuns(this.assignment.id);
    req.subscribe({
      next: (rows) => {
        this.registerRuns = rows || [];
        this.cdr.markForCheck();
      },
    });
  }

  private emptyDeploymentForm(): CreateDeploymentPayload & { id?: string } {
    return {
      assignmentId: this.assignment?.id || '',
      workerId: '',
      deploymentStart: '',
    };
  }

  private emptyWagePeriodForm(): CreateWagePeriodPayload {
    const now = new Date();
    return {
      assignmentId: this.assignment?.id || '',
      periodFrom: '',
      periodTo: '',
      wageMonth: now.getMonth() + 1,
      wageYear: now.getFullYear(),
      paymentPlace: '',
    };
  }

  private emptyAttendanceForm(): UpsertAttendancePayload & { existingId?: string } {
    return {
      wagePeriodId: this.selectedWagePeriodId,
      workerDeploymentId: this.deployments[0]?.id || '',
      attendanceDate: new Date().toISOString().slice(0, 10),
      status: 'P',
    };
  }

  private emptyWageForm(): UpsertWagePayload & { existingId?: string } {
    return {
      wagePeriodId: this.selectedWagePeriodId,
      workerDeploymentId: this.deployments[0]?.id || '',
      daysWorked: 0,
      basicWage: 0,
      grossWages: 0,
      netWages: 0,
    };
  }
}
