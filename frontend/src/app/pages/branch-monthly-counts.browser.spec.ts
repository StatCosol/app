import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { of } from 'rxjs';
import { BranchMcdComponent } from './branch/branch-mcd/branch-mcd.component';
import { BranchComplianceDocService } from '../core/branch-compliance-doc.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast/toast.service';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';

afterEach(()=>TestBed.resetTestingModule());
for (const width of [390,768,1440]) it('renders required upload and correction counts at '+width+'px',async()=>{
  await page.viewport(width,900);
  const rows=Array.from({length:46},(_,i)=>({returnCode:'TEST-'+i,returnName:'Synthetic upload '+i,uploadRequired:i<40,document:null}));
  await TestBed.configureTestingModule({imports:[BranchMcdComponent],providers:[provideZonelessChangeDetection(),
    {provide:BranchComplianceDocService,useValue:{getChecklist:()=>of({data:rows}),listBranchDocs:()=>of({data:[]})}},
    {provide:AuthService,useValue:{getBranchIds:()=>['TEST-B']}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:(key:string)=>key==='month'?'2050-10':null}}}},
    {provide:ToastService,useValue:{}},{provide:ProtectedFileService,useValue:{}}]})
    .overrideComponent(BranchMcdComponent,{set:{imports:[CommonModule,FormsModule],schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const f=TestBed.createComponent(BranchMcdComponent), c=f.componentInstance;
  f.detectChanges();await f.whenStable();
  const h:HTMLElement=f.nativeElement;
  expect(c.selectedYear).toBe(2050);
  expect(c.years).toContain(2050);
  expect(Array.from(h.querySelectorAll('select')).some(s=>s.selectedOptions[0]?.textContent?.trim()==='2050')).toBe(true);
  const values=()=>Array.from(h.querySelectorAll('.summary-card .summary-value')).map(x=>x.textContent?.trim());
  expect(values().slice(0,4)).toEqual(['0%','40','40','0']);
  expect(h.textContent).toContain('Required monthly uploads');expect(h.textContent).toContain('Pending upload or correction');
  c.checklist[0].document={status:'APPROVED',uploadedFileUrl:'synthetic.pdf'} as any;
  c.checklist[1].document={status:'REUPLOAD_REQUIRED',uploadedFileUrl:'returned.pdf'} as any;
  c.checklist[2].document={status:'APPROVED',uploadedFileUrl:null} as any;
  f.changeDetectorRef.markForCheck();f.detectChanges();await f.whenStable();
  expect(values().slice(0,4)).toEqual(['3%','40','39','1']);expect(h.textContent).toContain('1 / 40 uploaded');
  expect(h.scrollWidth).toBeLessThanOrEqual(width+1);f.destroy();
});
