// After backend build; disposable local database only. Never reads production credentials.
const assert=require('node:assert/strict'),path=require('node:path');
const {Client}=require('pg'),{DataSource,Table}=require('typeorm'),bcrypt=require('bcryptjs');
const {AccessScopeService}=require('../dist/src/access/access-scope.service');
const {UsersService}=require('../dist/src/users/users.service');
const {DocListService}=require('../dist/src/list-queries/doc-list.service');
const {AuditListService}=require('../dist/src/list-queries/audit-list.service');
const {UserEntity}=require('../dist/src/users/entities/user.entity');
const {ClientEntity}=require('../dist/src/clients/entities/client.entity');
const {BranchEntity}=require('../dist/src/branches/entities/branch.entity');
const {ContractorDocumentEntity}=require('../dist/src/contractor/entities/contractor-document.entity');
const {AuditEntity}=require('../dist/src/audits/entities/audit.entity');
const connection={host:'127.0.0.1',port:55439,user:'monthly_close_test',database:'postgres'};
const schema=`deep_scope_${Date.now()}`,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){const admin=new Client(connection);await admin.connect();let ds;
 try{
  await admin.query(`CREATE SCHEMA "${schema}"`);
  ds=new DataSource({type:'postgres',...connection,username:connection.user,schema,extra:{options:`-c search_path=${schema},public`},entities:[path.join(__dirname,'../dist/src/**/*.entity.js')],synchronize:false});await ds.initialize();
  const entities=[UserEntity,ClientEntity,BranchEntity,ContractorDocumentEntity,AuditEntity];
  const runner=ds.createQueryRunner();try{for(const entity of entities)await runner.createTable(Table.create(ds.getMetadata(entity),ds.driver),true);}finally{await runner.release();}
  // Fill only required scalar fixture fields using actual metadata; no invented production columns.
  async function seed(entity,values){
   const row={...values};for(const c of ds.getMetadata(entity).columns){
    if(c.propertyName in row||c.isNullable||c.isGenerated||c.default!==undefined||c.isCreateDate||c.isUpdateDate||!c.isInsert)continue;
    row[c.propertyName]=c.enum?c.enum[0]:c.type==='uuid'?id(999):[Number,'int','integer','smallint','bigint','numeric','decimal','float'].includes(c.type)?0:[Boolean,'boolean'].includes(c.type)?true:c.type==='date'?'2026-02-01':c.isArray?[]:`fixture-${values.id}-${c.propertyName}`;
    if(c.length)row[c.propertyName]=String(row[c.propertyName]).slice(0,Number(c.length));
   }
   await ds.getRepository(entity).insert(row);
  }
  await seed(ClientEntity,{id:id(1),clientCode:'C1',clientName:'One'});
  for(const n of [11,12])await seed(BranchEntity,{id:id(n),clientId:id(1),branchName:`Branch ${n}`});
  const hash=await bcrypt.hash('fixture-password',4);
  for(const n of [31,32])await seed(UserEntity,{id:id(n),userCode:`CON${n}`,name:`Fixture ${n}`,email:`fixture${n}@example.invalid`,passwordHash:hash,clientId:id(1),isActive:true,roleId:id(99)});
  for(const [n,owner,branch] of [[101,31,11],[102,32,11],[103,31,12]])await seed(ContractorDocumentEntity,{id:id(n),contractorUserId:id(owner),uploadedByUserId:id(owner),clientId:id(1),branchId:id(branch),title:`Document ${n}`,docType:'TEST'});
  const access=new AccessScopeService({}, {},ds.getRepository(ClientEntity),ds.getRepository(BranchEntity),{});
  const docs=new DocListService(ds,access),contractor={id:id(31),userId:id(31),roleCode:'CONTRACTOR',clientId:id(1),branchIds:[]};
  const own=await docs.listContractorDocs(contractor,{});assert.equal(own.total,2);assert.ok(own.items.every(x=>x.contractorUserId===id(31)));assert.ok(own.items.every(x=>x.contractorUser.passwordHash===undefined));
  assert.equal((await docs.listContractorDocs({...contractor,roleCode:'CLIENT',userType:'BRANCH',branchIds:[]},{})).total,0);
  assert.equal((await docs.listContractorDocs({...contractor,roleCode:'CLIENT',userType:'BRANCH',branchIds:[id(11),id(12)]},{})).total,3);
  const users=ds.getRepository(UserEntity);assert.equal((await users.findOneBy({id:id(31)})).passwordHash,undefined);
  // Normal login already explicitly selects the password column; verify that opt-in remains valid.
  assert.equal((await users.createQueryBuilder('u').select(['u.id','u.passwordHash']).where('u.id = :id',{id:id(31)}).getOne()).passwordHash,hash);
  const svc=new UsersService({findOne:async()=>({id:id(99),code:'CONTRACTOR'})},users,{},ds.getRepository(ClientEntity),ds.getRepository(BranchEntity),ds,{}, {},{});
  assert.equal((await svc.findByEmail('fixture31@example.invalid')).passwordHash,undefined);
  assert.equal((await svc.validateLogin('fixture31@example.invalid','fixture-password')).userId,id(31));
  await assert.rejects(svc.changeMyPassword(id(31),'wrong','changed-password'),/incorrect/);
  await svc.changeMyPassword(id(31),'fixture-password','changed-password');
  assert.equal((await svc.validateLogin('fixture31@example.invalid','changed-password')).userId,id(31));
  for(const [n,periodCode] of [[201,'2026-01'],[202,'2026-02'],[203,'2026-Q1'],[204,'2026-H1'],[205,'2026'],[206,'2026-12']])await seed(AuditEntity,{id:id(n),clientId:id(1),branchId:id(11),periodCode,periodYear:2026,assignedAuditorId:id(32),createdByUserId:id(32)});
  const auditPage=await new AuditListService(ds,access).list({...contractor,roleCode:'CLIENT',userType:'MASTER'},{month:'2026-02'});
  assert.deepEqual(auditPage.items.map(x=>x.periodCode).sort(),['2026','2026-02','2026-H1','2026-Q1'].sort());
  console.log('PASS: contractor isolation, empty/multi-branch lists, joined/default hash exclusion, explicit auth selection, login/password change, exact audit periods.');
 }finally{if(ds?.isInitialized)await ds.destroy();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
