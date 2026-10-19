/**
 * Danh sach tinh, phuong xa theo ten P.A: script chuyen xlsx va tra cuu.
 * Tep xlsx trong test duoc dung ngay tai cho (zip toi gian), khong doc tep ngoai repo.
 */
import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { danhSachTinh, phuongCuaTinh, thongTinDiaGioi, timPhuong, timTinh } from '../src/lib/diaGioi.js';

/** Zip toi gian (chi ban ghi cuc bo + thu muc trung tam), du cho bo doc cua script. */
function taoZip(tep: Record<string, string>): Buffer {
  const cucBo: Buffer[] = [];
  const trungTam: Buffer[] = [];
  let viTri = 0;
  for (const [ten, noiDung] of Object.entries(tep)) {
    const tenBuf = Buffer.from(ten, 'utf8');
    const nen = deflateRawSync(Buffer.from(noiDung, 'utf8'));
    const dau = Buffer.alloc(30);
    dau.writeUInt32LE(0x04034b50, 0);
    dau.writeUInt16LE(8, 8);
    dau.writeUInt32LE(nen.length, 18);
    dau.writeUInt16LE(tenBuf.length, 26);
    cucBo.push(dau, tenBuf, nen);
    const tt = Buffer.alloc(46);
    tt.writeUInt32LE(0x02014b50, 0);
    tt.writeUInt16LE(8, 10);
    tt.writeUInt32LE(nen.length, 20);
    tt.writeUInt16LE(tenBuf.length, 28);
    tt.writeUInt32LE(viTri, 42);
    trungTam.push(tt, tenBuf);
    viTri += 30 + tenBuf.length + nen.length;
  }
  const tt = Buffer.concat(trungTam);
  const cuoi = Buffer.alloc(22);
  cuoi.writeUInt32LE(0x06054b50, 0);
  cuoi.writeUInt16LE(Object.keys(tep).length, 8);
  cuoi.writeUInt16LE(Object.keys(tep).length, 10);
  cuoi.writeUInt32LE(tt.length, 12);
  cuoi.writeUInt32LE(viTri, 16);
  return Buffer.concat([...cucBo, tt, cuoi]);
}

function xlsx(chuoi: string[], dong: (string | number)[][]): Buffer {
  const sst = `<sst>${chuoi.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`;
  const cot = 'ABCD';
  const rows = dong.map((d, i) => `<row r="${i + 1}">${d.map((v, j) =>
    typeof v === 'number'
      ? `<c r="${cot[j]}${i + 1}"><v>${v}</v></c>`
      : `<c r="${cot[j]}${i + 1}" t="s"><v>${chuoi.indexOf(v)}</v></c>`).join('')}</row>`).join('');
  return taoZip({ 'xl/sharedStrings.xml': sst, 'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>` });
}

test('script chuyen xlsx doc dung tinh va phuong xa, bo dong tieu de', async () => {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'dia-gioi-'));
  const chuoiTinh = ['MÃ TỈNH THÀNH', 'TÊN TỈNH THÀNH', 'Thành phố Hồ Chí Minh', 'Tỉnh An Giang'];
  const chuoiPhuong = ['MÃ PHƯỜNG XÃ', 'TÊN PHƯỜNG XÃ', 'MÃ TỈNH THÀNH', 'TÊN TỈNH THÀNH',
    'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'Phường Bình Đức', 'Tỉnh An Giang', 'Xã Lạc'];
  fs.writeFileSync(path.join(thuMuc, 't.xlsx'), xlsx(chuoiTinh, [['MÃ TỈNH THÀNH', 'TÊN TỈNH THÀNH'], [79, 'Thành phố Hồ Chí Minh'], [91, 'Tỉnh An Giang']]));
  fs.writeFileSync(path.join(thuMuc, 'p.xlsx'), xlsx(chuoiPhuong, [
    ['MÃ PHƯỜNG XÃ', 'TÊN PHƯỜNG XÃ', 'MÃ TỈNH THÀNH', 'TÊN TỈNH THÀNH'],
    [26734, 'Phường Tân Thuận', 79, 'Thành phố Hồ Chí Minh'],
    [30292, 'Phường Bình Đức', 91, 'Tỉnh An Giang'],
    [1, 'Xã Lạc', 999, 'Tỉnh An Giang'],
  ]));
  // @ts-expect-error script .mjs khong co khai bao kieu
  const { chuyen } = await import('../scripts/chuyen-dia-gioi-xlsx.mjs');
  const kq = chuyen(path.join(thuMuc, 't.xlsx'), path.join(thuMuc, 'p.xlsx'));
  assert.deepEqual(kq.tinh.map((t: { id: number }) => t.id), [79, 91]);
  assert.equal(kq.tinh[0].phuong[0].ten, 'Phường Tân Thuận');
  assert.equal(kq.tinh[1].phuong[0].ten, 'Phường Bình Đức');
  assert.equal(kq.boQua, 1);
  fs.rmSync(thuMuc, { recursive: true, force: true });
});

test('du lieu dong goi co du 34 tinh thanh va hon 3.000 phuong xa', () => {
  const tt = thongTinDiaGioi();
  assert.equal(tt.soTinh, 34);
  assert.ok(tt.soPhuong > 3000, String(tt.soPhuong));
  assert.ok(danhSachTinh().some((t) => t.ten === 'Thành phố Hồ Chí Minh'));
});

test('tra cuu tinh theo ma hoac ten, phuong phai thuoc dung tinh', () => {
  assert.equal(timTinh(79)?.ten, 'Thành phố Hồ Chí Minh');
  assert.equal(timTinh('  thành phố hồ chí minh ')?.id, 79);
  assert.equal(timTinh('Ho Chi Minh'), undefined);
  assert.equal(timPhuong(79, 'phường tân thuận')?.ten, 'Phường Tân Thuận');
  // Phuong Binh Duc thuoc An Giang, khong thuoc Thanh pho Ho Chi Minh
  assert.equal(timPhuong(79, 'Phường Bình Đức'), undefined);
  assert.equal(timPhuong('Tỉnh An Giang', 'Phường Bình Đức')?.id, 30292);
  assert.ok(phuongCuaTinh(91).length > 50);
  assert.deepEqual(phuongCuaTinh('khong-co'), []);
});
