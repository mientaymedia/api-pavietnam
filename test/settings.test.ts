import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettingNumber, getSettingBool, getSetting, setSetting, invalidateSettingsCache } from '../src/lib/settings.js';
import { decryptSecret } from '../src/lib/crypto.js';
import { db } from '../src/db/index.js';

const key = (n: string) => `test.${n}.${Math.random().toString(36).slice(2)}`;

test('cau hinh SO de trong phai dung gia tri mac dinh, khong phai 0', () => {
  // Number('') === 0 nen day tung lam smtp.port thanh 0 va email khong gui duoc
  assert.equal(getSettingNumber(key('chua_dat'), 587), 587);

  const k = key('rong');
  setSetting(k, '');
  assert.equal(getSettingNumber(k, 48), 48);

  const kSpace = key('khoang_trang');
  setSetting(kSpace, '   ');
  assert.equal(getSettingNumber(kSpace, 14), 14);
});

test('cau hinh SO co gia tri that thi dung gia tri do', () => {
  const k = key('co_gia_tri');
  setSetting(k, '25');
  assert.equal(getSettingNumber(k, 99), 25);
});

test('so 0 duoc dat co y phai duoc ton trong', () => {
  const k = key('so_khong');
  setSetting(k, '0');
  assert.equal(getSettingNumber(k, 10), 0); // khac han voi "de trong"
});

test('gia tri khong phai so thi dung mac dinh', () => {
  const k = key('rac');
  setSetting(k, 'khong-phai-so');
  assert.equal(getSettingNumber(k, 7), 7);
});

test('cau hinh dang bat/tat', () => {
  const k = key('bool');
  setSetting(k, '1');
  assert.equal(getSettingBool(k, false), true);
  setSetting(k, '0');
  assert.equal(getSettingBool(k, true), false);
  assert.equal(getSettingBool(key('chua_dat_bool'), true), true);
});

test('secret duoc ma hoa truoc khi luu vao CSDL', () => {
  const k = key('secret');
  const plain = 'khoa-bi-mat-khong-duoc-lo';
  setSetting(k, plain, true);

  const row = db.prepare('SELECT value, is_secret FROM settings WHERE key = ?').get(k) as
    { value: string; is_secret: number };

  assert.equal(row.is_secret, 1);
  assert.notEqual(row.value, plain);          // khong luu dang goc
  assert.ok(row.value.startsWith('v1.'));
  assert.equal(decryptSecret(row.value), plain);
  assert.equal(getSetting(k), plain);          // doc ra van dung
});

test('bo nho dem duoc lam moi sau khi ghi', () => {
  const k = key('cache');
  setSetting(k, 'truoc');
  assert.equal(getSetting(k), 'truoc');
  setSetting(k, 'sau');
  assert.equal(getSetting(k), 'sau');
  invalidateSettingsCache();
  assert.equal(getSetting(k), 'sau');
});
