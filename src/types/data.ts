export type ScopeRoot = 'user' | 'project';

export interface SkillRecord {
  id: string;
  displayName: string;
  description?: string;
  scope: ScopeRoot;
  source: 'single-file' | 'directory';
  path: string;
  installedHash?: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description?: string;
  version?: string;
  gitUrl: string;
  sha: string;
  hash: string;
  subpath?: string;
}

export interface CatalogIndex {
  schemaVersion: 1;
  generatedAt: string;
  seedPhase?: boolean;
  entries: CatalogEntry[];
}

export interface ValidationReceipt {
  ref: string;
  sha256: string;
  approvedHash: string;
  fileListHash: string;
  scope: ScopeRoot;
  finalTarget: string;
  nonce: string;
  expiresAt: number;
}
