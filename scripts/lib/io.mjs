import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try { await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(tmp, path); }
  finally { await rm(tmp, { force: true }); }
}
