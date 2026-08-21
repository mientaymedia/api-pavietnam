import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainZnsError, isZnsReady, normalizePhone } from '../src/lib/zns.js';
import { ZNS_EVENTS, ZNS_EVENT_LIST } from '../src/services/znsEvents.js';
import { setSettings } from '../src/lib/settings.js';

test('chuan hoa so dien thoai ve dang 84xxxxxxxxx', () => {
  assert.equal(normalizePhone('0901234567'), '84901234567');
  assert.equal(normalizePhone('84901234567'), '84901234567');
  assert.equal(normalizePhone('+84 901 234 567'), '84901234567');
  assert.equal(normalizePhone('0901-234-567'), '84901234567');
  assert.equal(normalizePhone(' 0901 234 567 '), '84901234567');
});

test('tu choi so khong phai di dong Viet Nam', () => {
  assert.equal(normalizePhone('02838221234'), null); // so co dinh
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('khong-phai-so'), null);
  assert.equal(normalizePhone('0401234567'), null);  // dau so khong hop le
});

test('moi dau so di dong deu duoc chap nhan', () => {
  for (const dau of ['3', '5', '7', '8', '9']) {
    assert.equal(normalizePhone(`0${dau}01234567`), `84${dau}01234567`);
  }
});

test('ma loi Zalo duoc dien giai sang tieng Viet', () => {
  assert.match(explainZnsError(-124), /token/i);
  assert.match(explainZnsError(-213), /khong khop/i);
  assert.match(explainZnsError(-226), /chan|tuong tac/i);
  assert.match(explainZnsError(-230), /so du/i);
  assert.match(explainZnsError(-99999), /ma loi/i); // ma la van co mo ta
});

test('chua cau hinh thi ZNS bao chua san sang', () => {
  setSettings({ 'zns.enabled': '0', 'zns.app_id': '', 'zns.secret_key': '', 'zns.refresh_token': '' });
  assert.equal(isZnsReady(), false);

  // Bat nhung thieu thong tin -> van chua san sang
  setSettings({ 'zns.enabled': '1' });
  assert.equal(isZnsReady(), false);

  setSettings(
    { 'zns.app_id': 'APP', 'zns.secret_key': 'SEC', 'zns.refresh_token': 'REF' },
    ['zns.secret_key', 'zns.refresh_token'],
  );
  assert.equal(isZnsReady(), true);

  setSettings({ 'zns.enabled': '0' }); // don dep
});

test('moi su kien ZNS deu khai bao du template va tham so', () => {
  assert.ok(ZNS_EVENT_LIST.length >= 5);
  for (const e of ZNS_EVENT_LIST) {
    assert.ok(e.settingKey.startsWith('zns.tpl.'), `${e.event} thieu tien to khoa cau hinh`);
    assert.ok(e.params.length > 0, `${e.event} khong co tham so nao`);
    assert.ok(e.label.length > 0);
    // Moi tham so phai xuat hien trong vi du, de nguoi soan mau khong bo sot
    for (const p of e.params) {
      assert.ok(e.sample.includes(`<${p}>`), `Vi du cua ${e.event} thieu tham so <${p}>`);
    }
  }
});

test('khoa cau hinh cua tung su kien khong trung nhau', () => {
  const keys = ZNS_EVENT_LIST.map((e) => e.settingKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(Object.keys(ZNS_EVENTS).length, keys.length);
});
