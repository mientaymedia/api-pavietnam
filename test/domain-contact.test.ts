import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, nowIso } from '../src/db/index.js';
import {
  listOwnershipRequests, ownershipRequestFor, pendingOwnershipCount,
  setOwnershipStatus, submitOwnershipRequest, validateForTld, type ContactRow,
} from '../src/services/domainContact.js';
import { upsertTld } from '../src/services/pricing.js';
import type { DomainRow } from '../src/services/domainRepo.js';

function hoSo(over: Partial<ContactRow> = {}): ContactRow {
  const userId = over.user_id ?? Number(
    db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'T', ?, ?)`)
      .run(`ct-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid,
  );
  const id = Number(
    db.prepare(
      `INSERT INTO contacts (user_id, kind, full_name, org_name, id_number, tax_code, email, phone, address, country, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VN', ?, ?)`,
    ).run(
      userId, over.kind ?? 'individual', over.full_name ?? 'Nguyen Van A', over.org_name ?? '',
      over.id_number ?? '079201001234', over.tax_code ?? '', over.email ?? 'a@test.vn',
      over.phone ?? '0901234567', over.address ?? '123 Le Loi', nowIso(), nowIso(),
    ).lastInsertRowid,
  );
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow;
}

/** Bang gia phai co truoc: validateForTld doc co `requires_vn_contact` tu day. */
function khaiDuoi(tld: string) {
  upsertTld({
    tld, kind: tld === 'vn' ? 'vn' : 'intl', price_register: 100, price_renew: 100,
    requires_vn_contact: tld === 'vn' ? 1 : 0, is_active: 1,
  });
}
khaiDuoi('vn');
khaiDuoi('com');

function tenMien(userId: number, tld = 'vn'): DomainRow {
  khaiDuoi(tld);
  const domain = `ct-${Math.random().toString(36).slice(2)}.${tld}`;
  const id = Number(
    db.prepare(
      `INSERT INTO domains (user_id, domain, tld, status, provider, nameservers, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'pavietnam', '[]', ?, ?)`,
    ).run(userId, domain, tld, nowIso(), nowIso()).lastInsertRowid,
  );
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id) as DomainRow;
}

test('.vn: ca nhan thieu CMND/CCCD bi tu choi', () => {
  const c = hoSo({ kind: 'individual', id_number: '' });
  assert.match(validateForTld(c, 'vn') ?? '', /CMND|CCCD/i);
});

test('.vn: to chuc thieu ma so thue bi tu choi', () => {
  const c = hoSo({ kind: 'organization', org_name: 'CTY ABC', tax_code: '' });
  assert.match(validateForTld(c, 'vn') ?? '', /ma so thue/i);
});

test('.vn: ho so day du thi hop le', () => {
  assert.equal(validateForTld(hoSo(), 'vn'), null);
});

test('ten mien quoc te khong doi hoi giay to Viet Nam', () => {
  const c = hoSo({ kind: 'individual', id_number: '' });
  assert.equal(validateForTld(c, 'com'), null);
});

test('nop ho so doi chu the thanh cong', () => {
  const c = hoSo();
  const d = tenMien(c.user_id);
  const r = submitOwnershipRequest({ domain: d, newContactId: c.id, reason: 'Sap nhap', userId: c.user_id });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(ownershipRequestFor(d.id)?.status, 'pending');
});

test('khong nop duoc ho so thu hai khi ho so cu chua xong', () => {
  const c = hoSo();
  const d = tenMien(c.user_id);
  submitOwnershipRequest({ domain: d, newContactId: c.id, reason: 'Lan 1', userId: c.user_id });

  const lan2 = submitOwnershipRequest({ domain: d, newContactId: c.id, reason: 'Lan 2', userId: c.user_id });
  assert.equal(lan2.ok, false);
  if (!lan2.ok) assert.match(lan2.error, /chua xu ly xong/i);
});

test('khong dung duoc ho so chu the cua nguoi khac', () => {
  const a = hoSo();
  const b = hoSo();
  const d = tenMien(a.user_id);

  const r = submitOwnershipRequest({ domain: d, newContactId: b.id, reason: 'x', userId: a.user_id });
  assert.equal(r.ok, false);
});

test('.vn: ho so chu the moi thieu giay to thi khong nop duoc', () => {
  const chuCu = hoSo();
  const chuMoi = hoSo({ user_id: chuCu.user_id, kind: 'organization', org_name: 'CTY X', tax_code: '' });
  const d = tenMien(chuCu.user_id);

  const r = submitOwnershipRequest({ domain: d, newContactId: chuMoi.id, reason: 'x', userId: chuCu.user_id });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /ma so thue/i);
});

test('hoan tat ho so thi ten mien doi sang chu the moi', async () => {
  const chuCu = hoSo();
  const chuMoi = hoSo({ user_id: chuCu.user_id, kind: 'organization', org_name: 'CTY MOI', tax_code: '0312345678' });
  const d = tenMien(chuCu.user_id);
  db.prepare('UPDATE domains SET contact_id = ? WHERE id = ?').run(chuCu.id, d.id);

  const r = submitOwnershipRequest({ domain: d, newContactId: chuMoi.id, reason: 'Sap nhap', userId: chuCu.user_id });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  await setOwnershipStatus(r.id, 'completed', { adminUserId: chuCu.user_id, note: 'Xong' });

  const sau = db.prepare('SELECT contact_id FROM domains WHERE id = ?').get(d.id) as { contact_id: number };
  assert.equal(sau.contact_id, chuMoi.id);
});

test('ho so bi tu choi thi chu the KHONG doi', async () => {
  const chuCu = hoSo();
  const chuMoi = hoSo({ user_id: chuCu.user_id });
  const d = tenMien(chuCu.user_id);
  db.prepare('UPDATE domains SET contact_id = ? WHERE id = ?').run(chuCu.id, d.id);

  const r = submitOwnershipRequest({ domain: d, newContactId: chuMoi.id, reason: 'x', userId: chuCu.user_id });
  if (!r.ok) return;
  await setOwnershipStatus(r.id, 'rejected', { adminUserId: chuCu.user_id, note: 'Thieu giay to' });

  const sau = db.prepare('SELECT contact_id FROM domains WHERE id = ?').get(d.id) as { contact_id: number };
  assert.equal(sau.contact_id, chuCu.id, 'chu the phai giu nguyen khi ho so bi tu choi');
});

test('danh sach ho so kem thong tin chu the moi de doi chieu', () => {
  const chuCu = hoSo();
  const chuMoi = hoSo({ user_id: chuCu.user_id, kind: 'organization', org_name: 'CTY DOI CHIEU', tax_code: '0399999999' });
  const d = tenMien(chuCu.user_id);
  const r = submitOwnershipRequest({ domain: d, newContactId: chuMoi.id, reason: 'x', userId: chuCu.user_id });
  if (!r.ok) return;

  const row = listOwnershipRequests({ userId: chuCu.user_id }).find((x) => x.id === r.id);
  assert.equal(row?.new_owner_name, 'CTY DOI CHIEU');
  assert.equal(row?.new_owner_tax, '0399999999');
  assert.equal(row?.domain, d.domain);
});

test('dem ho so dang cho xu ly', () => {
  const truoc = pendingOwnershipCount();
  const c = hoSo();
  const d = tenMien(c.user_id);
  submitOwnershipRequest({ domain: d, newContactId: c.id, reason: 'x', userId: c.user_id });

  assert.equal(pendingOwnershipCount(), truoc + 1);
});
