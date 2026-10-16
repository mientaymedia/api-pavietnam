import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { boDau } from '../src/lib/text.js';
import { isPermanent } from '../src/services/provisioning.js';
import { availableFromText, interpret, registeredFromWhoisText } from '../src/pavietnam/client.js';
import { parseResponse } from '../src/pavietnam/parse.js';

test('boDau bo dau, doi đ thanh d, ve chu thuong', () => {
  assert.equal(boDau('Lỗi: Lệnh thực thi không được hỗ trợ'), 'loi: lenh thuc thi khong duoc ho tro');
  assert.equal(boDau('ĐÃ ĐĂNG KÝ'), 'da dang ky');
  // Dang to hop (NFD) cung ra cung ket qua
  assert.equal(boDau('Tên miền'.normalize('NFD')), 'ten mien');
});

test('loi vinh vien khop ca chu co dau lan khong dau', () => {
  for (const m of [
    'Tên miền đã được đăng ký',
    'Ten mien da duoc dang ky',
    'Tài khoản không đủ số dư',
    'Tai khoan khong du so du',
    'Domain already registered',
  ]) {
    assert.equal(isPermanent(m), true, m);
  }
});

/**
 * Lay moi thong diep `new RegistrarError(...)` trong client.ts ngay tu ma nguon,
 * de khi chu duoc them dau ve sau thi test van kiem dung chu that.
 */
function thongDiepLoiCuaHeThong(): string[] {
  const file = 'src/pavietnam/client.ts';
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const ra: string[] = [];
  const chuoi = (n: ts.Node): string | null => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => `vidu.vn${s.literal.text}`).join('');
    if (ts.isBinaryExpression(n)) return chuoi(n.right); // res.message || `...`
    return null;
  };
  const duyet = (n: ts.Node) => {
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'RegistrarError') {
      const s = n.arguments?.[0] && chuoi(n.arguments[0]);
      if (s) ra.push(s);
    }
    ts.forEachChild(n, duyet);
  };
  duyet(sf);
  return ra;
}

test('thong diep loi do chinh he thong sinh ra khong bi coi la loi vinh vien', () => {
  const msgs = thongDiepLoiCuaHeThong();
  assert.ok(msgs.length >= 5, `chi tim thay ${msgs.length} thong diep`);
  for (const m of msgs) assert.equal(isPermanent(m), false, m);
});

test('phan hoi dang chu bao loi bang tieng Viet co dau khong bi coi la thanh cong', () => {
  for (const raw of ['Lỗi: Lệnh thực thi không được hỗ trợ', 'IP không được phép truy cập', 'Loi: sai tham so']) {
    assert.equal(interpret(parseResponse(raw), raw).ok, false, raw);
  }
  assert.equal(interpret(parseResponse('Thành công'), 'Thành công').ok, true);
});

/** Phan hoi JSON co truong status, di qua parse that nhu khi P.A tra ve. */
function trangThai(status: string, message = ''): boolean {
  const raw = JSON.stringify({ status, message });
  return interpret(parseResponse(raw), raw).ok;
}

test('status thanh cong co dau, khong dau, hoa thuong, NFD deu la thanh cong (loi evals 5)', () => {
  for (const s of [
    'Thành công',
    'thành công',
    'THÀNH CÔNG',
    'Thành Công',
    'Thành công'.normalize('NFD'),
    'thanh cong',
    'Thanh Cong',
    'thanhcong',
    '  thanh  cong  ',
    'success',
    'SUCCESS',
    'Success',
    'ok',
    'OK',
  ]) {
    assert.equal(trangThai(s), true, JSON.stringify(s));
  }
});

test('status bao loi van la loi sau khi bo dau (loi evals 5)', () => {
  for (const s of [
    'Không thành công',
    'khong thanh cong',
    'Thất bại',
    'Lỗi',
    'LỖI: LỆNH THỰC THI KHÔNG ĐƯỢC HỖ TRỢ',
    'IP không được phép truy cập',
    'error',
    'failed',
    'not ok',
    'Thành công một phần',
  ]) {
    assert.equal(trangThai(s), false, JSON.stringify(s));
  }
  // status loi nhung message lai co chu "Thành công": van la loi
  assert.equal(trangThai('error', 'Thành công'), false);
});

test('kiem tra ten mien hieu chu co dau', () => {
  assert.equal(availableFromText('Tên miền đã được đăng ký'), false);
  assert.equal(availableFromText('Không khả dụng'), false);
  assert.equal(availableFromText('Tên miền chưa được đăng ký'), true);
  assert.equal(availableFromText('Còn trống'), true);
  assert.equal(availableFromText('chua dang ky'), true);
  assert.equal(availableFromText('???'), false);
});

test('whois hieu chu co dau', () => {
  assert.equal(registeredFromWhoisText('Không tìm thấy thông tin tên miền'), false);
  assert.equal(registeredFromWhoisText('Tên miền chưa được đăng ký'), false);
  assert.equal(registeredFromWhoisText('Registrar: P.A Việt Nam\nExpiry Date: 2030-01-01'), true);
});
