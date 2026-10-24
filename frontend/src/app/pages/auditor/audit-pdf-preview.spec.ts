import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { AuditFilePreviewComponent } from '../../shared/files/components/audit-file-preview.component';
import { ProtectedFileService } from '../../shared/files/services/protected-file.service';

function testPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
  ];
  for (let i = 0; i < 3; i++) {
    const content = `BT /F1 18 Tf 50 720 Td (TEST ONLY - audit preview page ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], {type:'application/pdf'});
}

describe('Real in-page PDF rendering', () => {
  it.each([390, 1024])('renders and navigates a synthetic three-page PDF at %s pixels', async width => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({imports:[AuditFilePreviewComponent], providers:[{provide:ProtectedFileService,useValue:{}}]}).compileComponents();
    const fixture = TestBed.createComponent(AuditFilePreviewComponent);
    const c = fixture.componentInstance;
    fixture.componentRef.setInput('request',{blob:testPdf(),name:'TEST ONLY multipage audit report.pdf'});
    fixture.detectChanges();
    await expect.poll(() => c.loading, {timeout:15000}).toBe(false);
    expect(c.error).toBe(''); expect(c.pages).toBe(3);
    await c.showPage(2); fixture.detectChanges(); expect(c.page).toBe(2);
    await c.showPage(3); fixture.detectChanges(); expect(c.page).toBe(3);
    await c.showPage(1); fixture.detectChanges(); expect(c.page).toBe(1);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Page 1 of 3');
    expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    expect(c.canvas.nativeElement.width).toBeGreaterThan(600);
    const pixels = c.canvas.nativeElement.getContext('2d')!.getImageData(0,0,c.canvas.nativeElement.width,c.canvas.nativeElement.height).data;
    expect(Array.from(pixels).some((v,i)=>i%4!==3 && v<100)).toBe(true);
    await page.screenshot({path:`__screenshots__/audit-pdf-${width}.png`});
    fixture.destroy(); expect(document.querySelector('[aria-label="Document preview"]')).toBeNull();
    TestBed.resetTestingModule();
  });
});
