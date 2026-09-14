const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {REGISTER_FORMS}=require('../src/payroll/register-library/register-catalogue');
const {registerLayout}=require('../src/payroll/register-library/register-layouts');
const {registerWorkbook,validateRegister}=require('../src/payroll/register-library/register-workbook');
// Fictional print fixtures. Never reads an application database or employee records.
(async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'statco-register-print-'));
 const files=[];
 for(const form of REGISTER_FORMS){
  const layout=registerLayout(form.sourceId,form.formNumber,form.actCode);if(!layout)continue;
  const start=new Date('2026-09-01T00:00:00Z');
  if(form.effectiveFrom && form.effectiveFrom>start.toISOString().slice(0,10)){start.setUTCFullYear(Number(form.effectiveFrom.slice(0,4)));start.setUTCMonth(Number(form.effectiveFrom.slice(5,7)));}
  if(layout.periodKind==='ANNUAL') { if(form.effectiveFrom && start.getUTCFullYear()+'-01-01'<form.effectiveFrom) start.setUTCFullYear(Number(form.effectiveFrom.slice(0,4))+1); start.setUTCMonth(11); }
  const year=start.getUTCFullYear(),month=start.getUTCMonth()+1,prefix=start.toISOString().slice(0,7),days=new Date(Date.UTC(year,month,0)).getUTCDate();
  const row={};
  for(const f of layout.fields){
   row[f.key]=f.type==='date'?prefix+'-01':['number','money'].includes(f.type)?0:'Sample';
   if(/^day\d+(In|Out)$/.test(f.key))row[f.key]=f.key.endsWith('In')?'09:00':'17:00';
   if(/^day\d+Status$/.test(f.key))row[f.key]='P';
   if(days<31 && f.key.startsWith('day31'))row[f.key]='';
  }
  const values={noticeTime:'09:30',eventTime:'09:00',serial:1,part:'ADULT',employeeCode:'SAMPLE-001',employee_1:'SAMPLE-001',name:'Fictional Employee',employee_2:'Fictional Employee',bankAccount:'00012345678901234567890',employee_25:'00012345678901234567890',uan:'001234567890',employee_18:'001234567890',wagePeriod:prefix+'-01 to '+prefix+'-'+days,frequency:'Monthly',daysWorked:days};
  for(const [k,v] of Object.entries(values))if(k in row)row[k]=v;
  if(layout.baseFormNumber==='MATERNITY'){const maternity={employmentMonth:prefix,employedDays:days,laidOffDays:0,notEmployedDays:0,inspectorRemarks:'',dischargeDate:''};for(const [k,v] of Object.entries(maternity))if(k in row)row[k]=v;}
  const input={branchId:'11111111-1111-4111-8111-111111111111',year,month,employer:'Fictional employer - print test only',owner:'Example owner',employerPan:'ABCDE1234F',registrationNumber:'SAMPLE',issueDate:prefix+'-'+days,supportingReference:'Fictional QA data; not for statutory filing',rows:[row]};
  if(layout.particulars) input.particulars=Object.fromEntries(layout.particulars.map(f=>[f.key,f.type==='number'?0:'Fictional QA particulars']));
  if(form.sourceId==='tsi') {row.sex='M';input.actingCapacity='DIRECT_EMPLOYER';Object.assign(input.particulars,{regularWorkers:1,categoryPermanentMale:1,categoryTotalMale:1,classUnskilledMale:1,classTotalMale:1});}
  if(form.sourceId==='mh' && form.formNumber==='Q') {row.age=35;row.sex='M';row.workingFrom='09:00';row.workingTo='18:00';row.restFrom='13:00';row.restTo='14:00';}
  const errors=validateRegister(form.id,input);if(errors.length)throw new Error(form.id+': '+errors.join('; '));
  const file=path.join(output,form.id+'.xlsx');await fs.writeFile(file,await registerWorkbook(form.id,input,{establishment:'Fictional branch',address:'Example address, sample district'}));files.push(file);
 }
 console.log(JSON.stringify({output,files},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
