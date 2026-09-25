export type PfPendingEmployee = {
  employeeId: string;
  empCode: string;
  name: string;
  dateOfJoining: string | null;
  pfApplicable: boolean;
  pfRegistered: boolean;
  uanAvailable: boolean;
  uan: string | null;
  pendingDays: number;
};

export type EsiPendingEmployee = {
  employeeId: string;
  empCode: string;
  name: string;
  dateOfJoining: string | null;
  esiApplicable: boolean;
  esiRegistered: boolean;
  ipNumberAvailable: boolean;
  ipNumber: string | null;
  pendingDays: number;
};

/** @deprecated Use PfPendingEmployee or EsiPendingEmployee instead */
export type PendingEmployee = PfPendingEmployee | EsiPendingEmployee;

/** Marked registered but carrying no UAN or ESIC number. */
export type MissingNumberEmployee = {
  employeeId: string;
  empCode: string;
  name: string;
  dateOfJoining: string | null;
};

export type PfEsiSummaryResponse = {
  pf: {
    registered: number;
    notRegisteredApplicable: number;
    pendingEmployees: PfPendingEmployee[];
    registeredWithoutNumber: number;
    missingNumberEmployees: MissingNumberEmployee[];
  };
  esi: {
    registered: number;
    notRegisteredApplicable: number;
    pendingEmployees: EsiPendingEmployee[];
    registeredWithoutNumber: number;
    missingNumberEmployees: MissingNumberEmployee[];
  };
};

export type ContractorUploadItem = {
  contractorUserId: string;
  name: string;
  percent: number;
  uploaded: number;
  expected: number;
};

export type ContractorUploadSummaryResponse = {
  overallPercent: number;
  contractors: ContractorUploadItem[];
  top10: ContractorUploadItem[];
  bottom10: ContractorUploadItem[];
};
