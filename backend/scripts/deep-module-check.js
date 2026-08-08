#!/usr/bin/env node
/**
 * Deep module wiring audit: orphan services/controllers, god-service sizes,
 * AppModule coverage, delegate coverage hints.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', 'dist'].includes(e.name)) walk(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

function parseModuleArray(content, key) {
  const names = new Set();
  const re = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'g');
  let m;
  while ((m = re.exec(content))) {
    for (const part of m[1].split(/[,\n]/)) {
      let t = part.replace(/\/\/.*$/, '').trim();
      t = t.replace(/\.\.\.[A-Za-z0-9_]+/, '').trim();
      const cm = t.match(/([A-Z][A-Za-z0-9_]*)/);
      if (cm) names.add(cm[1]);
    }
  }
  if (/providers:\s*SERVICES/.test(content)) {
    const sm = content.match(/const SERVICES = \[([\s\S]*?)\]/);
    if (sm) {
      for (const line of sm[1].split(/[,\n]/)) {
        const cm = line.trim().match(/^([A-Z][A-Za-z0-9_]*)/);
        if (cm) names.add(cm[1]);
      }
    }
  }
  return names;
}

function toModuleName(file) {
  const bn = path.basename(file, '.module.ts');
  return (
    bn
      .split('-')
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('') + 'Module'
  );
}

const moduleFiles = walk(SRC).filter((f) => f.endsWith('.module.ts'));
const serviceMap = new Map();
const controllerMap = new Map();

for (const mf of moduleFiles) {
  const c = fs.readFileSync(mf, 'utf8');
  for (const p of parseModuleArray(c, 'providers')) serviceMap.set(p, mf);
  for (const p of parseModuleArray(c, 'controllers')) controllerMap.set(p, mf);
}

const orphanServices = [];
for (const f of walk(SRC).filter((f) => f.endsWith('.service.ts') && !f.includes('.spec.'))) {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes('@Injectable')) continue;
  const m = c.match(/export class ([A-Za-z0-9_]+)/);
  if (!m) continue;
  if (!serviceMap.has(m[1])) orphanServices.push(`${m[1]} -> ${path.relative(SRC, f)}`);
}

const orphanControllers = [];
for (const f of walk(SRC).filter((f) => f.endsWith('.controller.ts'))) {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes('@Controller')) continue;
  for (const m of c.matchAll(/export class ([A-Za-z0-9_]+)/g)) {
    if (!controllerMap.has(m[1]))
      orphanControllers.push(`${m[1]} -> ${path.relative(SRC, f)}`);
  }
}

const app = fs.readFileSync(path.join(SRC, 'app.module.ts'), 'utf8');
const appImports = [...app.matchAll(/^\s+([A-Za-z]+Module),/gm)].map((m) => m[1]);

const missingFromApp = moduleFiles
  .filter((f) => {
    const c = fs.readFileSync(f, 'utf8');
    return /controllers\s*:\s*\[/.test(c) && !f.endsWith('app.module.ts');
  })
  .map(toModuleName)
  .filter((m) => !appImports.includes(m) && m !== 'SharedModule');

const gods = [
  'payroll/payroll.service.ts',
  'compliance/compliance.service.ts',
  'audits/audits.service.ts',
  'mobile-attendance/punch/punch.service.ts',
  'facedesk/facedesk-attendance.service.ts',
];

console.log('=== SUMMARY ===');
console.log(`Modules: ${moduleFiles.length}`);
console.log(`Registered providers: ${serviceMap.size}`);
console.log(`Registered controllers: ${controllerMap.size}`);

console.log('\n=== GOD SERVICE LINE COUNTS ===');
for (const g of gods) {
  const fp = path.join(SRC, g);
  const lines = fs.readFileSync(fp, 'utf8').split('\n').length;
  const delegates = (fs.readFileSync(fp, 'utf8').match(/return this\.\w+Service\./g) || []).length;
  console.log(`${g}: ${lines} lines, ${delegates} delegate returns`);
}

console.log('\n=== ORPHAN @Injectable SERVICES ===');
if (!orphanServices.length) console.log('(none)');
else orphanServices.sort().forEach((x) => console.log(x));

console.log('\n=== ORPHAN @Controller CLASSES ===');
if (!orphanControllers.length) console.log('(none)');
else orphanControllers.sort().forEach((x) => console.log(x));

console.log('\n=== FEATURE MODULES WITH CONTROLLERS NOT IN AppModule ===');
if (!missingFromApp.length) console.log('(none)');
else missingFromApp.sort().forEach((x) => console.log(x));

// Delegate completeness: public methods in god service that don't delegate
function nonDelegateMethods(file) {
  const c = fs.readFileSync(path.join(SRC, file), 'utf8');
  const methods = [...c.matchAll(/\n\s+async\s+(\w+)\([^)]*\)\s*\{([\s\S]*?)\n\s+\}/g)];
  const heavy = [];
  for (const [, name, body] of methods) {
    const trimmed = body.trim();
    if (trimmed.startsWith('return this.') && trimmed.split('\n').length <= 3) continue;
    const lines = body.split('\n').length;
    if (lines > 8) heavy.push({ name, lines });
  }
  return heavy.sort((a, b) => b.lines - a.lines).slice(0, 15);
}

function methodsOf(file) {
  const c = fs.readFileSync(path.join(SRC, file), 'utf8');
  return new Set([...c.matchAll(/^\s+async\s+(\w+)\s*\(/gm)].map((m) => m[1]));
}

function verifyDelegates() {
  const pairs = [
    ['payroll/payroll.service.ts', 'payroll/payroll-input.service.ts', 'inputService'],
    ['payroll/payroll.service.ts', 'payroll/payroll-fnf.service.ts', 'fnfService'],
    ['payroll/payroll.service.ts', 'payroll/payroll-registers.service.ts', 'registersService'],
    ['payroll/payroll.service.ts', 'payroll/payroll-query.service.ts', 'queryService'],
    ['compliance/compliance.service.ts', 'compliance/compliance-dashboard.service.ts', 'dashboardService'],
    ['compliance/compliance.service.ts', 'compliance/compliance-crm-tasks.service.ts', 'crmTasksService'],
    ['compliance/compliance.service.ts', 'compliance/compliance-portal-tasks.service.ts', 'portalTasksService'],
    ['compliance/compliance.service.ts', 'compliance/compliance-reupload.service.ts', 'reuploadService'],
    ['audits/audits.service.ts', 'audits/audit-nc.service.ts', 'ncService'],
    ['audits/audits.service.ts', 'audits/audit-checklist.service.ts', 'checklistService'],
    ['audits/audits.service.ts', 'audits/audit-auditor-dashboard.service.ts', 'auditorDashboardService'],
    ['audits/audits.service.ts', 'audits/audit-report.service.ts', 'reportService'],
    ['audits/audits.service.ts', 'audits/audit-listing.service.ts', 'listingService'],
    ['audits/audits.service.ts', 'audits/audit-document-review.service.ts', 'documentReviewService'],
    ['payroll/payroll.service.ts', 'payroll/payroll-runs.service.ts', 'runsService'],
    ['payroll/payroll.service.ts', 'payroll/payroll-payslips.service.ts', 'payslipsService'],
    ['mobile-attendance/punch/punch.service.ts', 'mobile-attendance/punch/punch-review.service.ts', 'reviewService'],
    ['mobile-attendance/punch/punch.service.ts', 'mobile-attendance/punch/punch-contractor-admin.service.ts', 'contractorAdminService'],
    ['facedesk/facedesk-attendance.service.ts', 'facedesk/facedesk-offline-sync.service.ts', 'offlineSyncService'],
    ['facedesk/facedesk-attendance.service.ts', 'facedesk/facedesk-pin-attendance.service.ts', 'pinAttendanceService'],
    ['facedesk/facedesk-attendance.service.ts', 'facedesk/facedesk-punch-accept.service.ts', 'punchAcceptService'],
  ];
  console.log('\n=== DELEGATE TARGET VERIFICATION ===');
  let ok = true;
  for (const [godFile, extFile, inj] of pairs) {
    const god = fs.readFileSync(path.join(SRC, godFile), 'utf8');
    const extMethods = methodsOf(extFile);
    const re = new RegExp(`return this\\.${inj}\\.(\\w+)\\(`, 'g');
    const delegates = [...god.matchAll(re)].map((m) => m[1]);
    const missing = [...new Set(delegates)].filter((m) => !extMethods.has(m));
    if (missing.length) {
      ok = false;
      console.log(`${path.basename(extFile)}: MISSING ${missing.join(', ')}`);
    } else {
      console.log(`${path.basename(extFile)}: OK (${new Set(delegates).size} unique targets)`);
    }
  }
  return ok;
}

verifyDelegates();

console.log('\n=== LARGEST NON-DELEGATE METHODS IN GOD SERVICES (top 15 each) ===');
for (const g of gods) {
  const heavy = nonDelegateMethods(g);
  console.log(`\n-- ${g} --`);
  if (!heavy.length) console.log('  (all thin delegates or small helpers)');
  else heavy.forEach((h) => console.log(`  ${h.name}: ~${h.lines} lines`));
}
