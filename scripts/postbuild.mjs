/**
 * Sao chep tai nguyen khong phai TypeScript sang thu muc dist sau khi build.
 * (tsc chi bien dich .ts, khong copy .ejs / .sql)
 */
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const copies = [
  ['src/views', 'dist/views'],
  ['src/db/schema.sql', 'dist/db/schema.sql'],
];

for (const [from, to] of copies) {
  const dest = path.join(root, to);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(path.join(root, from), dest, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
