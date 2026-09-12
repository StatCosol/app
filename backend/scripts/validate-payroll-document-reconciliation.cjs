// Synthetic documents only; no production data or external service calls.
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const ExcelJS=require('exceljs');const PDFDocument=require('pdfkit');
const {PayrollDocumentReconciliationService}=require('../dist/src/payroll-reconciliation/payroll-document-reconciliation.service');
async function main(){
 const root=path.resolve(process.cwd(),'uploads');await fs.mkdir(root,{recursive:true});const files=[];
 const worker={employeeCode:'G001',daysWorked:30,grossWage:18000,pfDeduction:1800,esiDeduction:120,netSalary:18033,calculationSnapshot:{uan:'100000000001',esic:'1234567890',pfApplicable:true,esiApplicable:true}};
 const headers=['employee_code','days_worked','gross_wage','pf_deduction','esi_deduction','net_salary','uan','esic'];const values=['G001','30','18000','1800','120','18033','100000000001','1234567890'];
 const write=async(ext,buffer)=>{const name='synthetic-payroll-'+Date.now()+'-'+files.length+ext;const full=path.join(root,name);files.push(full);await fs.writeFile(full,buffer);return name;};
 const checks=[];let current;let docType='WAGE_REGISTER';
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM contractor_documents'))return [{id:'doc',client_id:'c',branch_id:'b',contractor_user_id:'v',doc_month:'2026-09',doc_type:docType,file_name:current,file_path:current}];
  if(sql.startsWith('SELECT * FROM contractor_payroll_versions'))return[{id:'version',version:1,rows_snapshot:[worker]}];
  if(sql.startsWith('INSERT'))checks.push(args);return [];
 }};
 const service=new PayrollDocumentReconciliationService(db);
 try{
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Wages');sheet.addRow(headers);sheet.addRow(values);
  current=await write('.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));assert.equal((await service.check('doc')).status,'MATCHED');
  sheet.getCell('F2').value='18032';current=await write('.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));const mismatch=await service.check('doc');assert.equal(mismatch.status,'NC');assert.ok(mismatch.findings.some(f=>f.field==='netSalary'&&f.expected===18033));
  const pdf=new PDFDocument({size:[1000,200],margin:10});const chunks=[];pdf.on('data',c=>chunks.push(c));const complete=new Promise(resolve=>pdf.on('end',resolve));
  const x=10,y=20,w=120,h=35;pdf.fontSize(9);
  for(let row=0;row<2;row++)for(let col=0;col<8;col++){pdf.rect(x+col*w,y+row*h,w,h).stroke();pdf.text((row?values:headers)[col],x+col*w+3,y+row*h+10,{width:w-6,lineBreak:false});}
  pdf.end();await complete;current=await write('.pdf',Buffer.concat(chunks));const result=await service.check('doc');assert.equal(result.status,'MATCHED',JSON.stringify(result));
  current=await write('.pdf',Buffer.from('not a PDF'));assert.equal((await service.check('doc')).status,'NEEDS_REVIEW');
  docType='PF_ECR';const pfBook=new ExcelJS.Workbook();const pfSheet=pfBook.addWorksheet('PF working');pfSheet.addRow(['UAN','PF Wage','PF Deduction']);pfSheet.addRow(['100000000001','15000','1800']);worker.pfWage=15000;
  current=await write('.xlsx',Buffer.from(await pfBook.xlsx.writeBuffer()));assert.equal((await service.check('doc')).status,'MATCHED');
  assert.equal(checks.length,5);
  // Raster-only page exercises real rendering + local OCR with all networking disabled in the worker.
  const {createCanvas}=require('@napi-rs/canvas');const canvas=createCanvas(1400,260),ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,1400,260);ctx.fillStyle='black';ctx.font='32px Arial';
  for(const [x,h,v] of [[40,'UAN','100000000001'],[520,'PF Wage','15000'],[900,'PF Deduction','1900']]) {ctx.fillText(h,x,60);ctx.fillText(v,x,130);}
  const scan=new PDFDocument({size:[1400,260],margin:0});const scanChunks=[];scan.on('data',c=>scanChunks.push(c));const scanEnd=new Promise(resolve=>scan.on('end',resolve));scan.image(canvas.toBuffer('image/png'),0,0,{width:1400});scan.end();await scanEnd;
  current=await write('.pdf',Buffer.concat(scanChunks));
  const automatic=await service.check('doc');assert.equal(automatic.status,'NEEDS_REVIEW');assert.equal(automatic.ocr,undefined);
  const assisted=await service.check('doc',{ocr:true});assert.equal(assisted.status,'NEEDS_REVIEW',JSON.stringify(assisted));assert.equal(assisted.extraction,'OCR',JSON.stringify(assisted));assert.ok(assisted.ocr.rows>=1,JSON.stringify(assisted));
  assert.ok(assisted.findings.every(f=>f.status==='NEEDS_REVIEW'));
  assert.ok(assisted.findings.some(f=>f.field==='pfDeduction'&&f.expected===1800&&String(f.submitted)==='1900'),JSON.stringify(assisted));
  assert.equal(checks.at(-1)[6],'ocr-v1');
  console.log('PASS: raster-only PDF OCR finds the PF difference offline and preserves mandatory auditor review.');console.log('PASS: actual Excel and PDF extraction, exact comparison, NC details, unreadable PDF manual-review fallback and saved check history.');
 }finally{for(const file of files)await fs.unlink(file);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
