/**
 * Types for scripts/rotate-kek.mjs (kept in sync by hand; the script itself is
 * plain Node ESM). test/rotate-kek.test.ts imports the functions below.
 */
export interface RewrapVar {
  name: string;
  value: string;
}

export interface RewrapCounts {
  rewrapped: number;
  already: number;
  plaintext: number;
}

export interface RewrapRow {
  id: string;
  name?: string | null;
  vars: string;
}

export interface RewrapReport {
  id: string;
  name: string | null;
  /** The row's `vars` column before this pass (what --restore writes back). */
  before: string;
  after: string;
  changed: boolean;
  counts: RewrapCounts;
}

export interface RewrapFailure {
  id: string;
  name: string | null;
  reason: string;
}

export declare function isEncrypted(value: string): boolean;

export declare function encryptSecret(kek: string, plain: string): Promise<string>;

export declare function decryptSecret(kek: string, value: string): Promise<string>;

export declare function rewrapVars(
  oldKek: string | undefined,
  newKek: string,
  vars: RewrapVar[],
): Promise<{ vars: RewrapVar[]; counts: RewrapCounts }>;

export declare function rewrapRows(
  oldKek: string | undefined,
  newKek: string,
  rows: RewrapRow[],
): Promise<{ reports: RewrapReport[]; failures: RewrapFailure[] }>;

export declare function restoreRows(backup: unknown): {
  reports: Array<{ id: string; name: string | null; after: string }>;
  failures: RewrapFailure[];
};

export declare function verifyRows(
  newKek: string,
  rows: RewrapRow[],
): Promise<{ failures: RewrapFailure[]; plaintext: number }>;

export declare function selectSql(id?: string): string;

export declare function updateSql(id: string, varsJson: string): string;
