/**
 * Nap lai tinh, phuong xa qua get_province / get_ward (may chu P.A gia cuc bo).
 */
import './helpers/db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { docDanhSach, ghiDiaGioi, napTuPA } from '../src/pavietnam/napDiaGioi.js';
import { json, ma, moPaGia, type PaGia } from './helpers/pa-gia.js';

let pa: PaGia;
const cu = { ...config.pa };

before(async () => {
  pa = await moPaGia();
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, username: 'daily-thu', apikey: 'khoa-thu-123456789', retries: 0, log: false,
  });
});
after(async () => {
  Object.assign(config.pa, cu);
  await pa.dong();
});

test('doc danh sach mem: mang doi tuong, object boc mang, object ma -> ten', () => {
  assert.deepEqual(docDanhSach('[{"id":79,"name":"Thành phố Hồ Chí Minh"}]'), [{ id: 79, ten: 'Thành phố Hồ Chí Minh' }]);
  assert.deepEqual(docDanhSach('{"data":[{"province_id":"91","province_name":"Tỉnh An Giang"}]}'), [{ id: 91, ten: 'Tỉnh An Giang' }]);
  assert.deepEqual(docDanhSach('{"79":"Thành phố Hồ Chí Minh"}'), [{ id: 79, ten: 'Thành phố Hồ Chí Minh' }]);
  assert.deepEqual(docDanhSach('khong phai json'), []);
});

test('nap tu P.A: goi get_province roi get_ward theo province_id, ghi nguyen tu', async () => {
  pa.datLai();
  const d = await napTuPA();
  assert.deepEqual(d.tinh.map((t) => t.id), [79, 91]);
  assert.equal(d.tinh[1]!.phuong.length, 2);
  const wards = pa.yeuCau.filter((q) => q.cmd === 'get_ward').map((q) => q.thamSo['province_id']);
  assert.deepEqual(wards, ['79', '91']);
  const tep = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nap-dg-')), 'dia-gioi-pa.json');
  ghiDiaGioi(d, tep);
  assert.equal(JSON.parse(fs.readFileSync(tep, 'utf8')).tinh.length, 2);
  assert.equal(fs.existsSync(`${tep}.tmp`), false);
});

test('mot tinh khong co phuong xa: dung, khong tra du lieu thieu', async () => {
  pa.datLai();
  pa.dat('get_ward', (q) => (q.thamSo['province_id'] === '91' ? json([]) : json([{ id: 1, name: 'Phường A' }])));
  await assert.rejects(() => napTuPA(), /Tỉnh An Giang/);
  pa.dat('get_ward', null);
});

test('get_province bao loi IP: nem loi kem ReturnCode', async () => {
  pa.datLai();
  pa.dat('get_province', ma('get_province', 501, 'Lỗi: IP không được phép truy cập hệ thống API'));
  await assert.rejects(() => napTuPA(), /501/);
  pa.dat('get_province', null);
});
