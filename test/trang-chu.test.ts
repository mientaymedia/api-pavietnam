/**
 * Trang chu: gia tren trang phai lay tu bang gia that (priceFor), o tim gui
 * dung route tim kiem, tab chuyen ten mien dien san o nhap.
 *
 * Cac tep test chay song song tren cung CSDL va tu them duoi rieng, nen chi
 * khang dinh tren duoi do tep nay tao ra, khong dem tong so duoi.
 */
import './helpers/db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getTld, priceFor, upsertTld } from '../src/services/pricing.js';
import { formatVnd } from '../src/lib/money.js';

let server: Server;
let goc = '';

before(async () => {
  upsertTld({ tld: 'trangchu', kind: 'intl', label: 'Thử trang chủ', price_register: 123_000, price_renew: 456_000, price_transfer: 99_000, is_active: 1, is_featured: 1, sort_order: 1 });
  upsertTld({ tld: 'tatban', kind: 'intl', label: 'Đã ngừng bán', price_register: 777_000, price_renew: 777_000, is_active: 0, sort_order: 2 });
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

async function trang(p: string): Promise<{ status: number; html: string }> {
  const r = await fetch(goc + p, { redirect: 'manual' });
  return { status: r.status, html: await r.text() };
}

test('chip gia lay tu bang gia that, bo duoi ngung ban', async () => {
  const { status, html } = await trang('/');
  assert.equal(status, 200);
  const gia = formatVnd(priceFor(getTld('trangchu')!, 'register', 1).total);
  assert.match(html, new RegExp(`\\.trangchu[\\s\\S]{0,200}${gia.replace('.', '\\.')}`));
  assert.doesNotMatch(html, /\.tatban/);
});

test('o tim ten mien gui toi /tim-kiem voi tham so q', async () => {
  const { html } = await trang('/');
  assert.match(html, /<form[^>]*action="\/tim-kiem"[^>]*method="get"/);
  assert.match(html, /name="q"/);
});

test('chuyen ten mien: ?domain= dien san o nhap va duoc thoat ky tu', async () => {
  const { html } = await trang('/chuyen-ten-mien?domain=' + encodeURIComponent('https://www.ViDu.com/abc'));
  assert.match(html, /name="domain" value="vidu\.com"/);

  const xau = await trang('/chuyen-ten-mien?domain=' + encodeURIComponent('"><script>x</script>'));
  assert.equal(xau.status, 200);
  assert.doesNotMatch(xau.html, /<script>x<\/script>/);
});
