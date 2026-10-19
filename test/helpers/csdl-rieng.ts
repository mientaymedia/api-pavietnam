/**
 * CSDL RIENG cho mot tep test. Phai import DAU TIEN (truoc moi module cua src):
 * config doc DATABASE_FILE luc nap.
 *
 * Vi sao: cac tep chay song song tren cung mot CSDL (scripts/chay-test.mjs).
 * Kich hoat don cho quy quet MOI dong dang giu, nen tep nay co the dang ky
 * nham dong giu cua tep khac (qua may chu P.A gia cua minh) va lam tep kia sai.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-csdl-rieng-'));
process.env['DATABASE_FILE'] = path.join(thuMuc, 'test.sqlite');
process.on('exit', () => {
  try {
    fs.rmSync(thuMuc, { recursive: true, force: true });
  } catch {
    // Windows co the con giu tep WAL: de he dieu hanh don thu muc tam
  }
});
