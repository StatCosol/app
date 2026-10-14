// Route binding regression: real Nest controllers/roles, fixture service responses.
// No database, cloud, email or production configuration is loaded.
require('reflect-metadata');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Test}=require('@nestjs/testing');
const {Reflector}=require('@nestjs/core');
const {VersioningType}=require('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA,VERSION_METADATA,GUARDS_METADATA}=require('@nestjs/common/constants');
const {RolesGuard}=require('../dist/src/auth/roles.guard');
const src=(p,n)=>require('../dist/src/'+p)[n];
const controllers=[
 ['auditor/auditor-list.controller','AuditorListController'],
 ['clients/client-list.controller','ClientListController'],
 ['audits/audits.controller','AuditorAuditsController'],
 ['audits/audits.controller','ClientAuditsController'],
 ['contractor/contractor-list.controller','ContractorListController'],
 ['contractor/contractor-documents.controller','ContractorDocumentsController'],
 ['contractor/contractor.controller','ContractorController'],
 ['compliance/controllers/dashboard.controller','ContractorDashboardController'],
].map(([p,n])=>src(p,n));
async function main(){
 const mocks={
  AuditListService:{list:async(_u,q)=>({items:[{id:'paged',filter:q.status}],total:1})},
  AuditsService:{listForAuditor:async(_u,q)=>[{id:'auditor-workspace',filter:q.status}],listForClient:async(_u,q)=>[{id:'client-workspace',filter:q.status}]},
  DocListService:{listContractorDocs:async()=>({items:[{id:'paged-documents'}],total:1})},
  ContractorDocumentsService:{contractorList:async()=>[{id:'contractor-upload-list'}]},
  ContractorService:{getDashboard:async()=>({branches:[{id:'branch-dashboard'}]})},
  ComplianceService:{contractorDashboard:async()=>({pending:3})},
  BranchAccessService:{getUserBranchIds:async()=>[]},
 };
 let builder=Test.createTestingModule({controllers}).useMocker(token=>mocks[token.name]||{});
 for(const controller of controllers)for(const guard of Reflect.getMetadata(GUARDS_METADATA,controller)||[]) {
  if(guard!==RolesGuard) builder=builder.overrideGuard(guard).useValue({canActivate:()=>true});
 }
 const module=await builder.compile(); const app=module.createNestApplication();
 app.use((req,res,next)=>{if(!req.headers['x-test-role'])return res.status(401).json({message:'Authentication required'});req.user={id:'test-user',userId:'test-user',roleCode:req.headers['x-test-role'],clientId:'test-client'};next();});
 app.setGlobalPrefix('api');app.enableVersioning({type:VersioningType.URI});app.useGlobalGuards(new RolesGuard(new Reflector()));
 try{
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  for(const [url,role,expected]of[
   ['/auditor/audits?status=SCHEDULED','AUDITOR',[{id:'auditor-workspace',filter:'SCHEDULED'}]],
   ['/auditor/audit-list?status=SCHEDULED','AUDITOR',{items:[{id:'paged',filter:'SCHEDULED'}],total:1}],
   ['/client/audits?status=SCHEDULED','CLIENT',[{id:'client-workspace',filter:'SCHEDULED'}]],
   ['/client/audit-list?status=SCHEDULED','CLIENT',{items:[{id:'paged',filter:'SCHEDULED'}],total:1}],
   ['/contractor/documents','CONTRACTOR',[{id:'contractor-upload-list'}]],
   ['/contractor/document-list','CONTRACTOR',{items:[{id:'paged-documents'}],total:1}],
   ['/contractor/dashboard','CONTRACTOR',{branches:[{id:'branch-dashboard'}]}],
   ['/contractor/compliance/dashboard','CONTRACTOR',{pending:3}],
  ]){
   const r=await fetch(base+'/api/v1'+url,{headers:{'x-test-role':role}});assert.equal(r.status,200,url);assert.deepEqual(await r.json(),expected);
   const denied=await fetch(base+'/api/v1'+url,{headers:{'x-test-role':'EMPLOYEE'}});assert.equal(denied.status,403,url);
   const anon=await fetch(base+'/api/v1'+url);assert.equal(anon.status,401,url);
  }
  console.log('PASS: all eight formerly overlapping routes return their intended contract; filters forwarded; wrong roles and anonymous access denied.');
 }finally{await app.close();}
 // Check all controller declarations, including classes with the same exported name.
 const root=path.join(__dirname,'../dist/src');
 const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const seen=new Map();let count=0;
 for(const file of files(root).filter(f=>f.endsWith('.controller.js'))){
  for(const controller of Object.values(require(file))){
   if(typeof controller!=='function'||!controller.prototype||!Reflect.hasMetadata(PATH_METADATA,controller))continue;
   const prefixes=[Reflect.getMetadata(PATH_METADATA,controller)].flat();
   for(const name of Object.getOwnPropertyNames(controller.prototype)){
    const method=Object.getOwnPropertyDescriptor(controller.prototype,name)?.value;
    if(typeof method!=='function'||!Reflect.hasMetadata(METHOD_METADATA,method))continue;
    const routes=[Reflect.getMetadata(PATH_METADATA,method)].flat();
    const versions=[Reflect.getMetadata(VERSION_METADATA,method)??Reflect.getMetadata(VERSION_METADATA,controller)??'default'].flat();
    for(const prefix of prefixes)for(const route of routes)for(const version of versions){
     const key=[String(version),Reflect.getMetadata(METHOD_METADATA,method),('/'+prefix+'/'+route).replace(/\/+/g,'/').replace(/\/$/,'')].join(' ');
     const handler=path.relative(root,file)+':'+controller.name+'.'+name;
     assert.ok(!seen.has(key),'Duplicate route '+key+' in '+handler+' and '+seen.get(key));seen.set(key,handler);count++;
    }
   }
  }
 }
 console.log('PASS: '+count+' compiled HTTP route declarations have no duplicate version/method/path keys.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
