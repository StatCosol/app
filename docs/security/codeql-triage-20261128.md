# CodeQL review — 28 November 2026

Reviewed the 42 open default-branch alerts, focusing on the two reflected-XSS and 19 path-injection findings. Baseline: `815339b` (main after #885). This is not a claim that the remaining 21 alerts are false positives or fully reviewed.

## Findings requiring fixes (six alerts, four entry points)

| Alerts | Entry point | Finding and correction |
|---|---|---|
| 253, 191 | MonthlyDocumentsService.upload | The month was only a nonempty string and became a folder segment. Validate YYYY-MM with a real month both in the DTO and at the service boundary before writing. |
| 192, 193 | NominationsService.generateForm / createPdf | Employee code was included verbatim in the output filename. Use the existing random, sanitized upload filename generator, retaining the original code inside the PDF and leaving historical files unchanged. |
| 189 | ClientEmployeesController.generateForm | The second nomination writer also used a raw employee code. Use the same safe filename generator. |
| 186 | CrmComplianceTrackerController.uploadMcdItem | The SQL lookup parsed a numeric prefix, but the filename used the original string. Require a positive safe integer and generate the filename from the scoped database ID with a sanitized extension. |

Keep these alerts open until the fixes are merged and the default-branch scan confirms their status. They must not be dismissed as false positives.

## Supported false-positive dispositions

| Alerts | Evidence on the baseline |
|---|---|
| 202, 203 | EsslIclockController.pushData declares Content-Type text/plain for both ATTLOG and other-table replies. main.ts enables Helmet's default X-Content-Type-Options: nosniff. Isolated HTTP tests pass HTML-looking Stamp values through both branches and verify plaintext plus nosniff. No attendance is ingested in these tests. |
| 254, 198 | SafetyDocumentsService.upload checks the branch against client_branches.id and clientid before mkdir/write. These are UUID columns; an invalid path-like ID cannot pass this database lookup. clientId is the authenticated client context. The disk filename is produced by uniqueUploadDiskName. |
| 249, 188, 250 | UploadCrmDocumentDto validates clientId/branchId as UUIDs, scope as COMPANY/BRANCH, and month as YYYY-MM. Those are the only dynamic directory segments. uniqueUploadDiskName supplies the filename. safeUnlink only receives the server-constructed fullPath for failed-persistence cleanup. |
| 248, 185 | UploadComplianceDocumentDto validates clientId as UUID. The category directory is stripped to letters/underscore, and the disk filename comes from uniqueUploadDiskName. branchId is not part of this filesystem path. |
| 247, 246, 183 | Branch upload checks authenticated client/branch access before saveFile. CRM on-behalf upload checks the assigned client and active branch against UUID database columns before saveFile. The return code/year prefix and original filename are sanitized by uniqueUploadDiskName. |
| 212 | ReturnsService.saveFile uses a fixed uploads/returns directory. Both callers pass literal ack or challan kinds. The original filename is reduced to alphanumeric, dot, hyphen and underscore, capped at 80 characters and preceded by a server timestamp/random prefix. It cannot supply a directory separator or dot-segment filename. |
| 251, 252 | Face photo paths use authenticated/scoped client and subject UUIDs. FaceDesk saveProfile resolves the subject against employees/contractor_employees UUID columns before uploadRepresentativePhoto. Kiosk submissions read client/subject UUIDs from the stored ticket; self-enrollment uses authenticated IDs or the scoped contractor lookup. Punch photos use the scoped device and matched stored subject. The filename is randomUUID().jpg. |

Only the 15 alerts in this table qualify for false-positive dismissal on this evidence. Do not use a rule-wide suppression: future callers that bypass these checks need fresh review.

## Validation and data protection

- Document writer tests reject slash/backslash traversal, partial numeric IDs, invalid months and overlong employee codes; valid operations remain scoped to their expected folders.
- Filesystem writes, repositories, PDF generation and eSSL ingestion are mocked. Tests do not access production databases, upload evidence, send reminders, or modify attendance/payroll balances.
- Existing generated documents retain their stored names and paths; only newly generated files use the safe names.
- The eSSL source-IP restriction in PR #884 remains a separate draft pending approved device network addresses.
