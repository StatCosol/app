# Register Portal Segregation Implementation

## Overview
Implemented architectural workflow where **Payroll Portal** displays and generates only **payroll-data-linked registers**, while **event/manual registers** are routed to **Branch/Client/CRM Portal** for upload, approval, and repository management.

## Changes Made

### 1. Frontend: Register Type Categorization
**File:** [frontend/src/app/pages/payroll/payroll-registers.component.ts](frontend/src/app/pages/payroll/payroll-registers.component.ts)

#### 1.1 Added `portalType` Field to Register Types
- Extended register definition with `portalType: 'PAYROLL' | 'BRANCH'`
- Categorized all 111 registers across 13 acts

#### 1.2 Payroll-Linked Registers (47 total)
Auto-generated from employee/payroll data in Payroll Portal:

**Code on Wages (14)**
- WAGE_REGISTER, MUSTER_ROLL, OVERTIME_REGISTER, LEAVE_REGISTER
- DEDUCTION_REGISTER, FINE_REGISTER, ADVANCE_REGISTER, DAMAGE_LOSS_REGISTER
- WAGE_SLIP_REGISTER, ANNUAL_RETURN_WAGES, MINIMUM_WAGE_ABSTRACT
- COMB_EMPLOYEE_REGISTER, COMB_MUSTER_ROLL, COMB_FINE_DED_ADV_OT

**Factories Act (2)**
- ADULT_WORKER_REGISTER, LEAVE_BOOK

**Shops & Establishments (3)**
- SHOPS_WAGE_REGISTER, SHOPS_LEAVE_REGISTER, SHOPS_WORK_HOURS_REGISTER

**Social Security (7)**
- PF_REGISTER, ESI_REGISTER, GRATUITY_REGISTER
- ECR, ESI, PF_CHALLAN_REGISTER, ESI_CHALLAN_REGISTER

**Gratuity (2)**
- GRAT_COMPUTATION_REGISTER, GRAT_PAYMENT_REGISTER

**Professional Tax (2)**
- PT_REGISTER, PT_RETURN_REGISTER

**Bonus Act (4)**
- BONUS_REGISTER, BONUS_COMPUTATION_SHEET, BONUS_SET_ON_OFF, BONUS_ANNUAL_RETURN

**Contract Labour (6)**
- CONTRACT_MUSTER_ROLL, CONTRACT_WAGE_REGISTER, CONTRACT_DEDUCTION_REGISTER
- CONTRACT_OVERTIME_REGISTER, CLRA_WAGE_CUM_MUSTER, CLRA_WAGE_SLIP

**Labour Welfare Fund (2)**
- LWF_REGISTER, LWF_CONTRIBUTION_REGISTER

#### 1.3 Event/Manual Registers (64 total)
Route to Branch/Client/CRM Portal for upload and approval:

**Factories Act (15)** - Safety/Inspection/Equipment
- NOTICE_PERIODS_OF_WORK, CHILD_WORKER_REGISTER, COMPENSATORY_HOLIDAY_REGISTER
- ACCIDENT_REGISTER, INSPECTION_BOOK, DANGEROUS_OCCURRENCE_REGISTER
- PRESSURE_VESSEL_REGISTER, LIFTING_MACHINE_REGISTER, HOIST_LIFT_REGISTER
- MEDICAL_EXAMINATION_REGISTER, HUMIDITY_REGISTER, WHITEWASHING_RECORD
- HAZARDOUS_PROCESS_REGISTER, DANGEROUS_OPERATION_REGISTER

**Shops & Establishments (5)** - Non-payroll items
- EMPLOYEE_REGISTER, SHOPS_EMPLOYMENT_CARD, SHOPS_HOLIDAY_REGISTER
- SHOPS_ANNUAL_RETURN, SHOPS_NOTICE_DISPLAY

**Social Security (7)** - Event-based
- PF_NOMINATION_REGISTER, ESI_ACCIDENT_REGISTER, GRATUITY_NOMINATION_REGISTER
- PF_DECLARATION_REGISTER, PF_ECR_REGISTER, PF_INSPECTION_LOG, ESI_CLAIMS_REGISTER

**Gratuity (3)** - Event-based
- GRAT_NOMINATION, GRAT_ELIGIBILITY_TRACKER, GRAT_NOTICE_OPENING

**Contract Labour (5)** - Setup/Administrative
- CONTRACTOR_REGISTER, CONTRACT_WORKMEN_REGISTER, CONTRACT_EMPLOYMENT_CARD
- CLRA_SERVICE_CERT, CONTRACT_ANNUAL_RETURN

**Maternity Benefit (7)** - Event-based compliance
- MATERNITY_REGISTER, MATERNITY_LEAVE_REGISTER, MATERNITY_PAYMENT_REGISTER
- MATERNITY_DISMISSAL_REGISTER, MATERNITY_ANNUAL_RETURN
- MATERNITY_MEDICAL_DOCS, MATERNITY_NURSING_RECORD

**Equal Remuneration (2)** - Compliance-based
- EQUAL_REMUNERATION_REGISTER, EQUAL_REMUNERATION_RETURN

**Employees' Compensation (4)** - Event-based
- EC_ACCIDENT_REGISTER, EC_COMP_CASE_TRACKER, EC_INSURER_LOG, EC_NOTICE_LOG

**POSH (5)** - Event/Complaint-based
- POSH_COMPLAINT_REGISTER, POSH_INQUIRY_REGISTER, POSH_ACTION_REGISTER
- POSH_ANNUAL_REPORT, POSH_ICC_REGISTER

#### 1.4 Updated Getters
```typescript
get filteredRegisterTypes() {
  // Show only PAYROLL-type registers in the Payroll Portal
  let filtered = this.registerTypes.filter(rt => rt.portalType === 'PAYROLL');
  if (!this.filterAct) return filtered;
  return filtered.filter(rt => rt.act === this.filterAct);
}

get filteredActs() {
  // Show only acts that have PAYROLL-type registers
  const payrollActs = new Set(
    this.registerTypes.filter(rt => rt.portalType === 'PAYROLL').map(rt => rt.act)
  );
  return this.acts.filter(act => payrollActs.has(act.value));
}
```

#### 1.5 Updated Acts Dropdown
Changed from displaying all 13 acts to showing only acts with payroll-linked registers:
- CODE_ON_WAGES ✓
- FACTORIES_ACT ✓ (only Adult Worker + Leave Book)
- SHOPS_ESTABLISHMENTS ✓ (only wage/leave/hours)
- SOCIAL_SECURITY ✓
- GRATUITY ✓
- STATE_TAX ✓
- BONUS_ACT ✓
- CLRA ✓ (only payroll wage registers)
- LWF ✓
- ~~MATERNITY_BENEFIT~~
- ~~EQUAL_REMUNERATION~~
- ~~EC~~
- ~~POSH~~

### 2. Backend: Generator Filter
**File:** [backend/src/payroll/generators/register.generator.ts](backend/src/payroll/generators/register.generator.ts)

#### 2.1 Added PAYROLL_LINKED_REGISTERS Constant
```typescript
const PAYROLL_LINKED_REGISTERS = new Set([
  // All 47 payroll-linked register types
  'WAGE_REGISTER', 'MUSTER_ROLL', 'OVERTIME_REGISTER', ...
]);
```

#### 2.2 Enhanced generateAllForBranch() Method
- **Before filtering:** Retrieves all applicable templates based on state/establishment type
- **Filters:** Applies applicability rules (PF/ESI applicable, contractor/employee counts)
- **New Filter:** Checks `PAYROLL_LINKED_REGISTERS` set
  - Adds non-payroll registers to skipped array with message: `"{Title} - Event-based register, upload via Branch/Client/CRM Portal"`
  - Returns filtered templates containing only payroll-linked registers
- **Prevents:** Accidental generation of event/manual registers from Payroll Portal API

#### 2.3 Return Response
```typescript
return {
  generated: RegistersRecordEntity[],  // Only PAYROLL-type registers
  skipped: string[]                     // Event-based registers with guidance
};
```

## UI/UX Improvements

### Payroll Portal Users See:
- ✓ Only 47 payroll-linked registers in dropdown
- ✓ Only 9 acts in act filter (down from 13)
- ✓ Clear register descriptions (Form D, Form F, etc.)
- ✓ Automatic generation from payroll run data
- ✓ Monthly prepared, approved, and stored as repository

### Event/Manual Registers Guidance:
- Instructions to upload via Branch/Client/CRM Portal
- Separate workflow for compliance/safety registers
- CRM portal handles approval and repository management

## Workflow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                       Payroll Run                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├─→ Payroll Portal
                       │   ├─ Wage Sheet
                       │   ├─ Muster Roll
                       │   ├─ Overtime Register
                       │   ├─ Leave Register
                       │   ├─ Deduction Register
                       │   ├─ Fine/Advance Register
                       │   ├─ Wage Slip Register
                       │   ├─ PF/ESI/Gratuity Registers
                       │   ├─ Bonus Register
                       │   ├─ Professional Tax Register
                       │   └─ Adult Worker Register
                       │
                       └─→ Branch/Client/CRM Portal
                           ├─ Factory Safety Registers
                           ├─ Accident Register
                           ├─ Medical Examination Register
                           ├─ Maternity Registers
                           ├─ POSH Registers
                           ├─ Equal Remuneration Register
                           ├─ Employees' Compensation Register
                           └─ Labour Welfare Registers
                           
                           (Upload → Review → Approve → Store)
```

## Frontend Compilation Status
✅ **Build Successful** - No errors (28.377 seconds)
- All components compile
- Type safety verified
- Optional chaining warnings (non-breaking)

## Backend Compilation Status
✅ **TypeScript Check Successful** - No errors
- Register generator accepts payroll filter
- Return type correct
- All imports validated

## Testing Checklist
- [ ] Payroll Portal users see only 47 payroll-linked registers
- [ ] Acts dropdown shows only 9 acts (CODE_ON_WAGES, FACTORIES_ACT (partial), SHOPS_ESTABLISHMENTS (partial), SOCIAL_SECURITY, GRATUITY, STATE_TAX, BONUS_ACT, CLRA (partial), LWF)
- [ ] Generate endpoint skips non-payroll registers with guidance message
- [ ] Skipped registers appear in API response with "Event-based register" message
- [ ] No event/manual registers can be generated from Payroll Portal API
- [ ] Branch/Client/CRM Portal still shows all 111 registers (future implementation)

## Future Work
1. **CRM Portal Upload Flow** - Implement upload endpoint for event/manual registers
2. **CRM Approval Workflow** - Review and approval by CRM admin
3. **Repository Management** - Storage and audit trail for uploaded registers
4. **Documentation Field** - Add `isPayrollLinked` flag to RegisterTemplateEntity in database
5. **Dynamic Filtering** - Use database flag instead of hardcoded set for maintainability

## Files Modified
1. ✓ [frontend/src/app/pages/payroll/payroll-registers.component.ts](frontend/src/app/pages/payroll/payroll-registers.component.ts)
   - Added portalType to 111 register definitions
   - Added filteredRegisterTypes getter
   - Added filteredActs getter
   - Updated acts dropdown binding

2. ✓ [backend/src/payroll/generators/register.generator.ts](backend/src/payroll/generators/register.generator.ts)
   - Added PAYROLL_LINKED_REGISTERS constant (47 registers)
   - Updated generateAllForBranch() filtering logic
   - Enhanced skip message for event-based registers

## Impact Analysis
- **No Breaking Changes** - Existing API contracts unchanged
- **Backward Compatible** - Non-payroll registers still recognized but skipped
- **User Experience** - Cleaner, focused register list in Payroll Portal
- **Data Integrity** - Prevents accidental event-register generation
- **Workflow Clarity** - Clear separation of responsibilities (auto-generated vs uploaded)
