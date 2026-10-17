export interface MigrationStatus {
  id: string;
  title: string;
  description: string;
  sourcePath: string;
  targetPath: string;
  state: 'ready' | 'current' | 'missing' | 'conflict' | 'blocked';
  detail: string;
}

export interface MigrationSnapshot {
  migrations: MigrationStatus[];
  busy: boolean;
  startupRequired: boolean;
}

export interface MigrationResult {
  migration: MigrationStatus;
  changed: boolean;
}
