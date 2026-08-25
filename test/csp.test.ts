import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCsp } from '../src/lib/csp.js';
import { setSetting } from '../src/lib/settings.js';

function chiThi(ten: string, csp = buildCsp()): string {
  const phan = csp.split('; ').find((d) => d.startsWith(`${ten} `) || d === ten);
  return phan ?? '';
}

test('script-src chi cho phep tep tu chinh may chu', () => {
  assert.equal(chiThi('script-src'), "script-src 'self'");
  // Khong duoc co unsafe-inline / unsafe-eval o script - do la ca diem cua CSP
  assert.equal(buildCsp().includes("script-src 'self' 'unsafe-inline'"), false);
  assert.equal(buildCsp().includes('unsafe-eval'), false);
});

test('chan cac duong tan cong khac', () => {
  assert.equal(chiThi('base-uri'), "base-uri 'none'");
  assert.equal(chiThi('object-src'), "object-src 'none'");
  assert.equal(chiThi('form-action'), "form-action 'self'");
  assert.equal(chiThi('frame-ancestors'), "frame-ancestors 'self'");
  assert.equal(chiThi('default-src'), "default-src 'self'");
});

test('img-src mo dung nguon ma QR chuyen khoan cua SePay', () => {
  const d = chiThi('img-src');
  assert.ok(d.includes("'self'"));
  assert.ok(d.includes('data:'));
  assert.ok(d.includes('https://qr.sepay.vn'));
  // Khong mo `https:` chung chung
  assert.equal(/\bhttps:(?!\/\/)/.test(d), false);
});

test('logo do quan tri dat duoc them vao img-src theo goc, khong theo duong dan', () => {
  setSetting('site.logo_url', 'https://cdn.vi-du.vn/thu-muc/logo.png?v=2');
  try {
    const d = chiThi('img-src');
    assert.ok(d.includes('https://cdn.vi-du.vn'), d);
    assert.equal(d.includes('/thu-muc/logo.png'), false, 'chi lay goc, khong lay duong dan');
  } finally {
    setSetting('site.logo_url', '');
  }
});

test('logo dat sai dinh dang thi bo qua, khong lam hong chinh sach', () => {
  for (const xau of ['khong-phai-url', 'javascript:alert(1)', '   ', '/anh/logo.png']) {
    setSetting('site.logo_url', xau);
    const d = chiThi('img-src');
    assert.equal(d.includes('javascript'), false);
    assert.ok(d.startsWith("img-src 'self' data:"), `${xau} -> ${d}`);
  }
  setSetting('site.logo_url', '');
});

/**
 * CSP chi co gia tri khi ma nguon KHONG dua vao script noi tuyen. Bai nay quet
 * lai toan bo view moi lan chay - neu ai do them `onclick=` hay the <script>
 * noi tuyen thi se lo ra ngay day, truoc khi len may that.
 */
test('khong co script noi tuyen nao trong view', () => {
  const goc = path.join(process.cwd(), 'src', 'views');
  const viPham: string[] = [];

  const quet = (thuMuc: string): void => {
    for (const muc of fs.readdirSync(thuMuc, { withFileTypes: true })) {
      const duongDan = path.join(thuMuc, muc.name);
      if (muc.isDirectory()) { quet(duongDan); continue; }
      if (!muc.name.endsWith('.ejs')) continue;

      const noiDung = fs.readFileSync(duongDan, 'utf8');
      const ten = path.relative(goc, duongDan);

      // Xu ly su kien noi tuyen: onclick=, onchange=...
      for (const m of noiDung.matchAll(/\son[a-z]+\s*=\s*"/gi)) {
        viPham.push(`${ten}: ${m[0].trim()}`);
      }
      // The <script> co noi dung (the co src thi hop le)
      for (const m of noiDung.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)) {
        viPham.push(`${ten}: ${m[0]}`);
      }
      // href="javascript:..."
      if (/href\s*=\s*"javascript:/i.test(noiDung)) viPham.push(`${ten}: href="javascript:`);
    }
  };
  quet(goc);

  assert.deepEqual(viPham, [], `CSP se chan cac cho nay:\n${viPham.join('\n')}`);
});
