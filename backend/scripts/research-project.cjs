// Repeatable source research. Reads code structure only, never runtime configuration or secrets.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'docs/research/2026-09-12');
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]); }
function relative(file) { return path.relative(root,file).replaceAll('\\','/'); }
function decorators(node) { return (ts.canHaveDecorators(node)?ts.getDecorators(node):[])?.map(d=>d.expression).filter(ts.isCallExpression)||[]; }
function dec(node,name) { return decorators(node).find(d=>d.expression.getText()===name); }
function literal(node) { if(!node)return ''; if(ts.isStringLiteralLike(node))return node.text; if(ts.isObjectLiteralExpression(node)){const prop=node.properties.find(p=>p.name?.getText()==='path');return literal(prop?.initializer);} return `<${node.getText().slice(0,100)}>`; }
function strings(call) { return call?.arguments.map(literal)||[]; }
const inventory={method:'TypeScript AST declaration inventory; service-level authorization and dynamic routing need runtime validation.',modules:[],controllers:[],endpoints:[],entities:[],transitions:[],schedulers:[],frontendRoutes:[],sourceFiles:0,testFiles:0};
for(const file of files(path.join(root,'backend/src')).filter(f=>f.endsWith('.ts'))) {
 if(/\.(spec|test)\.ts$/.test(file)){inventory.testFiles++;continue;}
 inventory.sourceFiles++;const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const loc=n=>({file:relative(file),line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1});
 function walk(n) {
  if(ts.isClassDeclaration(n)) {
   const name=n.name?.text;const module=dec(n,'Module'),controller=dec(n,'Controller'),entity=dec(n,'Entity');
   if(module) inventory.modules.push({name,...loc(n),definition:module.arguments[0]?.getText()});
   if(entity) inventory.entities.push({name,table:literal(entity.arguments[0]),...loc(n),columns:n.members.filter(m=>dec(m,'Column')||dec(m,'PrimaryGeneratedColumn')||dec(m,'CreateDateColumn')||dec(m,'UpdateDateColumn')).map(m=>({name:m.name?.getText(),type:m.type?.getText()})),relations:n.members.filter(m=>decorators(m).some(d=>['ManyToOne','OneToMany','OneToOne','ManyToMany'].includes(d.expression.getText()))).map(m=>({name:m.name?.getText(),type:m.type?.getText()}))});
   if(controller) {
    const prefix=literal(controller.arguments[0]);const classRoles=strings(dec(n,'Roles'));
    const guards=strings(dec(n,'UseGuards')); inventory.controllers.push({name,prefix,roles:classRoles,guards,...loc(n)});
    for(const member of n.members) {
     const route=decorators(member).find(d=>['Get','Post','Put','Patch','Delete','All'].includes(d.expression.getText()));if(!route)continue;
     const own=dec(member,'Roles');inventory.endpoints.push({controller:name,method:route.expression.getText().toUpperCase(),path:`/${prefix}/${literal(route.arguments[0])}`.replace(/\/+/g,'/').replace(/\/$/,''),roles:own?strings(own):classRoles,guards:[...guards,...strings(dec(member,'UseGuards'))],public:!!dec(n,'Public')||!!dec(member,'Public'),handler:member.name?.getText(),...loc(member)});
    }
   }
  }
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&/status|state/i.test(n.left.name.text)) inventory.transitions.push({field:n.left.getText(),value:n.right.getText().slice(0,100),...loc(n)});
  if(ts.isMethodDeclaration(n)&&dec(n,'Cron'))inventory.schedulers.push({handler:n.name?.getText(),schedule:strings(dec(n,'Cron')),...loc(n)});
  ts.forEachChild(n,walk);
 }
 walk(source);
}
for(const file of files(path.join(root,'frontend/src/app')).filter(f=>f.endsWith('.routes.ts'))) {
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function walk(n){if(ts.isObjectLiteralExpression(n)){const prop=n.properties.find(p=>p.name?.getText()==='path');if(prop)inventory.frontendRoutes.push({path:literal(prop.initializer),file:relative(file),line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1,guards:n.properties.filter(p=>['canActivate','canMatch'].includes(p.name?.getText())).map(p=>p.initializer?.getText())});}ts.forEachChild(n,walk);}walk(source);
}
const roles=[...new Set(inventory.endpoints.flatMap(e=>e.roles))].sort();
const roleStats=roles.map(role=>({role,readEndpoints:inventory.endpoints.filter(e=>e.roles.includes(role)&&e.method==='GET').length,mutationEndpoints:inventory.endpoints.filter(e=>e.roles.includes(role)&&e.method!=='GET').length}));
const domains=[...new Set(inventory.controllers.map(c=>c.file.split('/')[2]))].sort();
const stats=domains.map(domain=>({domain,controllers:inventory.controllers.filter(c=>c.file.split('/')[2]===domain).length,endpoints:inventory.endpoints.filter(c=>c.file.split('/')[2]===domain).length,entities:inventory.entities.filter(c=>c.file.split('/')[2]===domain).length}));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'source-inventory.json'),JSON.stringify({...inventory,roleStats,domainStats:stats},null,2)+'\n');
const table=(headers,rows)=>`| ${headers.join(' | ')} |\n| ${headers.map(()=> '---').join(' | ')} |\n${rows.map(r=>'| '+r.join(' | ')+' |').join('\n')}\n`;
fs.writeFileSync(path.join(out,'SOURCE_MAP.md'),`# Project source map\n\nGenerated from source by backend/scripts/research-project.cjs. This is declaration coverage, not certification of runtime behavior. Role aliases, global guards, service scopes and module entitlements still apply. Frontend route counts include parent/group/redirect declarations.\n\n${inventory.sourceFiles} backend source files; ${inventory.testFiles} backend test files; ${inventory.modules.length} Nest modules; ${inventory.controllers.length} controllers; ${inventory.endpoints.length} HTTP handlers; ${inventory.entities.length} entity classes; ${inventory.frontendRoutes.length} frontend route declarations; ${inventory.schedulers.length} scheduled methods; ${inventory.transitions.length} explicit status/state assignments.\n\n## Role declarations\n\n${table(['Role','GET handlers','Other HTTP handlers'],roleStats.map(r=>[r.role,r.readEndpoints,r.mutationEndpoints]))}\n## Domains\n\n${table(['Domain','Controllers','HTTP handlers','Entities'],stats.map(r=>[r.domain,r.controllers,r.endpoints,r.entities]))}\n## Reading the inventory\n\nThe JSON records source file/line for each HTTP handler, declared role/guard metadata, entity fields/relations, scheduled jobs and explicit status assignments. Missing decorator metadata is a review lead, not proof of missing authorization: global JWT/role/scope guards and device-specific guards also exist. Dynamic expressions are marked with angle brackets.\n`);
console.log(JSON.stringify({sourceFiles:inventory.sourceFiles,tests:inventory.testFiles,modules:inventory.modules.length,controllers:inventory.controllers.length,endpoints:inventory.endpoints.length,entities:inventory.entities.length,frontendRoutes:inventory.frontendRoutes.length,schedulers:inventory.schedulers.length,roleStats}));
