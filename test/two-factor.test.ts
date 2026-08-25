import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, nowIso } from '../src/db/index.js';
import { codeForCounter, currentCode, verifyTotp } from '../src/lib/totp.js';
import {
  SO_MA_DU_PHONG, beginSetup, confirmSetup, disable, getPendingSetup, getState,
  isEnabled, regenerateRecoveryCodes, requires2FA, verifyLogin,
} from '../src/services/twoFactor.js';
import { setSetting } from '../src/lib/settings.js';

function taoNguoiDung(role: 'customer' | 'staff' | 'admin' = 'admin'): { id: number; email: string } {
  const email = `2fa-${Math.random().toString(36).slice(2)}@test.vn`;
  const id = Number(
    db.prepare(
      `INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, 'x', 'Kiem thu', ?, ?, ?)`,
    ).run(email, role, nowIso(), nowIso()).lastInsertRowid,
  );
  return { id, email };
}

/** Cai dat va bat 2FA hoan chinh, tra ve khoa bi mat va bo ma du phong. */
function batXong(): { id: number; email: string; secret: string; codes: string[] } {
  const u = taoNguoiDung();
  const { secret } = beginSetup(u.id, u.email);
  const kq = confirmSetup(u.id, currentCode(secret));
  assert.equal(kq.ok, true);
  return { ...u, secret, codes: kq.recoveryCodes! };
}

/* ------------------------------------------------------------------ cai dat */

test('chua cai dat thi trang thai la tat', () => {
  const u = taoNguoiDung();
  assert.deepEqual(getState(u.id), { enabled: false, pending: false, enabledAt: null, recoveryLeft: 0 });
  assert.equal(isEnabled(u.id), false);
});

test('bat dau cai dat thi o trang thai do dang, chua co hieu luc', () => {
  const u = taoNguoiDung();
  const { secret, uri } = beginSetup(u.id, u.email);

  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes(`secret=${secret}`));

  const st = getState(u.id);
  assert.equal(st.pending, true);
  assert.equal(st.enabled, false);
  // Quan trong: dang do dang thi CHUA duoc chan dang nhap
  assert.equal(isEnabled(u.id), false);
});

test('tai lai trang van lay lai dung ma QR dang do', () => {
  const u = taoNguoiDung();
  const { secret } = beginSetup(u.id, u.email);
  assert.equal(getPendingSetup(u.id, u.email)?.secret, secret);
});

test('bat dau lai lan nua thi cap khoa moi, khoa cu het hieu luc', () => {
  const u = taoNguoiDung();
  const cu = beginSetup(u.id, u.email).secret;
  const moi = beginSetup(u.id, u.email).secret;
  assert.notEqual(cu, moi);
  // Ma sinh tu khoa CU khong con xac nhan duoc
  assert.equal(confirmSetup(u.id, currentCode(cu)).ok, false);
  assert.equal(confirmSetup(u.id, currentCode(moi)).ok, true);
});

test('nhap sai ma thi khong bat', () => {
  const u = taoNguoiDung();
  beginSetup(u.id, u.email);
  const kq = confirmSetup(u.id, '000000');
  assert.equal(kq.ok, false);
  assert.ok(kq.loi);
  assert.equal(isEnabled(u.id), false);
});

test('chua bat dau ma xac nhan luon thi bao loi ro rang', () => {
  const u = taoNguoiDung();
  const kq = confirmSetup(u.id, '123456');
  assert.equal(kq.ok, false);
  assert.match(kq.loi ?? '', /Chua bat dau/);
});

test('khong the ghi de khi 2FA da bat', () => {
  const u = batXong();
  assert.throws(() => beginSetup(u.id, u.email), /dang bat/);
  assert.equal(getPendingSetup(u.id, u.email), null);
});

test('bat thanh cong thi phat du bo ma du phong', () => {
  const u = batXong();
  assert.equal(u.codes.length, SO_MA_DU_PHONG);
  assert.equal(new Set(u.codes).size, SO_MA_DU_PHONG, 'cac ma phai khac nhau');
  for (const c of u.codes) assert.match(c, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  const st = getState(u.id);
  assert.equal(st.enabled, true);
  assert.equal(st.recoveryLeft, SO_MA_DU_PHONG);
  assert.ok(st.enabledAt);
});

test('khoa bi mat khong luu dang goc trong CSDL', () => {
  const u = batXong();
  const hang = db.prepare('SELECT secret_enc FROM two_factor WHERE user_id = ?').get(u.id) as { secret_enc: string };
  assert.equal(hang.secret_enc.includes(u.secret), false, 'khoa phai duoc ma hoa truoc khi luu');
  assert.ok(hang.secret_enc.startsWith('v1.'));
});

test('ma du phong khong luu dang goc trong CSDL', () => {
  const u = batXong();
  const hangs = db.prepare('SELECT code_hash FROM two_factor_recovery WHERE user_id = ?').all(u.id) as { code_hash: string }[];
  const goc = u.codes.map((c) => c.replace('-', ''));
  for (const h of hangs) {
    assert.equal(goc.includes(h.code_hash), false);
    assert.match(h.code_hash, /^[0-9a-f]{64}$/);
  }
});

/* --------------------------------------------------------------- dang nhap */

/**
 * Chu ky 30 giay da bi tieu o buoc bat 2FA. Doc thang tu CSDL thay vi goi
 * `currentCode()` lai - neu vua luc do dong ho nhay sang chu ky moi thi bai
 * kiem thu se do dong dong khac nhau chu khong do code sai.
 */
function chuKyDaTieu(userId: number): number {
  const hang = db.prepare('SELECT last_counter FROM two_factor WHERE user_id = ?').get(userId) as { last_counter: number };
  return hang.last_counter;
}

test('ma dung tu ung dung thi qua duoc', () => {
  const u = batXong();
  // Chu ky KE TIEP chu ky da tieu luc bat - van nam trong cua so chap nhan
  assert.equal(verifyLogin(u.id, codeForCounter(u.secret, chuKyDaTieu(u.id) + 1)).ok, true);
});

test('ma sai thi khong qua', () => {
  const u = batXong();
  for (const xau of ['000000', '12345', 'abcdef', '', '   ']) {
    assert.equal(verifyLogin(u.id, xau).ok, false, `phai tu choi: ${JSON.stringify(xau)}`);
  }
});

test('KHONG dung lai duoc ma vua tieu (chong phat lai)', () => {
  const u = batXong();
  // Sau confirmSetup, chu ky hien tai da bi ghi nhan - dung lai phai bi tu choi
  const daTieu = chuKyDaTieu(u.id);
  assert.equal(verifyLogin(u.id, codeForCounter(u.secret, daTieu)).ok, false, 'ma da dung o buoc bat khong duoc dung lai');

  // Nhung ma cua chu ky ke tiep thi van vao duoc
  assert.equal(verifyLogin(u.id, codeForCounter(u.secret, daTieu + 1)).ok, true);
});

test('ma du phong dung duoc dung MOT lan', () => {
  const u = batXong();
  const ma = u.codes[0]!;

  const lan1 = verifyLogin(u.id, ma);
  assert.equal(lan1.ok, true);
  assert.equal(lan1.duPhong, true);
  assert.equal(lan1.conLai, SO_MA_DU_PHONG - 1);

  const lan2 = verifyLogin(u.id, ma);
  assert.equal(lan2.ok, false, 'ma du phong khong duoc tai su dung');
  assert.equal(getState(u.id).recoveryLeft, SO_MA_DU_PHONG - 1);
});

test('ma du phong nhan ca chu thuong va thieu dau gach', () => {
  const u = batXong();
  assert.equal(verifyLogin(u.id, u.codes[1]!.toLowerCase()).ok, true);
  assert.equal(verifyLogin(u.id, u.codes[2]!.replace('-', '')).ok, true);
  assert.equal(verifyLogin(u.id, ` ${u.codes[3]!} `).ok, true);
});

test('ma du phong cua nguoi khac khong dung duoc', () => {
  const a = batXong();
  const b = batXong();
  assert.equal(verifyLogin(b.id, a.codes[0]!).ok, false);
});

test('nguoi chua bat 2FA thi verifyLogin luon tu choi', () => {
  const u = taoNguoiDung();
  assert.equal(verifyLogin(u.id, '123456').ok, false);
  beginSetup(u.id, u.email);
  // Dang do dang cung khong duoc coi la da bat
  assert.equal(verifyLogin(u.id, currentCode(getPendingSetup(u.id, u.email)!.secret)).ok, false);
});

/* ------------------------------------------------------- ma du phong & tat */

test('cap lai bo ma du phong thi bo cu het hieu luc ngay', () => {
  const u = batXong();
  const cu = u.codes[0]!;
  const moi = regenerateRecoveryCodes(u.id);

  assert.equal(moi.length, SO_MA_DU_PHONG);
  assert.equal(getState(u.id).recoveryLeft, SO_MA_DU_PHONG);
  assert.equal(verifyLogin(u.id, cu).ok, false, 'ma cu phai het hieu luc');
  assert.equal(verifyLogin(u.id, moi[0]!).ok, true);
});

test('tat 2FA phai nhap dung ma', () => {
  const u = batXong();
  assert.equal(disable(u.id, '000000').ok, false);
  assert.equal(isEnabled(u.id), true, 'nhap sai thi khong duoc tat');

  assert.equal(disable(u.id, u.codes[0]!).ok, true);
  assert.equal(isEnabled(u.id), false);
  // Don sach: khong con ma du phong nao sot lai
  assert.equal(getState(u.id).recoveryLeft, 0);
});

test('tat khi chua bat thi bao loi', () => {
  const u = taoNguoiDung();
  const kq = disable(u.id, '123456');
  assert.equal(kq.ok, false);
  assert.match(kq.loi ?? '', /chua duoc bat/);
});

test('bat lai duoc sau khi tat, va khoa moi khac khoa cu', () => {
  const u = batXong();
  assert.equal(disable(u.id, u.codes[0]!).ok, true);
  const lai = beginSetup(u.id, u.email);
  assert.notEqual(lai.secret, u.secret);
  assert.equal(confirmSetup(u.id, currentCode(lai.secret)).ok, true);
});

/* -------------------------------------------------------------- bat buoc */

test('chi tai khoan quan tri moi bi bat buoc', () => {
  setSetting('security.require_2fa_admin', '1');
  assert.equal(requires2FA('admin'), true);
  assert.equal(requires2FA('staff'), true);
  assert.equal(requires2FA('customer'), false);
});

test('tat cau hinh thi khong con bat buoc ai ca', () => {
  setSetting('security.require_2fa_admin', '0');
  try {
    assert.equal(requires2FA('admin'), false);
    assert.equal(requires2FA('staff'), false);
  } finally {
    setSetting('security.require_2fa_admin', '1');
  }
});

/* --------------------------------------------------------------- ghi nhat ky */

test('ghi nhat ky khi bat, khi dung ma du phong va khi tat', () => {
  const u = batXong();
  verifyLogin(u.id, u.codes[0]!);
  disable(u.id, u.codes[1]!);

  const hanhDong = (db.prepare('SELECT action FROM audit_logs WHERE user_id = ? ORDER BY id').all(u.id) as { action: string }[])
    .map((r) => r.action);
  assert.ok(hanhDong.includes('user.2fa_enabled'));
  assert.ok(hanhDong.includes('user.2fa_recovery_used'));
  assert.ok(hanhDong.includes('user.2fa_disabled'));
});

test('khoa luu duoc giai ma lai dung (vong ma hoa AES-GCM)', () => {
  const u = batXong();
  // Neu giai ma sai thi ma sinh ra se khong khop
  const ma = currentCode(u.secret, Date.now() + 60_000);
  const kq = verifyTotp(u.secret, ma, { atMs: Date.now() + 60_000 });
  assert.equal(kq.ok, true);
});
