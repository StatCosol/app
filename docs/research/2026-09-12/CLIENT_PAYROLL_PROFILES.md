# Client-specific payroll profiles

Each client uses its own payroll setup, salary structures, formula parameters, component flags and payslip layout. Structures can override the client default for an employee, grade, department or branch and carry effective dates and approval status. Shared calculation code executes these isolated profiles; copying the codebase per client would make calculation fixes inconsistent.

Regular payroll runs use pay_salary_structures, pay_salary_structure_items, pay_rule_sets and payroll_client_setup. The separate payroll_client_structures calculator is a planning tool, not the executor used by payroll runs. The UI now states that distinction and links to the selected client's run structures and setup. These models have not been automatically migrated or combined.

Contract payroll uses client/branch/contractor quotations, client payroll setup and its approval workflow. This change does not alter contractor formulas or migrate live configurations.

Implemented:
- Configuration requests check stored resource ownership and assigned client access, including CCO managed-client scope.
- Mixed-client references and bulk component references are rejected. Shared template changes require an administrator.
- Engine previews and payroll runs honor the same pinned rule set and reject foreign, wrong-branch, inactive or out-of-period pins.
- Creating/copying a planning structure reads its saved record within the same transaction.

To configure each client, obtain the effective date, regular/contract worker applicability, components/formulas, attendance divisor, leave and weekly-off treatment, overtime rules, deductions, employer contributions, rounding, payslip layout and branch/grade/contractor exceptions. Validate synthetic full-month, joining/leaving, absence, overtime, arrears and deduction examples before approval.

Pending: actual client-specific values and expected outputs from the user. No live payroll was recalculated or published. Unifying the planning calculator and executor, including statutory configuration mapping and migration of approved versions, remains separate work requiring validated client examples.
