import fs from 'node:fs/promises';
import path from 'node:path';

export const ensureParentDirectory = async (targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};
