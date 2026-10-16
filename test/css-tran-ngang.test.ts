/**
 * Bo cuc khong duoc tran ngang tren dien thoai (360px).
 *
 * Evals trang chu, loi 2: trang don hang (noi khach quet QR) rong 537px, chi
 * tiet ten mien 391px o khung 360px. Nguyen nhan: cot luoi `1fr` co min-width
 * auto, bang con khong co cho cuon nen keo ca cot rong theo. Do bang Chrome
 * headless o scratchpad; test nay giu quy tac CSS de loi khong quay lai.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('public/css/app.css', 'utf8');

/** Moi gia tri grid-template-columns gan cho mot bo chon co chua `ten`. */
function cotCua(ten: string): string[] {
  const ra: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const chon = m[1]!.split(',').map((s) => s.trim());
    if (!chon.some((c) => c === ten)) continue;
    const cot = m[2]!.match(/grid-template-columns:\s*([^;]+);/);
    if (cot) ra.push(cot[1]!.trim());
  }
  return ra;
}

/** Bo cac minmax(...) roi moi tim `fr` tran: `1fr` tran la cot co min-width auto. */
function boMinmax(v: string): string {
  return v.replace(/minmax\([^)]*\)/g, '');
}

test('sidebar-layout mot cot dung minmax(0, 1fr), khong de bang keo rong (evals trang chu, loi 2)', () => {
  const ds = cotCua('.sidebar-layout');
  assert.ok(ds.length >= 2, `phai co ca ban may tinh lan ban hep: ${ds.join(' | ')}`);
  for (const v of ds) assert.doesNotMatch(boMinmax(v), /\dfr/, `.sidebar-layout: ${v}`);
  assert.ok(ds.includes('minmax(0, 1fr)'));
});
