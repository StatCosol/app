# Portal Segregation Implementation - Quick Reference

## 1. Frontend Register Type Definition

### Before
```typescript
registerTypes: { value: string; label: string; act: string }[] = [
  { value: 'WAGE_REGISTER', label: 'Wage Register (Form D)', act: 'CODE_ON_WAGES' },
  { value: 'MATERNITY_REGISTER', label: 'Maternity Benefit Register (Form L)', act: 'MATERNITY_BENEFIT' },
  // ... all 111 registers without categorization
];
```

### After
```typescript
registerTypes: { value: string; label: string; act: string; portalType: 'PAYROLL' | 'BRANCH' }[] = [
  // Payroll Portal (auto-generated)
  { value: 'WAGE_REGISTER', label: 'Wage Register (Form D)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
  { value: 'MUSTER_ROLL', label: 'Muster Roll (Form F)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
  // ... 47 PAYROLL-type registers
  
  // Branch/CRM Portal (event/manual)
  { value: 'MATERNITY_REGISTER', label: 'Maternity Benefit Register (Form L)', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
  { value: 'ACCIDENT_REGISTER', label: 'Accident Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
  // ... 64 BRANCH-type registers
];
```

---

## 2. Frontend Filter Getters

### Added filteredRegisterTypes
```typescript
get filteredRegisterTypes() {
  // Show only PAYROLL-type registers in the Payroll Portal
  let filtered = this.registerTypes.filter(rt => rt.portalType === 'PAYROLL');
  if (!this.filterAct) return filtered;
  return filtered.filter(rt => rt.act === this.filterAct);
}
```

### Added filteredActs
```typescript
get filteredActs() {
  // Show only acts that have PAYROLL-type registers
  const payrollActs = new Set(this.registerTypes.filter(rt => rt.portalType === 'PAYROLL').map(rt => rt.act));
  return this.acts.filter(act => payrollActs.has(act.value));
}
```

---

## 3. Frontend Template Binding

### Before
```html
<option *ngFor="let a of acts" [value]="a.value">{{ a.label }}</option>
```

### After
```html
<option *ngFor="let a of filteredActs" [value]="a.value">{{ a.label }}</option>
```

---

## 4. Backend Constant

### Added PAYROLL_LINKED_REGISTERS
```typescript
const PAYROLL_LINKED_REGISTERS = new Set([
  // Code on Wages (14)
  'WAGE_REGISTER',
  'MUSTER_ROLL',
  'OVERTIME_REGISTER',
  'LEAVE_REGISTER',
  'DEDUCTION_REGISTER',
  'FINE_REGISTER',
  'ADVANCE_REGISTER',
  'DAMAGE_LOSS_REGISTER',
  'WAGE_SLIP_REGISTER',
  'ANNUAL_RETURN_WAGES',
  'MINIMUM_WAGE_ABSTRACT',
  'COMB_EMPLOYEE_REGISTER',
  'COMB_MUSTER_ROLL',
  'COMB_FINE_DED_ADV_OT',
  
  // Factories Act (2)
  'ADULT_WORKER_REGISTER',
  'LEAVE_BOOK',
  
  // Shops & Establishments (3)
  'SHOPS_WAGE_REGISTER',
  'SHOPS_LEAVE_REGISTER',
  'SHOPS_WORK_HOURS_REGISTER',
  
  // Social Security (7)
  'PF_REGISTER',
  'ESI_REGISTER',
  'GRATUITY_REGISTER',
  'ECR',
  'ESI',
  'PF_CHALLAN_REGISTER',
  'ESI_CHALLAN_REGISTER',
  
  // Gratuity (2)
  'GRAT_COMPUTATION_REGISTER',
  'GRAT_PAYMENT_REGISTER',
  
  // Professional Tax (2)
  'PT_REGISTER',
  'PT_RETURN_REGISTER',
  
  // Bonus Act (4)
  'BONUS_REGISTER',
  'BONUS_COMPUTATION_SHEET',
  'BONUS_SET_ON_OFF',
  'BONUS_ANNUAL_RETURN',
  
  // Contract Labour (6)
  'CONTRACT_MUSTER_ROLL',
  'CONTRACT_WAGE_REGISTER',
  'CONTRACT_DEDUCTION_REGISTER',
  'CONTRACT_OVERTIME_REGISTER',
  'CLRA_WAGE_CUM_MUSTER',
  'CLRA_WAGE_SLIP',
  
  // Labour Welfare Fund (2)
  'LWF_REGISTER',
  'LWF_CONTRIBUTION_REGISTER',
]);
```

---

## 5. Backend Filter Logic

### Before
```typescript
const allTemplates = await this.findApplicableTemplates(branch.stateCode, estCategory);

// Apply applicability filtering based on branch conditions
const branchApplicability = await this.getBranchApplicability(branchId);
const templates = this.filterByApplicability(allTemplates, {
  employeeCount: branch.employeeCount,
  contractorCount: branch.contractorCount,
  hasPf: branchApplicability.hasPf,
  hasEsi: branchApplicability.hasEsi,
});

if (templates.length === 0) {
  throw new NotFoundException(
    `No register templates found for branch type=${branch.branchType}, state=${branch.stateCode}`,
  );
}
```

### After
```typescript
const allTemplates = await this.findApplicableTemplates(branch.stateCode, estCategory);

// Apply applicability filtering based on branch conditions
const branchApplicability = await this.getBranchApplicability(branchId);
let templates = this.filterByApplicability(allTemplates, {
  employeeCount: branch.employeeCount,
  contractorCount: branch.contractorCount,
  hasPf: branchApplicability.hasPf,
  hasEsi: branchApplicability.hasEsi,
});

// Filter to only payroll-linked registers (non-payroll registers route to Branch/Client/CRM)
const skipped: string[] = [];
for (const template of templates) {
  if (!PAYROLL_LINKED_REGISTERS.has(template.registerType)) {
    skipped.push(
      `${template.title} - Event-based register, upload via Branch/Client/CRM Portal`,
    );
  }
}
templates = templates.filter((t) => PAYROLL_LINKED_REGISTERS.has(t.registerType));

if (templates.length === 0) {
  throw new NotFoundException(
    `No payroll-linked register templates found for branch type=${branch.branchType}, state=${branch.stateCode}`,
  );
}
```

---

## 6. Response Example

### Generate Endpoint Response
```json
{
  "generated": [
    {
      "id": "uuid-1",
      "title": "Wage Register - BRANCH_NAME - 2026-04",
      "registerType": "WAGE_REGISTER",
      "stateCode": "MH",
      "periodYear": 2026,
      "periodMonth": 4,
      "approvalStatus": "PENDING",
      "fileName": "WAGE_REGISTER_MH_ABC123_2026-04.xlsx",
      "fileSize": "125440"
    },
    {
      "id": "uuid-2",
      "title": "Muster Roll - BRANCH_NAME - 2026-04",
      "registerType": "MUSTER_ROLL",
      "stateCode": "MH",
      "periodYear": 2026,
      "periodMonth": 4,
      "approvalStatus": "PENDING",
      "fileName": "MUSTER_ROLL_MH_ABC123_2026-04.xlsx",
      "fileSize": "98560"
    },
    // ... more payroll-linked registers
  ],
  "skipped": [
    "Accident Register - Event-based register, upload via Branch/Client/CRM Portal",
    "Medical Examination Register - Event-based register, upload via Branch/Client/CRM Portal",
    "Maternity Benefit Register - Event-based register, upload via Branch/Client/CRM Portal",
    "POSH Complaint Register - Event-based register, upload via Branch/Client/CRM Portal"
  ]
}
```

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `frontend/src/app/pages/payroll/payroll-registers.component.ts` | +portalType field to 111 registers, +filteredRegisterTypes, +filteredActs, updated acts binding |
| `backend/src/payroll/generators/register.generator.ts` | +PAYROLL_LINKED_REGISTERS constant, enhanced generateAllForBranch() with filter logic |

---

## 8. Deployment Checklist

- [x] Add portalType field to all 111 registers in frontend component
- [x] Create filteredRegisterTypes getter to filter by PAYROLL type
- [x] Create filteredActs getter to show only acts with payroll registers
- [x] Update acts dropdown to use filteredActs binding
- [x] Add PAYROLL_LINKED_REGISTERS constant in backend
- [x] Update generateAllForBranch() to filter templates
- [x] Add skipped array to track non-payroll registers
- [x] Return skipped registers with guidance message
- [x] Frontend build: ✅ No errors
- [x] Backend TypeScript check: ✅ No errors
- [ ] Deploy to staging for testing
- [ ] Test Payroll Portal only shows 47 registers
- [ ] Test Acts dropdown shows only 9 acts
- [ ] Test generate API skips non-payroll registers
- [ ] Test response includes skipped array with guidance
- [ ] Deploy to production after validation

---

## 9. Quick Statistics

| Metric | Value |
|--------|-------|
| Total Registers | 111 |
| Payroll-Linked | 47 (42%) |
| Branch/CRM | 64 (58%) |
| Acts with Payroll Registers | 9 |
| Acts with Only Event Registers | 4 |
| Register Types Requiring Frontend Filtering | 47 |
| Register Types Requiring Backend Filtering | 47 |
| Skipped Register Types | 64 |

---

## 10. Testing Commands (Post-Deployment)

### Verify Frontend Filter
```
1. Navigate to Payroll Portal → Registers
2. Check Acts dropdown - should show: CODE_ON_WAGES, FACTORIES_ACT, SHOPS_ESTABLISHMENTS, SOCIAL_SECURITY, GRATUITY, STATE_TAX, BONUS_ACT, CLRA, LWF
3. Check Register Type dropdown - should show only 47 registers (no MATERNITY_BENEFIT, POSH, EC, EQUAL_REMUNERATION)
4. Select each Act - should show only PAYROLL-type registers for that act
```

### Verify Backend Filter
```bash
# Generate all registers and check response
curl -X POST http://localhost:3000/api/v1/payroll/registers/generate-all \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "uuid-branch",
    "payrollRunId": "uuid-run",
    "userId": "uuid-user"
  }'

# Response should contain:
# - generated: array of PAYROLL-type register records
# - skipped: array of non-payroll registers with "Event-based register" message
```

### Verify Database Queries
```sql
-- Count registers by type
SELECT portalType, COUNT(*) FROM (
  SELECT CASE WHEN registerType IN ('WAGE_REGISTER', 'MUSTER_ROLL', ...) THEN 'PAYROLL' ELSE 'BRANCH' END as portalType
  FROM register_types
) subq GROUP BY portalType;

-- Should return: PAYROLL: 47, BRANCH: 64
```
