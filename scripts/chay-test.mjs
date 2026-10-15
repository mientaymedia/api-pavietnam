/**
 * Chay toan bo test, dung duoc ca tren Windows (cmd/PowerShell) lan Linux.
 *
 * Thay cho `DATABASE_FILE=... node --test test/*.test.ts`: cu phap gan bien
 * kieu Linux khong chay tren cmd.exe, cmd.exe khong mo rong glob, va
 * `node --test` cua Node 20 chua tu mo rong glob (engines la >=20).
 *
 *   npm test                                 # CSDL tam, xoa khi xong
 *   npm test -- --test-reporter=spec         # tham so them chuyen cho node --test
 *   DATABASE_FILE=/tmp/x.sqlite npm test     # dung CSDL chi dinh, khong xoa
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let tmpDir = null;
const env = { ...process.env };
if (!env.DATABASE_FILE) {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'api-pavietnam-test-'));
  env.DATABASE_FILE = path.join(tmpDir, 'test.sqlite');
}
// Test khong bao gio goi P.A that. dotenv khong ghi de bien da co, nen .env
// tren may dev (neu co key that) khong lam lech gia tri nay.
env.PAVIETNAM_SANDBOX = '1';

const files = readdirSync(path.join(root, 'test'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('test', f));

function chay(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root, env });
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

// Tao bang mot lan TRUOC khi cac tep test chay song song: CSDL moi tinh ma
// nhieu tien trinh cung chuyen sang WAL va tao bang thi co lan bi
// "database is locked" (truoc day khong lo vi data/test.sqlite duoc giu lai).
let code = await chay(['--import', 'tsx', 'src/db/migrate.ts']);
if (code === 0) code = await chay(['--test', '--import', 'tsx', ...process.argv.slice(2), ...files]);
if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
process.exit(code);
