# Document Upload Pages Audit

Date: 2026-06-09

## Finding

CRM, Client, and Branch Desk users were seeing several similar document labels even though the pages are backed by different modules:

- Contractor documents: `contractor_documents`
- Branch compliance workflow documents: `compliance_documents`
- CRM/client compliance library: `compliance_doc_library`
- CRM shared files: `crm_unit_documents`
- Branch reference repository: `branch_documents`
- Safety documents: `safety_documents`

The live-safe fix is to clarify navigation and page labels while keeping existing routes active for saved links and existing permissions.

## Implemented Safe Live Changes

- Branch Desk sidebar now shows one operational entry, `Review / Reupload`, instead of three similar entries: `Documents`, `Compliance Docs`, and `Unit Documents`.
- Branch dashboard pending-upload action now opens `/branch/compliance/monthly` instead of the generic branch document repository.
- Client sidebar now labels `/client/branch-compliance` as `Upload Status`.
- Client sidebar now labels `/client/compliance/mcd` as `Monthly Uploads`.
- Client sidebar now labels `/client/compliance/library` as `Compliance Documents`.
- Client sidebar no longer promotes `/client/unit-documents` as a separate primary compliance task.
- CRM client overview now labels `documents` as `Contractor Documents`.
- CRM client overview now labels `unit-documents` as `CRM Shared Files`.
- Existing routes remain active for backwards compatibility and saved links.

## Next Refactor

The next safer step is a role-based document hub shell:

- Branch: monthly uploads, periodic uploads, review/reupload, registrations, safety, shared CRM files.
- Client: upload status, compliance documents, CRM shared files, returns, registrations, safety.
- CRM: review queues, client compliance library, CRM shared files, contractor documents, registrations, safety.

Do not merge the document tables until the hub is stable. The current tables represent different approval flows and ownership rules.
