/**
 * Tang goi P.A theo tai lieu API_PAVIETNAM.pdf: doc phan hoi, bang phan loai
 * ma, tham so dang ky / doi DNS, chon endpoint thu hay that, che bi mat trong
 * nhat ky. Goi vao may chu P.A gia cuc bo, khong bao gio goi P.A that.
 */
import './helpers/db.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { getSetting } from '../src/lib/settings.js';
import { ACTIONS, lenhNgoaiTaiLieu } from '../src/pavietnam/actions.js';
import {
  call, checkOwned, getAuthCode, getBalance, getDomainDates, laEndpointThu, registerDomain, renewDomain, setNameservers,
  phanGiaiIp,
} from '../src/pavietnam/client.js';
import { phanLoaiMa } from '../src/pavietnam/maLoi.js';
import { docKhoangNgay, docPhanHoiPA, docSoTien } from '../src/pavietnam/parse.js';
import {
  chuanHoaDienThoai, laTenMienVn, matKhauTenMienHopLe, sinhMatKhauTenMien, tachTenMien, thamSoDangKy, type ChuThePA,
} from '../src/pavietnam/thamSo.js';
import { RegistrarError } from '../src/pavietnam/types.js';
import { ma, moPaGia, type PaGia } from './helpers/pa-gia.js';

const CA_NHAN: ChuThePA = {
  kind: 'individual', fullName: 'Nguyễn Văn A', idNumber: '087123456789', email: 'a@vidu.vn', phone: '0987654321',
  address: '344 Huỳnh Tấn Phát', ward: 'Phường Tân Thuận', province: 'Thành phố Hồ Chí Minh',
  birthDate: '1987-10-20', gender: 'Nam',
};
const CONG_TY: ChuThePA = {
  kind: 'organization', orgName: 'Công ty TNHH ABC', taxCode: '0314785258', fullName: 'Trần Thị B',
  idNumber: '079222333444', email: 'b@abc.vn', phone: '+84 28 3811 1111', address: '12A5 Lê Thị Hồng Gấm',
  ward: 'Phường Bình Đức', province: 'Tỉnh An Giang', birthDate: '1985-11-27', gender: 'Nữ',
};

/* ------------------------------------------------------------ ham thuan */

test('doc phan hoi P.A: JSON co BOM, print_r mot dong va nhieu dong, dang tran', () => {
  assert.deepEqual(
    { ...docPhanHoiPA('﻿{"Command":"renew_domain","ReturnCode":"900","ReturnText":"Thực hiện thành công (Chế độ chạy test)"}'), json: null },
    { command: 'renew_domain', returnCode: 900, returnText: 'Thực hiện thành công (Chế độ chạy test)', json: null },
  );
  const motDong = docPhanHoiPA('<pre>Array ( [Command] => INVALID COMMAND! [ReturnCode] => 600 [ReturnText] => Lỗi: Lệnh thực thi không được hỗ trợ ) </pre>');
  assert.equal(motDong.returnCode, 600);
  assert.equal(motDong.returnText, 'Lỗi: Lệnh thực thi không được hỗ trợ');
  assert.equal(docPhanHoiPA('<pre>Array\n(\n    [ReturnCode] => 202\n    [ReturnText] => Lỗi: sai key\n)\n</pre>').returnCode, 202);
  assert.equal(docPhanHoiPA('501 => Lỗi: IP không được phép truy cập hệ thống API (<b>1.2.3.4</b>)').returnCode, 501);
  assert.equal(docPhanHoiPA('1').returnCode, null);
  assert.equal(docPhanHoiPA('{"Command":"check_account_still","Username":"x","Money":"3,896"}').returnCode, null);
});

test('so tien va khoang ngay theo dinh dang P.A', () => {
  assert.equal(docSoTien('3,896'), 3896);
  assert.equal(docSoTien('-830,000'), -830000);
  assert.equal(docSoTien('5,000,000'), 5_000_000);
  assert.equal(docSoTien(''), null);
  assert.equal(docSoTien(undefined), null);
  assert.deepEqual(docKhoangNgay('24/01/2014 - 24/01/2016'), { registeredAt: '2014-01-24T00:00:00Z', expiresAt: '2016-01-24T00:00:00Z' });
  assert.deepEqual(docKhoangNgay('khong co'), {});
});

test('bang phan loai ma: 200, 900 chi thanh cong o endpoint thu, 400, 606, 2xxx, 6023', () => {
  assert.equal(phanLoaiMa(200), 'thanh_cong');
  assert.equal(phanLoaiMa(900, true), 'thanh_cong');
  assert.equal(phanLoaiMa(900, false), 'nguoi_xu_ly');
  assert.equal(phanLoaiMa(400), 'thieu_quy');
  for (const m of [606, 302, 501, 202, 600, 301, 605]) assert.equal(phanLoaiMa(m), 'nguoi_xu_ly', String(m));
  for (const m of [2010, 2033, 6023, 6025, 309, 307, 3055, 203]) assert.equal(phanLoaiMa(m), 'du_lieu', String(m));
  for (const m of [101, 303, 209, 604]) assert.equal(phanLoaiMa(m), 'vinh_vien', String(m));
  for (const m of [300, 506, 9999]) assert.equal(phanLoaiMa(m), 'tam_thoi', String(m));
  assert.equal(phanLoaiMa(null), 'tam_thoi');
});

test('so dien thoai chuan +84-xxxxxxxxx', () => {
  assert.equal(chuanHoaDienThoai('0987654321'), '+84-987654321');
  assert.equal(chuanHoaDienThoai('+84 98 765 4321'), '+84-987654321');
  assert.equal(chuanHoaDienThoai('84987654321'), '+84-987654321');
  assert.equal(chuanHoaDienThoai('+84-987654321'), '+84-987654321');
  assert.equal(chuanHoaDienThoai('028 3811 1111'), '+84-2838111111');
  assert.equal(chuanHoaDienThoai('12345'), null);
  assert.equal(chuanHoaDienThoai('+1 202 555 0100'), null);
  assert.equal(chuanHoaDienThoai('09abc'), null);
});

test('mat khau ten mien sinh ngau nhien dung luat 8-15 ky tu, co chu va so', () => {
  const da = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const mk = sinhMatKhauTenMien();
    assert.ok(matKhauTenMienHopLe(mk), mk);
    da.add(mk);
  }
  assert.equal(da.size, 200);
  assert.equal(matKhauTenMienHopLe('abcdefgh'), false);
  assert.equal(matKhauTenMienHopLe('12345678'), false);
  assert.equal(matKhauTenMienHopLe('abc123'), false);
  assert.equal(matKhauTenMienHopLe('Abc12345'), false);
});

test('tach ten mien va nhan dien duoi Viet Nam', () => {
  assert.deepEqual(tachTenMien('abc.com.vn', 'com.vn'), { domainName: 'abc', domainExt: 'com.vn' });
  assert.throws(() => tachTenMien('abc.com', 'vn'));
  assert.equal(laTenMienVn('vn'), true);
  assert.equal(laTenMienVn('.com.vn'), true);
  assert.equal(laTenMienVn('com'), false);
});

test('tham so dang ky .vn ca nhan dung ten tai lieu, nguoi quan ly la chinh chu the', () => {
  const p = thamSoDangKy({ domain: 'vidu.vn', tld: 'vn', years: 2, password: 'a1b2c3d4e5', nameservers: ['ns1.pavietnam.vn', 'ns2.pavietnam.vn'], contact: CA_NHAN });
  assert.equal(p['domainName'], 'vidu');
  assert.equal(p['domainExt'], 'vn');
  assert.equal(p['domainYear'], '2');
  assert.equal(p['for'], 'canhan');
  assert.equal(p['ownerType'], '1');
  assert.equal(p['ownerID_Number'], '087123456789');
  assert.equal(p['ownerTaxCode'], '');
  assert.equal(p['ownerCountry'], 'Viet Nam');
  assert.equal(p['ownerWard'], 'Phường Tân Thuận');
  assert.equal(p['ownerPhone'], '+84-987654321');
  assert.equal(p['uiGender'], 'Nam');
  assert.equal(p['uiBirthdate'], '1987-10-20');
  assert.equal(p['adminName'], 'Nguyễn Văn A');
  assert.equal(p['adminID_Number'], '087123456789');
  assert.equal(p['adminPhone'], '+84-987654321');
  assert.equal(p['adminGender'], 'Nam');
  assert.equal(p['return_full'], '1');
  assert.equal(p['sendmail'], '0');
});

test('tham so .com.vn cong ty: chu the la cong ty, nguoi quan ly la nguoi dai dien', () => {
  const p = thamSoDangKy({ domain: 'abc.com.vn', tld: 'com.vn', years: 1, password: 'a1b2c3d4e5', nameservers: ['ns1.a.vn', 'ns2.a.vn'], contact: CONG_TY });
  assert.equal(p['domainExt'], 'com.vn');
  assert.equal(p['for'], 'congty');
  assert.equal(p['ownerType'], '2');
  assert.equal(p['ownerName'], 'Công ty TNHH ABC');
  assert.equal(p['ownerTaxCode'], '0314785258');
  assert.equal(p['ownerID_Number'], '');
  assert.equal(p['uiTaxCode'], '0314785258');
  assert.equal(p['uiGender'], undefined);
  assert.equal(p['adminName'], 'Trần Thị B');
  assert.equal(p['adminID_Number'], '079222333444');
  assert.equal(p['adminGender'], 'Nữ');
  assert.equal(p['adminBirthdate'], '1985-11-27');
  assert.equal(p['adminPhone'], '+84-2838111111');
});

test('tham so quoc te khong co nhom admin va uiGender', () => {
  const p = thamSoDangKy({ domain: 'vidu.com', tld: 'com', years: 1, password: 'a1b2c3d4e5', nameservers: ['ns1.a.vn', 'ns2.a.vn', 'ns3.a.vn'], contact: CA_NHAN });
  assert.equal(p['domainExt'], 'com');
  assert.equal(p['ownerID_Number'], '087123456789');
  assert.equal(p['uiGender'], undefined);
  assert.equal(p['adminName'], undefined);
  assert.equal(p['domainDNS3'], undefined); // quoc te chi co DNS1, DNS2 trong lenh dang ky
});

test('lenh ngoai tai lieu bi danh dau, lenh co trong tai lieu thi khong', () => {
  assert.equal(lenhNgoaiTaiLieu('authCode'), true);
  assert.equal(lenhNgoaiTaiLieu('renew'), false);
  assert.equal(ACTIONS.renew, 'renew_domain');
  assert.equal(ACTIONS.balance, 'check_account_still');
  assert.equal(laEndpointThu('https://daily.pavietnam.vn/interface_test.php'), true);
  assert.equal(laEndpointThu('https://daily.pavietnam.vn/interface.php'), false);
  assert.equal(laEndpointThu('https://x.vn/interface_test.php.evil/a'), false);
});

/* ------------------------------------------------- goi qua may chu gia */

let pa: PaGia;
const cu = { ...config.pa };

before(async () => {
  pa = await moPaGia();
  Object.assign(config.pa, {
    sandbox: false,
    endpoint: `${pa.goc}/interface.php`,
    endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false,
    username: 'daily-thu',
    apikey: 'KHOA-BI-MAT-1234567890',
    retries: 0,
    log: true,
  });
});
after(async () => {
  Object.assign(config.pa, cu);
  await pa.dong();
});
beforeEach(() => {
  pa.datLai();
  config.pa.useTestEndpoint = false;
});

test('csdl test khong co cau hinh P.A rieng (cac test duoi dua vao config)', () => {
  assert.equal(getSetting('pa.endpoint'), '');
  assert.equal(getSetting('pa.use_test_endpoint'), '');
});

test('moi lenh gui cmd, username, apikey; responsetype=json tru check_whois/get_whois', async () => {
  await getBalance();
  await call(ACTIONS.check, { domain: 'vidu.vn' });
  const [soDu, whois] = pa.yeuCau;
  assert.equal(soDu!.cmd, 'check_account_still');
  assert.equal(soDu!.thamSo['username'], 'daily-thu');
  assert.equal(soDu!.thamSo['apikey'], 'KHOA-BI-MAT-1234567890');
  assert.equal(soDu!.thamSo['responsetype'], 'json');
  assert.equal(whois!.cmd, 'check_whois');
  assert.equal(whois!.thamSo['responsetype'], undefined);
});

test('so du check_account_still "3,896" doc thanh 3896 dong', async () => {
  pa.dat('check_account_still', { body: '{"Command":"check_account_still","Username":"daily-thu","Money":"3,896"}' });
  const b = await getBalance();
  assert.equal(b.ok, true);
  assert.equal(b.balance, 3896);
  pa.dat('check_account_still', ma('check_account_still', 501, 'Lỗi: IP không được phép truy cập hệ thống API'));
  const loi = await getBalance();
  assert.equal(loi.ok, false);
  assert.match(loi.message, /IP không được phép/);
});

test('dang ky .vn ca nhan qua endpoint that: 200, doc trans_id, trans_money, so du con lai', async () => {
  const r = await registerDomain({ domain: 'vidu.vn', tld: 'vn', years: 1, contact: CA_NHAN, nameservers: ['ns1.pavietnam.vn', 'ns2.pavietnam.vn'], password: 'a1b2c3d4e5' });
  assert.equal(r.returnCode, 200);
  assert.ok(r.providerRef);
  assert.equal(r.transMoney, 830_000);
  assert.equal(r.accountStill, 5_000_000 - 830_000);
  const q = pa.yeuCau[0]!;
  assert.equal(q.duongDan, '/interface.php');
  assert.equal(q.cmd, 'register_domain_vietnam');
  assert.equal(q.thamSo['uiGender'], 'Nam');
});

test('900 tu endpoint that KHONG phai thanh cong (nhom nguoi_xu_ly)', async () => {
  pa.dat('register_domain_quocte', ma('register_domain_quocte', 900, 'Thực hiện thành công (Chế độ chạy test)'));
  await assert.rejects(
    () => registerDomain({ domain: 'vidu.com', tld: 'com', years: 1, contact: CA_NHAN, nameservers: ['ns1.a.vn', 'ns2.a.vn'], password: 'a1b2c3d4e5' }),
    (e: unknown) => e instanceof RegistrarError && e.code === '900' && e.nhom === 'nguoi_xu_ly',
  );
});

test('che do thu: lenh ghi di interface_test.php va 900 la thanh cong; lenh doc van di endpoint that', async () => {
  config.pa.useTestEndpoint = true;
  const r = await renewDomain('vidu.vn', 1);
  assert.equal(r.returnCode, 900);
  assert.equal(r.endpointThu, true);
  await getBalance();
  assert.equal(pa.yeuCau[0]!.duongDan, '/interface_test.php');
  assert.equal(pa.yeuCau[1]!.duongDan, '/interface.php');
});

test('che do thu nhung endpoint thu tro nham ve interface.php: 900 van khong duoc tinh', async () => {
  config.pa.useTestEndpoint = true;
  const cuThu = config.pa.endpointTest;
  config.pa.endpointTest = `${pa.goc}/interface.php`;
  pa.dat('renew_domain', ma('renew_domain', 900, 'test'));
  try {
    await assert.rejects(() => renewDomain('vidu.vn', 1), (e: unknown) => e instanceof RegistrarError && e.nhom === 'nguoi_xu_ly');
  } finally {
    config.pa.endpointTest = cuThu;
  }
});

test('ma loi tu P.A giu ReturnText va nhom: 400 thieu quy, 6023 ho so, 606 nguoi xu ly', async () => {
  const dk = () => registerDomain({ domain: 'vidu.vn', tld: 'vn', years: 1, contact: CA_NHAN, nameservers: ['ns1.a.vn', 'ns2.a.vn'], password: 'a1b2c3d4e5' });
  for (const [m, nhom] of [[400, 'thieu_quy'], [6023, 'du_lieu'], [2033, 'du_lieu'], [606, 'nguoi_xu_ly'], [303, 'vinh_vien']] as const) {
    pa.dat('register_domain_vietnam', ma('register_domain_vietnam', m, `Lỗi mã ${m}`));
    await assert.rejects(dk, (e: unknown) => e instanceof RegistrarError && e.code === String(m) && e.nhom === nhom && e.message === `Lỗi mã ${m}`);
  }
});

test('nhat ky API che apikey va passwordDomain', async () => {
  await registerDomain({ domain: 'chekhoa.vn', tld: 'vn', years: 1, contact: CA_NHAN, nameservers: ['ns1.a.vn', 'ns2.a.vn'], password: 'matkhau9bimat' });
  const row = db.prepare(`SELECT request FROM api_logs WHERE domain = 'chekhoa.vn' ORDER BY id DESC LIMIT 1`).get() as { request: string };
  assert.ok(!row.request.includes('KHOA-BI-MAT-1234567890'));
  assert.ok(!row.request.includes('matkhau9bimat'));
  assert.match(row.request, /cmd=register_domain_vietnam/);
});

test('get_date_domain va check_domain', async () => {
  const n = await getDomainDates('vidu.vn');
  assert.equal(n.expiresAt, '2027-10-19T00:00:00Z');
  assert.equal(n.registeredAt, '2026-10-19T00:00:00Z');
  pa.dat('check_domain', ma('check_domain', 1, 'Domain thuoc quyen quan ly cua ban'));
  assert.equal((await checkOwned('vidu.vn')).state, 1);
  pa.dat('get_date_domain', ma('get_date_domain', 500, 'Lỗi: Dịch vụ không thuộc quyền quản lý của đại lý'));
  await assert.rejects(() => getDomainDates('khac.vn'), /không thuộc quyền/);
});

test('doi DNS .vn: gui kem IP, tu phan giai khi khach khong nhap, bao loi khi khong phan giai duoc', async () => {
  const cuPg = phanGiaiIp.resolve4;
  phanGiaiIp.resolve4 = async (h: string) => (h === 'ns2.pavietnam.vn' ? ['222.255.89.247'] : []);
  try {
    await setNameservers('vidu.vn', ['ns1.pavietnam.vn 112.213.89.3', 'ns2.pavietnam.vn']);
    const q = pa.yeuCau[0]!;
    assert.equal(q.cmd, 'change_dns_domain_vietnam');
    assert.equal(q.thamSo['domainDNS1'], 'ns1.pavietnam.vn');
    assert.equal(q.thamSo['domainIP1'], '112.213.89.3');
    assert.equal(q.thamSo['domainIP2'], '222.255.89.247');
    await assert.rejects(() => setNameservers('vidu.vn', ['ns1.khongco.vn', 'ns2.pavietnam.vn']), /Không tìm được địa chỉ IP của ns1\.khongco\.vn/);
    assert.equal(pa.yeuCau.length, 1); // khong gui P.A khi thieu IP
    await assert.rejects(() => setNameservers('vidu.vn', ['a.vn 1.1.1.1', 'b.vn 1.1.1.2', 'c.vn 1.1.1.3', 'd.vn 1.1.1.4']), /Tối đa 3/);
  } finally {
    phanGiaiIp.resolve4 = cuPg;
  }
});

test('doi DNS quoc te: change_dns_domain_quocte toi da 4, khong can IP', async () => {
  await setNameservers('vidu.com', ['ns1.a.vn', 'ns2.a.vn', 'ns3.a.vn', 'ns4.a.vn']);
  const q = pa.yeuCau[0]!;
  assert.equal(q.cmd, 'change_dns_domain_quocte');
  assert.equal(q.thamSo['domainDNS4'], 'ns4.a.vn');
  assert.equal(q.thamSo['domainIP1'], undefined);
});

test('lenh ngoai tai lieu o che do that bi chan, khong goi P.A', async () => {
  await assert.rejects(() => getAuthCode('vidu.com'), (e: unknown) => e instanceof RegistrarError && e.code === 'UNSUPPORTED');
  assert.equal(pa.yeuCau.length, 0);
});
