/**
 * scripts/pa-thu-endpoint-test.mjs: chi chay voi interface_test.php, in
 * Command/ReturnCode/ReturnText, khong in apikey. Chay voi may chu P.A gia.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { moPaGia, type PaGia } from './helpers/pa-gia.js';

let pa: PaGia;
before(async () => { pa = await moPaGia(); });
after(async () => { await pa.dong(); });

const KHOA = 'KHOA-RAT-BI-MAT-0987654321';

function chay(env: Record<string, string>): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const sach = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PA_|PAVIETNAM_)/.test(k)));
    const p = spawn(process.execPath, ['--import', 'tsx', 'scripts/pa-thu-endpoint-test.mjs'], { env: { ...sach, ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('exit', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

test('tu choi endpoint that interface.php, khong gui request nao', async () => {
  pa.datLai();
  const r = await chay({ PA_USERNAME: 'u', PA_APIKEY: KHOA, PA_ENDPOINT: `${pa.goc}/interface.php` });
  assert.equal(r.code, 2);
  assert.match(r.err, /không phải interface_test\.php/);
  assert.equal(pa.yeuCau.length, 0);
  const r2 = await chay({ PA_USERNAME: 'u', PA_APIKEY: KHOA, PA_ENDPOINT: 'https://daily.pavietnam.vn/interface.php' });
  assert.equal(r2.code, 2);
  const r3 = await chay({ PA_USERNAME: 'u', PA_APIKEY: KHOA, PA_ENDPOINT: `${pa.goc}/interface_test.php.php` });
  assert.equal(r3.code, 2);
});

test('thieu username / apikey: dung', async () => {
  const r = await chay({ PA_ENDPOINT: `${pa.goc}/interface_test.php` });
  assert.equal(r.code, 2);
  assert.match(r.err, /thiếu PA_USERNAME/);
});

test('endpoint thu: goi 6 lenh, in Command/ReturnCode/ReturnText, khong lo apikey', async () => {
  pa.datLai();
  // P.A gia vong lai apikey trong ReturnText de chac script khong in ra
  pa.dat('change_dns_domain_quocte', (q) => ({ body: JSON.stringify({ Command: q.cmd, ReturnCode: 900, ReturnText: `ok ${q.thamSo['apikey']}` }) }));
  const r = await chay({ PAVIETNAM_USERNAME: 'daily-thu', PAVIETNAM_APIKEY: KHOA, PAVIETNAM_ENDPOINT_TEST: `${pa.goc}/interface_test.php` });
  assert.equal(r.code, 0, r.out + r.err);
  assert.deepEqual(pa.yeuCau.map((q) => q.cmd), [
    'register_domain_vietnam', 'register_domain_vietnam', 'register_domain_quocte', 'renew_domain',
    'change_dns_domain_vietnam', 'change_dns_domain_quocte',
  ]);
  assert.ok(pa.yeuCau.every((q) => q.duongDan === '/interface_test.php'));
  assert.equal((r.out.match(/ReturnCode=900/g) ?? []).length, 6);
  assert.match(r.out, /Command=register_domain_vietnam/);
  assert.ok(!r.out.includes(KHOA) && !r.err.includes(KHOA));
  const congTy = pa.yeuCau[1]!.thamSo;
  assert.equal(congTy['for'], 'congty');
  assert.equal(congTy['adminName'], 'Đinh Văn Tạo Em');
  assert.equal(pa.yeuCau[4]!.thamSo['domainIP1'], '112.213.89.3');
});

test('co lenh khong tra 900 thi thoat 1', async () => {
  pa.datLai();
  pa.dat('renew_domain', { body: JSON.stringify({ Command: 'renew_domain', ReturnCode: 2033, ReturnText: 'Lỗi: thiếu tham số' }) });
  const r = await chay({ PA_USERNAME: 'u', PA_APIKEY: KHOA, PA_ENDPOINT: `${pa.goc}/interface_test.php` });
  assert.equal(r.code, 1);
  assert.match(r.out, /ReturnCode=2033/);
});
