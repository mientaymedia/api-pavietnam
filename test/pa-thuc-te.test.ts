/**
 * Dinh dang phan hoi THAT cua API dai ly P.A (xac minh 18/10/2026 tu IP VPS da whitelist):
 * - tham so lenh la `cmd`
 * - `check_whois` tra so tran '1' (con trong) / '0' (da co chu), co the kem BOM
 * - lenh sai tra `<pre>Array ( [Command] => INVALID COMMAND! [ReturnCode] => 600 [ReturnText] => ... ) </pre>`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, FIELDS } from '../src/pavietnam/actions.js';
import { docKetQuaKiemTra, interpret, lamSachPhanHoi, thongBaoLoiPA } from '../src/pavietnam/client.js';
import { parseResponse } from '../src/pavietnam/parse.js';

const LOI_LENH =
  '<pre>Array\n(\n    [Command] => INVALID COMMAND!\n    [ReturnCode] => 600\n    [ReturnText] => Lỗi: Lệnh thực thi không được hỗ trợ\n)\n</pre>';

function phanHoi(raw: string) {
  const data = parseResponse(raw);
  return { raw, data, ...interpret(data, raw) };
}

test('mac dinh dung tham so cmd va lenh check_whois, get_whois', () => {
  assert.equal(FIELDS.command, 'cmd');
  assert.equal(ACTIONS.check, 'check_whois');
  assert.equal(ACTIONS.whois, 'get_whois');
});

test('check_whois: 1 la con trong, 0 la da co chu, ke ca co BOM va xuong dong', () => {
  for (const raw of ['1', '﻿1', ' 1\n', '﻿ 1 \r\n']) assert.equal(docKetQuaKiemTra(phanHoi(raw)), true, JSON.stringify(raw));
  for (const raw of ['0', '﻿0', '0\n']) assert.equal(docKetQuaKiemTra(phanHoi(raw)), false, JSON.stringify(raw));
});

test('lenh sai / IP chua whitelist -> nem loi kem ReturnText, khong bao nham da co chu', () => {
  assert.throws(() => docKetQuaKiemTra(phanHoi(LOI_LENH)), /Lệnh thực thi không được hỗ trợ/);
  const loiIp = '501 => Lỗi: IP không được phép truy cập hệ thống API (<b>42.116.253.15</b>)';
  assert.throws(() => docKetQuaKiemTra(phanHoi(loiIp)));
  const loiKey = '202 => Lỗi: Username đại lý hoặc API key không đúng (API Key thay cho password đại lý)';
  assert.throws(() => docKetQuaKiemTra(phanHoi(loiKey)));
});

test('dang JSON cu (sandbox) van doc duoc', () => {
  assert.equal(docKetQuaKiemTra(phanHoi(JSON.stringify({ status: 'OK', available: 1 }))), true);
  assert.equal(docKetQuaKiemTra(phanHoi(JSON.stringify({ status: 'OK', available: 0 }))), false);
});

test('lamSachPhanHoi va thongBaoLoiPA', () => {
  assert.equal(lamSachPhanHoi('﻿ 1 \n'), '1');
  assert.equal(thongBaoLoiPA(LOI_LENH), 'Lỗi: Lệnh thực thi không được hỗ trợ');
  assert.equal(thongBaoLoiPA('1'), '');
});

test('ngay WHOIS co mui gio dang +0000 doc duoc', async () => {
  const { normalizeDate } = await import('../src/pavietnam/parse.js');
  assert.equal(normalizeDate('2028-09-13T07:00:00+0000'), '2028-09-13T07:00:00Z');
  assert.equal(normalizeDate('2028-09-13T14:00:00+0700'), '2028-09-13T07:00:00Z');
  assert.equal(normalizeDate('2028-09-13T07:00:00Z'), '2028-09-13T07:00:00Z');
  assert.equal(normalizeDate('2028-09-13'), '2028-09-13T00:00:00Z');
});
