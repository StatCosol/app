const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {REGISTER_FORMS}=require('../src/payroll/register-library/register-catalogue');
const {registerLayout}=require('../src/payroll/register-library/register-layouts');
const {registerWorkbook,validateRegister}=require('../src/payroll/register-library/register-workbook');
// Fictional print fixtures. Never reads an application database or employee records.
(async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'statco-register-print-'));
 const files=[];
 for(const form of REGISTER_FORMS){
  const layout=registerLayout(form.sourceId,form.formNumber);if(!layout)continue;
  const row={};
  for(const f of layout.fields){
   row[f.key]=f.type==='date'?'2026-09-01':['number','money'].includes(f.type)?0:'Sample';
   if(/^day\d+(In|Out)$/.test(f.key))row[f.key]=f.key.endsWith('In')?'09:00':'17:00';
   if(/^day\d+Status$/.test(f.key))row[f.key]='P';
   if(f.key.startsWith('day31'))row[f.key]='';
  }
  const values={serial:1,part:'ADULT',employeeCode:'SAMPLE-001',employee_1:'SAMPLE-001',name:'Fictional Employee',employee_2:'Fictional Employee',bankAccount:'00012345678901234567890',employee_25:'00012345678901234567890',uan:'001234567890',employee_18:'001234567890',wagePeriod:'2026-09-01 to 2026-09-30',frequency:'Monthly',daysWorked:30};
  for(const [k,v] of Object.entries(values))if(k in row)row[k]=v;
  if(layout.baseFormNumber==='MATERNITY')Object.assign(row,{employmentMonth:'2026-09',employedDays:30,laidOffDays:0,notEmployedDays:0,inspectorRemarks:'',dischargeDate:''});
  const input={branchId:'11111111-1111-4111-8111-111111111111',year:2026,month:9,employer:'Fictional employer - print test only',owner:'Example owner',employerPan:'ABCDE1234F',registrationNumber:'SAMPLE',issueDate:'2026-09-30',supportingReference:'Fictional QA data; not for statutory filing',rows:[row]};
  const errors=validateRegister(form.id,input);if(errors.length)throw new Error(form.id+': '+errors.join('; '));
  const file=path.join(output,form.id+'.xlsx');await fs.writeFile(file,await registerWorkbook(form.id,input));files.push(file);
 }
 console.log(JSON.stringify({output,files},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
