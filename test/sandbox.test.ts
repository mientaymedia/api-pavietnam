import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { getSetting } from '../src/lib/settings.js';
import { call, getAuthCode } from '../src/pavietnam/client.js';
import { RegistrarError } from '../src/pavietnam/types.js';

// Doi cau hinh ngay trong tien trinh (khong ghi vao bang settings): cac tep
// test khac chay song song tren cung CSDL va phai luon o che do gia lap.
function voiCauHinh(over: { sandbox: boolean }, fn: () => Promise<void>): Promise<void> {
  const cu = { sandbox: config.pa.sandbox, username: config.pa.username, apikey: config.pa.apikey };
  config.pa.sandbox = over.sandbox;
  config.pa.username = '';
  config.pa.apikey = '';
  return fn().finally(() => Object.assign(config.pa, cu));
}

const coKeyTrongCsdl = () => Boolean(getSetting('pa.username') || getSetting('pa.apikey'));
const sandboxTrongCsdl = () => getSetting('pa.sandbox') !== '';

test('sandbox chay duoc khi chua co username/API Key', async (t) => {
  if (coKeyTrongCsdl() || sandboxTrongCsdl()) return t.skip('CSDL test da co cau hinh P.A rieng');
  await voiCauHinh({ sandbox: true }, async () => {
    const r = await getAuthCode('vidu-sandbox.vn');
    assert.ok(r.authCode.length > 0);
  });
});

test('che do that thieu key van bao NO_CREDENTIALS, khong goi mang', async (t) => {
  if (coKeyTrongCsdl() || sandboxTrongCsdl()) return t.skip('CSDL test da co cau hinh P.A rieng');
  await voiCauHinh({ sandbox: false }, async () => {
    await assert.rejects(
      () => call('check_domain', { domain: 'vidu.vn' }),
      (err: unknown) => err instanceof RegistrarError && err.code === 'NO_CREDENTIALS',
    );
  });
});
