// Synthetic documents only; no production data or external service calls.
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const ExcelJS=require('exceljs');const PDFDocument=require('pdfkit');
const {PayrollDocumentReconciliationService}=require('../dist/src/payroll-reconciliation/payroll-document-reconciliation.service');
async function main(){
 const root=path.resolve(process.cwd(),'uploads');await fs.mkdir(root,{recursive:true});const files=[];
 const worker={employeeCode:'G001',daysWorked:30,grossWage:18000,pfDeduction:1800,esiDeduction:120,netSalary:18033,calculationSnapshot:{uan:'100000000001',esic:'1234567890',pfApplicable:true,esiApplicable:true}};
 const headers=['employee_code','days_worked','gross_wage','pf_deduction','esi_deduction','net_salary','uan','esic'];const values=['G001','30','18000','1800','120','18033','100000000001','1234567890'];
 const write=async(ext,buffer)=>{const name='synthetic-payroll-'+Date.now()+'-'+files.length+ext;const full=path.join(root,name);files.push(full);await fs.writeFile(full,buffer);return name;};
 const checks=[];let current;
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM contractor_documents'))return [{id:'doc',client_id:'c',branch_id:'b',contractor_user_id:'v',doc_month:'2026-09',doc_type:'WAGE_REGISTER',file_name:current,file_path:current}];
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
  assert.equal(checks.length,4);console.log('PASS: actual Excel and PDF extraction, exact comparison, NC details, unreadable PDF manual-review fallback and saved check history.');
 }finally{for(const file of files)await fs.unlink(file);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
