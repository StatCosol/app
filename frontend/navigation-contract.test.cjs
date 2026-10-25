const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=p=>readFileSync(join(__dirname,'src/app',p),'utf8');
test('old monthly upload URL shares editor without widening its guards',()=>{
 const routes=source('pages/client/client.routes.ts');
 const alias=routes.slice(routes.indexOf("path: 'compliance/mcd/uploads'"),routes.indexOf("path: 'compliance/returns'"));
 assert.match(alias,/loadComponent: ClientMcdComponent/);
 assert.ok(alias.includes("moduleAccessGuard('EMPLOYEE_COMPLIANCE'), branchUserOnlyGuard"));
});
test('branch audit alias leads to guarded canonical destination',()=>{
 const routes=source('pages/branch/branch.routes.ts');
 assert.ok(routes.includes("path: 'audits/evidence', redirectTo: 'audits', pathMatch: 'full'"));
 assert.match(routes,/path: 'audits',.*moduleAccessGuard\('CONTRACTOR_AUDIT'\)/);
});
test('CRM shortcuts share review and preserve client guard and pinned requests',()=>{
 const routes=source('pages/crm/crm.routes.ts');
 assert.ok(routes.includes("path: 'documents', loadComponent: CrmComplianceComponent"));
 assert.ok(routes.includes('crmClientAccessGuard'));
 assert.ok(source('pages/crm/compliance/crm-compliance.component.ts').includes('clientId: this.routeClientId || this.docFilters.clientId'));
});
