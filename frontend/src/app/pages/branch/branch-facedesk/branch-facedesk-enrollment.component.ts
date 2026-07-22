import { Component } from '@angular/core';
import { FaceDeskComponent } from '../../client/facedesk/facedesk.component';

/**
 * Branch-portal FaceDesk enrollment. Reuses the FaceDesk console in branchMode,
 * which hides the client-wide admin tabs (devices, reports, settings) and opens
 * on enrollment. All FaceDesk endpoints are already branch-scoped on the
 * backend, so a branch user only sees and acts on their own branch.
 */
@Component({
  standalone: true,
  selector: 'app-branch-facedesk-enrollment',
  imports: [FaceDeskComponent],
  template: `<app-facedesk [branchMode]="true"></app-facedesk>`,
})
export class BranchFaceDeskEnrollmentComponent {}
