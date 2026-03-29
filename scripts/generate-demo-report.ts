import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { buildMonitoringSnapshot, buildReportMarkdown, DEMO_NOW } from '../packages/core/src';

const logger = pino({ level: 'info' });
const reportPath = path.resolve(process.cwd(), 'reports/demo-report.md');
const snapshotPath = path.resolve(process.cwd(), 'data/generated/demo-snapshot.json');

const main = async (): Promise<void> => {
  const snapshot = await buildMonitoringSnapshot({ logger, now: process.env.DEMO_NOW ?? DEMO_NOW, windowHours: 72 });
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

  const markdown = buildReportMarkdown(snapshot);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown, 'utf8');
  logger.info({ reportPath }, 'Demo report generated');
};

void main();
