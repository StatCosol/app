// Fictional, reproducible CLRA regression inputs. Not production seed data.
export const contrackSample = {
  "notice": "Fictional test data only. No real identities, passwords, bank details or statutory identifiers. Wage amounts are test inputs, not statutory advice.",
  "contractor": {
    "id": "00000000-0000-4000-8000-000000000001",
    "contractorCode": "SAMPLE-CT-001",
    "legalName": "Sample Contractor Services"
  },
  "assignment": {
    "id": "00000000-0000-4000-8000-000000000002",
    "contractorId": "00000000-0000-4000-8000-000000000001",
    "peEstablishmentId": "00000000-0000-4000-8000-000000000003",
    "assignmentCode": "SAMPLE-ASG-001",
    "natureOfWork": "Sample packing work",
    "stateCode": "TS",
    "startDate": "2026-09-01"
  },
  "workers": [
    {
      "id": "00000000-0000-4000-8000-000000000010",
      "contractorId": "00000000-0000-4000-8000-000000000001",
      "workerCode": "SAMPLE-W001",
      "fullName": "Sample Worker 1",
      "category": "SKILLED"
    },
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "contractorId": "00000000-0000-4000-8000-000000000001",
      "workerCode": "SAMPLE-W002",
      "fullName": "Sample Worker 2",
      "category": "SKILLED"
    }
  ],
  "periods": [
    {
      "id": "00000000-0000-4000-8000-000000000020",
      "assignmentId": "00000000-0000-4000-8000-000000000002",
      "periodFrom": "2026-09-01",
      "periodTo": "2026-09-30",
      "wageMonth": 9,
      "wageYear": 2026,
      "status": "OPEN"
    },
    {
      "id": "00000000-0000-4000-8000-000000000021",
      "assignmentId": "00000000-0000-4000-8000-000000000002",
      "periodFrom": "2026-10-01",
      "periodTo": "2026-10-31",
      "wageMonth": 10,
      "wageYear": 2026,
      "status": "OPEN"
    }
  ],
  "deployments": [
    {
      "id": "00000000-0000-4000-8000-000000000030",
      "assignmentId": "00000000-0000-4000-8000-000000000002",
      "workerId": "00000000-0000-4000-8000-000000000010",
      "deploymentStart": "2026-09-01"
    },
    {
      "id": "00000000-0000-4000-8000-000000000031",
      "assignmentId": "00000000-0000-4000-8000-000000000002",
      "workerId": "00000000-0000-4000-8000-000000000011",
      "deploymentStart": "2026-09-01"
    }
  ],
  "attendance": [
    {
      "id": "00000000-0000-4000-8000-000000000040",
      "wagePeriodId": "00000000-0000-4000-8000-000000000020",
      "workerDeploymentId": "00000000-0000-4000-8000-000000000030",
      "attendanceDate": "2026-09-05",
      "status": "P",
      "normalHours": 8,
      "otHours": 0
    },
    {
      "id": "00000000-0000-4000-8000-000000000041",
      "wagePeriodId": "00000000-0000-4000-8000-000000000021",
      "workerDeploymentId": "00000000-0000-4000-8000-000000000031",
      "attendanceDate": "2026-10-05",
      "status": "P",
      "normalHours": 8,
      "otHours": 1
    }
  ],
  "wages": [
    {
      "id": "00000000-0000-4000-8000-000000000050",
      "wagePeriodId": "00000000-0000-4000-8000-000000000020",
      "workerDeploymentId": "00000000-0000-4000-8000-000000000030",
      "daysWorked": 20,
      "basicWage": 10000,
      "grossWages": 10000,
      "netWages": 10000
    },
    {
      "id": "00000000-0000-4000-8000-000000000051",
      "wagePeriodId": "00000000-0000-4000-8000-000000000021",
      "workerDeploymentId": "00000000-0000-4000-8000-000000000031",
      "daysWorked": 21,
      "basicWage": 10500,
      "grossWages": 10500,
      "netWages": 10500
    }
  ],
  "registers": [
    {
      "id": "00000000-0000-4000-8000-000000000060",
      "assignmentId": "00000000-0000-4000-8000-000000000002",
      "registerCode": "FORM_XII",
      "status": "GENERATED"
    }
  ]
};
