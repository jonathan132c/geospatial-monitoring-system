import fs from 'node:fs/promises';
import { buildMonitoringSnapshot, validateBoundingBox, validatePolygon } from '../../../../packages/core/src';
import type { MonitoringSnapshot, RegionDefinition } from '../../../../packages/core/src';
import { ensureParentDirectory } from '../utils/fs';
import { logger } from '../logger';

export interface SnapshotRepository {
  getSnapshot(): Promise<MonitoringSnapshot>;
  saveSnapshot(snapshot: MonitoringSnapshot): Promise<void>;
  addRegion(region: RegionDefinition): Promise<RegionDefinition>;
}

export class FileSnapshotRepository implements SnapshotRepository {
  constructor(private readonly snapshotPath: string) {}

  async getSnapshot(): Promise<MonitoringSnapshot> {
    try {
      const raw = await fs.readFile(this.snapshotPath, 'utf8');
      return JSON.parse(raw) as MonitoringSnapshot;
    } catch {
      const snapshot = await buildMonitoringSnapshot({ logger });
      await this.saveSnapshot(snapshot);
      return snapshot;
    }
  }

  async saveSnapshot(snapshot: MonitoringSnapshot): Promise<void> {
    await ensureParentDirectory(this.snapshotPath);
    await fs.writeFile(this.snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  async addRegion(region: RegionDefinition): Promise<RegionDefinition> {
    validatePolygon(region.geometry);
    validateBoundingBox(region.bbox);
    const snapshot = await this.getSnapshot();
    const next: MonitoringSnapshot = {
      ...snapshot,
      regions: [...snapshot.regions.filter((item) => item.id !== region.id), region]
    };
    await this.saveSnapshot(next);
    return region;
  }
}

// Scaffolded for future live persistence wiring against the provided PostGIS schema.
export class PostgresSnapshotRepository implements SnapshotRepository {
  constructor(private readonly connectionString: string) {}

  async getSnapshot(): Promise<MonitoringSnapshot> {
    throw new Error(`PostgresSnapshotRepository is scaffolded but not wired in demo mode. Connection string: ${this.connectionString}`);
  }

  async saveSnapshot(_snapshot: MonitoringSnapshot): Promise<void> {
    throw new Error('PostgresSnapshotRepository saveSnapshot not wired in demo mode.');
  }

  async addRegion(_region: RegionDefinition): Promise<RegionDefinition> {
    throw new Error('PostgresSnapshotRepository addRegion not wired in demo mode.');
  }
}
