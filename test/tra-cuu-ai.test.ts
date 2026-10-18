/**
 * Tim cung AI (intent tra-cuu-ai, spec muc 10). Khong goi OpenAI hay P.A that:
 * OpenAI la may chu gia lap cuc bo (OPENAI_BASE_URL), P.A o che do sandbox
 * hoac bo kiem gia truyen vao dich vu.
 *
 * Moi test HTTP dung mot IP rieng (CF-Connecting-IP) de bo dem gioi han tan
 * suat cua test nay khong lan sang test khac. Bang chi phi theo ngay dung
 * chung trong file nen moi test tu dat lai dong cua hom nay.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CheckResult } from '../src/pavietnam/types.js';

/* --------------------------------------------------- OpenAI gia lap */

type CheDo = 'ok' | '500' | 'hong' | 'cham' | 'quota' | 'cat';
let cheDo: CheDo = 'ok';
let soLanGoiAi = 0;
let tenGia: { ten: string; ly_do: string }[] = [];
let authNhanDuoc = '';

const aiGia = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    soLanGoiAi++;
    authNhanDuoc = String(req.headers['authorization'] ?? '');
    const gui = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (cheDo === '500') return gui(500, { error: { message: 'loi', code: null } });
    if (cheDo === 'quota') return gui(429, { error: { message: 'Bạn đã hết hạn mức, key sk-...abcd', code: 'insufficient_quota' } });
    if (cheDo === 'cham') return void setTimeout(() => gui(200, {}), 1500);
    const content = cheDo === 'hong' ? 'khong phai json' : JSON.stringify({ goi_y: tenGia });
    gui(200, {
      choices: [{ finish_reason: cheDo === 'cat' ? 'length' : 'stop', message: { content, refusal: null } }],
      usage: { prompt_tokens: 300, completion_tokens: 200 },
    });
  });
});

let server: Server;
let goc = '';
let ipSo = 0;
/** IP tai lieu (RFC 5737) khac nhau cho moi lan goi: bo dem gioi han khong dung chung. */
const ipMoi = () => `198.51.100.${++ipSo}`;

// Nap dong cac module sau khi dat bien moi truong (config doc luc nap)
let M: {
  db: typeof import('../src/db/index.js')['db'];
  setSetting: typeof import('../src/lib/settings.js')['setSetting'];
  setSettings: typeof import('../src/lib/settings.js')['setSettings'];
  SECRET_KEYS: string[];
  upsertTld: typeof import('../src/services/pricing.js')['upsertTld'];
  svc: typeof import('../src/services/goiYTenMien.js');
  ai: typeof import('../src/lib/ai/index.js');
  openai: typeof import('../src/lib/ai/openai.js');
  domainSchema: typeof import('../src/lib/validate.js')['domainSchema'];
};

const KHOA_THU = 'sk-thu-nghiem-KHOA-BI-MAT-1234567890';

before(async () => {
  aiGia.listen(0);
  await new Promise<void>((r) => aiGia.once('listening', () => r()));
  delete process.env['BASE_PATH'];
  process.env['CLIENT_IP_HEADER'] = 'cf-connecting-ip';
  process.env['OPENAI_BASE_URL'] = `http://127.0.0.1:${(aiGia.address() as AddressInfo).port}/v1`;

  await import('./helpers/db.js');
  const { db } = await import('../src/db/index.js');
  const st = await import('../src/lib/settings.js');
  const { upsertTld } = await import('../src/services/pricing.js');
  const svc = await import('../src/services/goiYTenMien.js');
  const ai = await import('../src/lib/ai/index.js');
  const openai = await import('../src/lib/ai/openai.js');
  const { domainSchema } = await import('../src/lib/validate.js');
  M = { db, setSetting: st.setSetting, setSettings: st.setSettings, SECRET_KEYS: st.SECRET_KEYS, upsertTld, svc, ai, openai, domainSchema };

  upsertTld({ tld: 'aimot', kind: 'intl', label: 'Thử AI 1', price_register: 111_000, price_renew: 111_000, is_active: 1, is_featured: 0, sort_order: 3 });
  upsertTld({ tld: 'aihai', kind: 'intl', label: 'Thử AI 2', price_register: 222_000, price_renew: 222_000, is_active: 1, is_featured: 0, sort_order: 4 });
  upsertTld({ tld: 'aiba', kind: 'intl', label: 'Thử AI 3', price_register: 333_000, price_renew: 333_000, is_active: 1, is_featured: 0, sort_order: 5 });
  upsertTld({ tld: 'aingung', kind: 'intl', label: 'Ngừng bán', price_register: 1, price_renew: 1, is_active: 0, sort_order: 6 });

  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
  aiGia.close();
});

/** Bat AI voi khoa, model thu; chi phi hom nay ve 0. */
function batAi(them: Record<string, string> = {}): void {
  M.setSettings(
    {
      'ai.enabled': '1', 'ai.openai_key': KHOA_THU, 'ai.model': 'model-thu', 'ai.daily_cap_vnd': '50000',
      'ai.price_input_usd': '1', 'ai.price_output_usd': '5', 'ai.usd_vnd': '27000', 'ai.timeout_sec': '15',
      'ai.max_names': '8', 'ai.max_checks': '16', 'ai.rate_per_minute': '5', 'ai.rate_per_day': '30',
      'ai.blocked_words': 'google, honda, bet, congan',
      ...them,
    },
    M.SECRET_KEYS,
  );
}

function datChiPhiHomNay(vnd: number): void {
  M.db.prepare('DELETE FROM ai_usage_daily WHERE day = ?').run(M.svc.ngayVn());
  if (vnd > 0) M.db.prepare('INSERT INTO ai_usage_daily (day, cost_vnd) VALUES (?, ?)').run(M.svc.ngayVn(), vnd);
}

function homNay(): Record<string, number> {
  return (M.db.prepare('SELECT * FROM ai_usage_daily WHERE day = ?').get(M.svc.ngayVn()) ?? {}) as Record<string, number>;
}

/** Ten ngau nhien de khong trung bo dem kiem tra cua lan chay truoc. */
const ngauNhien = () => Math.random().toString(36).slice(2, 8);

function aiGiaLap(goiY: { ten: string; lyDo: string }[]) {
  let goi = 0;
  return {
    get soLan() { return goi; },
    nhaCungCap: { ten: 'gia', goiY: async () => { goi++; return { goiY, tokenVao: 100, tokenRa: 100 }; } },
  };
}

function kiemGia(traVe: (d: string) => CheckResult | null) {
  const daGui: string[] = [];
  return {
    daGui,
    kiem: async (ds: string[]) => {
      daGui.push(...ds);
      return ds.map(traVe).filter((r): r is CheckResult => r !== null);
    },
  };
}

const ketQua = (domain: string, ok: boolean, available: boolean): CheckResult => ({
  raw: ok ? (available ? '1' : '0') : '', data: {}, ok, code: ok ? '' : 'ERROR',
  message: ok ? '' : 'lỗi giả lập', durationMs: 0, domain, available,
});

beforeEach(() => {
  cheDo = 'ok';
  batAi();
  datChiPhiHomNay(0);
});

/* ======================================================= phan 1: don vi */

test('chuan hoa ten: khong dau, chi [a-z0-9-], khong dau cuoi gach, dai qua thi loai', () => {
  const { chuanHoaTen } = M.svc;
  assert.equal(chuanHoaTen('Bánh Mì Cô Ba'), 'banh-mi-co-ba');
  assert.equal(chuanHoaTen('café-đà-lạt'), 'cafe-da-lat');
  assert.equal(chuanHoaTen('  --abc--  '), 'abc');
  assert.equal(chuanHoaTen('abc.xyz'), 'abc');
  assert.equal(chuanHoaTen('https://www.Tiem-Banh.vn/abc'), 'tiem-banh');
  assert.equal(chuanHoaTen('a'.repeat(70)), null);
  assert.equal(chuanHoaTen('<script>!!</script>'), 'scriptscript');
  assert.equal(chuanHoaTen('★☆✿'), null);
  assert.equal(chuanHoaTen('Phở__Ngon   Quá'), 'pho-ngon-qua');
  for (const dau of ['Bánh Mì Cô Ba', 'café-đà-lạt', '  --abc--  ', 'x'.repeat(63), 'Ưu Đãi Ơi', '1-2-3', 'a---b']) {
    const t = chuanHoaTen(dau);
    if (t === null) continue;
    assert.match(t, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, dau);
    assert.doesNotMatch(t, /--/, dau);
    assert.ok(M.domainSchema.safeParse(`${t}.vn`).success, dau);
  }
});

test('chuan hoa mo ta: gop khoang trang, 3 den 200 ky tu tinh theo ky tu', () => {
  const { chuanHoaMoTa } = M.svc;
  assert.equal(chuanHoaMoTa('  tiệm   bánh\n mì '), 'tiệm bánh mì');
  assert.equal(chuanHoaMoTa('ab'), null);
  assert.equal(chuanHoaMoTa('ấ'.repeat(200))?.length, 200);
  assert.equal(chuanHoaMoTa('ấ'.repeat(201)), null);
  assert.equal(chuanHoaMoTa(undefined), null);
});

test('loc tu cam: tu dai khop chuoi con, tu ngan chi khop nguyen khuc', () => {
  const { biCam, tachTuCam } = M.svc;
  const tu = tachTuCam('Honda, bet;\nCông An\n google ');
  assert.deepEqual(tu, ['honda', 'bet', 'congan', 'google']);
  assert.ok(biCam('hondacantho', tu));
  assert.ok(biCam('xe-honda-re', tu));
  assert.ok(biCam('cong-an-tinh', tu));
  assert.ok(biCam('bet-88', tu));
  assert.ok(!biCam('betong-mientay', tu));
  assert.ok(!biCam('banh-mi-co-ba', tu));
});

test('chon duoi: chi duoi dang ban, toi da 2, bo duoi ngung ban', () => {
  const ds = M.svc.chonDuoi(['.AIHAI', 'aingung', 'khongco', 'aimot', 'aiba']).map((t) => t.tld);
  assert.equal(ds.length, 2);
  assert.ok(!ds.includes('aingung'));
  for (const d of ds) assert.ok(['aimot', 'aihai', 'aiba'].includes(d));
  // Khong chon gi thi lay duoi dang ban (noi bat truoc), van khong qua 2
  const macDinh = M.svc.chonDuoi([]);
  assert.ok(macDinh.length >= 1 && macDinh.length <= 2);
  for (const t of macDinh) assert.equal(t.is_active, 1);
});

test('goi y: abc.xyz doi sang duoi khach chon, tu cam khong gui P.A, con trong co gia', async () => {
  const s = ngauNhien();
  const ai = aiGiaLap([
    { ten: `abc${s}.xyz`, lyDo: 'Ngắn gọn' },
    { ten: `google${s}`, lyDo: 'Thương hiệu' },
    { ten: `Bánh Mì ${s}`, lyDo: 'Dễ nhớ' },
    { ten: `abc${s}`, lyDo: 'Trùng sau chuẩn hóa' },
  ]);
  const p = kiemGia((d) => ketQua(d, true, d.startsWith('abc')));
  const kq = await M.svc.goiYTenMien({ moTa: 'tiệm bánh mì ở Cần Thơ', duoi: ['aimot'] }, { nhaCungCap: ai.nhaCungCap, kiem: p.kiem });
  assert.equal(kq.loai, 'ok');
  if (kq.loai !== 'ok') return;
  assert.deepEqual(p.daGui, [`abc${s}.aimot`, `banh-mi-${s}.aimot`]);
  assert.ok(!p.daGui.some((d) => d.includes('google')));
  assert.equal(kq.dong[0]!.domain, `abc${s}.aimot`);
  assert.equal(kq.dong[0]!.trangThai, 'con-trong');
  assert.equal(kq.dong[0]!.price?.total, 111_000);
  assert.equal(kq.dong[1]!.trangThai, 'da-co-chu');
  assert.equal(kq.dong[1]!.price, null);
  for (const d of kq.dong) if (d.trangThai === 'con-trong') assert.ok(d.price && d.price.total > 0);
});

test('tran lenh P.A: 12 ten x 2 duoi chi gui toi da 16 lenh, cau hinh khong vuot duoc 8 ten', async () => {
  batAi({ 'ai.max_names': '50', 'ai.max_checks': '99' });
  const s = ngauNhien();
  const ai = aiGiaLap(Array.from({ length: 12 }, (_, i) => ({ ten: `ten${i}${s}`, lyDo: '' })));
  const p = kiemGia((d) => ketQua(d, true, true));
  const kq = await M.svc.goiYTenMien({ moTa: 'cửa hàng hoa', duoi: ['aimot', 'aihai'] }, { nhaCungCap: ai.nhaCungCap, kiem: p.kiem });
  assert.equal(kq.loai, 'ok');
  assert.equal(p.daGui.length, 16);
  assert.equal(new Set(p.daGui.map((d) => d.split('.')[0])).size, 8);
});

test('an toan trang thai: P.A loi hoac thieu dong thi Chua kiem tra duoc, khong co gia', async () => {
  const s = ngauNhien();
  const ai = aiGiaLap([{ ten: `loi${s}`, lyDo: '' }, { ten: `thieu${s}`, lyDo: '' }, { ten: `co${s}`, lyDo: '' }]);
  const p = kiemGia((d) => (d.startsWith('loi') ? ketQua(d, false, true) : d.startsWith('thieu') ? null : ketQua(d, true, true)));
  const kq = await M.svc.goiYTenMien({ moTa: 'quán cà phê', duoi: ['aimot'] }, { nhaCungCap: ai.nhaCungCap, kiem: p.kiem });
  assert.equal(kq.loai, 'ok');
  if (kq.loai !== 'ok') return;
  const theo = new Map(kq.dong.map((d) => [d.sld, d]));
  assert.equal(theo.get(`loi${s}`)!.trangThai, 'chua-kiem-tra');
  assert.equal(theo.get(`loi${s}`)!.price, null);
  assert.equal(theo.get(`thieu${s}`)!.trangThai, 'chua-kiem-tra');
  assert.equal(theo.get(`thieu${s}`)!.price, null);
  assert.equal(kq.dong[0]!.sld, `co${s}`, 'con trong xep truoc');
});

test('mo ta qua dai hoac AI tat thi khong goi AI', async () => {
  const ai = aiGiaLap([{ ten: 'abc', lyDo: '' }]);
  const dai = await M.svc.goiYTenMien({ moTa: 'a'.repeat(201) }, { nhaCungCap: ai.nhaCungCap });
  assert.equal(dai.loai, 'khong-hop-le');
  M.setSetting('ai.enabled', '0');
  const tat = await M.svc.goiYTenMien({ moTa: 'quán phở' }, { nhaCungCap: ai.nhaCungCap });
  assert.equal(tat.loai, 'tat');
  batAi({ 'ai.model': '' });
  assert.equal(M.svc.trangThaiAi(), 'thieu-cau-hinh');
  assert.equal(ai.soLan, 0);
});

test('tran chi phi: cong dung theo usage va don gia, cham tran thi khong goi AI va dem bi chan', async () => {
  // 100 token vao x 1 USD + 100 token ra x 5 USD tren 1 trieu, ty gia 27.000
  const ai = aiGiaLap([{ ten: `x${ngauNhien()}`, lyDo: '' }]);
  const p = kiemGia((d) => ketQua(d, true, false));
  await M.svc.goiYTenMien({ moTa: 'quán phở', duoi: ['aimot'] }, { nhaCungCap: ai.nhaCungCap, kiem: p.kiem });
  assert.ok(Math.abs(M.svc.chiPhiHomNay() - 16.2) < 1e-9, String(M.svc.chiPhiHomNay()));

  datChiPhiHomNay(50_000);
  assert.equal(M.svc.trangThaiAi(), 'cham-tran');
  const kq = await M.svc.goiYTenMien({ moTa: 'quán phở', duoi: ['aimot'] }, { nhaCungCap: ai.nhaCungCap, kiem: p.kiem });
  assert.equal(kq.loai, 'het-han-muc');
  assert.equal(ai.soLan, 1);
  assert.equal(homNay()['blocked'], 1);

  // Don gia 0 hoac rong khong duoc lam chi phi thanh 0 (tran se khong bao gio cham)
  batAi({ 'ai.price_input_usd': '0', 'ai.price_output_usd': '', 'ai.usd_vnd': '-5' });
  assert.ok(M.svc.uocTinhChiPhi(1_000_000, 0) > 0);
});

test('loi het gio cong chi phi xau nhat, loi HTTP khong cong, loi dinh dang van cong usage', async () => {
  const { AiError, MAX_TOKEN_RA } = M.ai;
  const nem = (e: Error) => ({ ten: 'gia', goiY: async () => { throw e; } });
  const r1 = await M.svc.goiYTenMien({ moTa: 'quán phở' }, { nhaCungCap: nem(new AiError('timeout', 'het gio')) });
  assert.equal(r1.loai, 'loi');
  assert.ok(Math.abs(M.svc.chiPhiHomNay() - M.svc.uocTinhChiPhi(500, MAX_TOKEN_RA)) < 1e-9);

  datChiPhiHomNay(0);
  await M.svc.goiYTenMien({ moTa: 'quán phở' }, { nhaCungCap: nem(new AiError('http', 'HTTP 401', undefined, undefined, 401)) });
  assert.equal(M.svc.chiPhiHomNay(), 0);

  await M.svc.goiYTenMien({ moTa: 'quán phở' }, { nhaCungCap: nem(new AiError('dinh-dang', 'hong', 300, 200)) });
  assert.ok(Math.abs(M.svc.chiPhiHomNay() - M.svc.uocTinhChiPhi(300, 200)) < 1e-9);
  assert.equal(homNay()['errors'], 2, 'hai loi sau lan dat lai dong hom nay');
});

test('nha cung cap OpenAI: doc usage, phan loai loi, het gio, khong lo khoa trong thong bao loi', async () => {
  const tao = (timeoutMs = 2000) => M.openai.taoOpenAi({
    apiKey: KHOA_THU, model: 'model-thu', reasoningEffort: '', timeoutMs, baseUrl: process.env['OPENAI_BASE_URL']!,
  });
  tenGia = [{ ten: 'banhmicoba', ly_do: 'Dễ nhớ' }];
  const ok = await tao().goiY({ moTa: 'tiệm bánh mì', soTen: 8 });
  assert.deepEqual(ok, { goiY: [{ ten: 'banhmicoba', lyDo: 'Dễ nhớ' }], tokenVao: 300, tokenRa: 200 });
  assert.equal(authNhanDuoc, `Bearer ${KHOA_THU}`);

  const loi = async (c: CheDo, timeoutMs?: number) => {
    cheDo = c;
    try {
      await tao(timeoutMs).goiY({ moTa: 'tiệm bánh mì', soTen: 8 });
      return null;
    } catch (e) {
      return e as InstanceType<typeof M.ai.AiError>;
    }
  };
  assert.equal((await loi('500'))?.ma, 'http');
  const q = await loi('quota');
  assert.equal(q?.ma, 'het-tien');
  assert.doesNotMatch(q!.message, /sk-/);
  const h = await loi('hong');
  assert.equal(h?.ma, 'dinh-dang');
  assert.equal(h?.tokenRa, 200);
  assert.equal((await loi('cat'))?.ma, 'dinh-dang');
  assert.equal((await loi('cham', 200))?.ma, 'timeout');
});

/* ======================================================= phan 2: HTTP */

async function phien(ip: string): Promise<{ cookie: string; csrf: string }> {
  const r = await fetch(`${goc}/dang-nhap`, { headers: { 'cf-connecting-ip': ip } });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const csrf = (await r.text()).match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  assert.ok(cookie && csrf);
  return { cookie, csrf };
}

async function gui(
  ip: string,
  truong: Record<string, string | string[]>,
  p?: { cookie: string; csrf: string },
): Promise<{ status: number; html: string; headers: Headers }> {
  const ph = p ?? (await phien(ip));
  const body = new URLSearchParams();
  if (!('_csrf' in truong)) body.append('_csrf', ph.csrf);
  for (const [k, v] of Object.entries(truong)) for (const x of [v].flat()) body.append(k, x);
  const r = await fetch(`${goc}/tim-cung-ai`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: ph.cookie, 'cf-connecting-ip': ip },
    body: body.toString(),
  });
  return { status: r.status, html: await r.text(), headers: r.headers };
}

async function trang(p: string, ip = ipMoi()): Promise<{ status: number; html: string }> {
  const r = await fetch(goc + p, { redirect: 'manual', headers: { 'cf-connecting-ip': ip } });
  return { status: r.status, html: await r.text() };
}

test('trang chu: tab AI khi san sang; tat hoac cham tran thi an tab, duong dan AI bao than thien, khong goi AI', async () => {
  const bat = await trang('/');
  assert.match(bat.html, /id="tc-tab-ai"/);
  assert.match(bat.html, /<label for="tc-tab-ai">Tìm cùng AI<\/label>/);
  assert.match(bat.html, /<form class="tc-ai tc-panel-ai"[^>]*action="\/tim-cung-ai" method="post"/);
  assert.match(bat.html, /name="mo_ta"[^>]*maxlength="200"/);
  assert.match(bat.html, /Gợi ý do AI tạo, trạng thái còn trống được kiểm tra thật qua nhà đăng ký\./);

  const truoc = soLanGoiAi;
  M.setSetting('ai.enabled', '0');
  assert.doesNotMatch((await trang('/')).html, /tc-tab-ai|tim-cung-ai/);
  const g = await trang('/tim-cung-ai');
  assert.equal(g.status, 200);
  assert.match(g.html, /đang tạm tắt/);
  const p = await gui(ipMoi(), { mo_ta: 'tiệm bánh mì ở Cần Thơ' });
  assert.equal(p.status, 200);
  assert.match(p.html, /đang tạm tắt/);

  batAi();
  datChiPhiHomNay(50_000);
  assert.doesNotMatch((await trang('/')).html, /tc-tab-ai/);
  const c = await gui(ipMoi(), { mo_ta: 'tiệm bánh mì ở Cần Thơ' });
  assert.equal(c.status, 200);
  assert.match(c.html, /hết lượt của hôm nay/);
  assert.match(c.html, /href="\/#tim-ten-mien">Tìm theo từ khóa/);
  assert.equal(soLanGoiAi, truoc, 'tat hoac cham tran thi khong goi OpenAI');
});

test('POST hop le: ten loc xong, trang thai tu P.A sandbox, noindex, khong script noi tuyen', async () => {
  const s = ngauNhien();
  tenGia = [
    { ten: `Bánh Mì ${s}`, ly_do: 'Gọn, đúng ngành <b>nghề</b>' },
    { ten: `google-${s}`, ly_do: 'Không được hiện' },
    { ten: `tiem-${s}.xyz`, ly_do: 'Đuôi lạ bị đổi' },
  ];
  const truoc = soLanGoiAi;
  const r = await gui(ipMoi(), { mo_ta: 'tiệm bánh mì nhà làm ở Cần Thơ', duoi: ['aimot', 'aihai'] });
  assert.equal(r.status, 200);
  assert.equal(soLanGoiAi, truoc + 1);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(r.html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(r.html, new RegExp(`banh-mi-${s}<span class="tld">\\.aimot`));
  assert.match(r.html, new RegExp(`tiem-${s}<span class="tld">\\.aihai`));
  assert.doesNotMatch(r.html, /google-|\.xyz/);
  assert.match(r.html, /Gọn, đúng ngành &lt;b&gt;nghề&lt;\/b&gt;/);
  // Moi dong Con trong co dung mot nut gio hang gan nguon=ai; khong dong nao khac co
  const conTrong = (r.html.match(/badge-ok">Còn trống/g) ?? []).length;
  assert.equal((r.html.match(/name="nguon" value="ai"/g) ?? []).length, conTrong);
  assert.equal((r.html.match(/class="result-price"/g) ?? []).length, conTrong);
  assert.equal((r.html.match(/class="result /g) ?? []).length, 4);
  // CSP: khong script noi tuyen, khong thuoc tinh on*=
  assert.doesNotMatch(r.html, /<script(?![^>]*\ssrc=)[^>]*>/i);
  assert.doesNotMatch(r.html, /\son[a-z]+=/i);
  // Mo ta chi dien lai trong form cua chinh phan hoi nay
  assert.match(r.html, /name="mo_ta" value="tiệm bánh mì nhà làm ở Cần Thơ"/);
});

test('gioi han: luot thu 6 trong mot phut cua cung IP tra 429 tieng Viet va dem bi chan', async () => {
  tenGia = [{ ten: `gh${ngauNhien()}`, ly_do: '' }];
  const ip = ipMoi();
  const p = await phien(ip);
  const ma: number[] = [];
  let cuoi = '';
  for (let i = 0; i < 6; i++) {
    const r = await gui(ip, { mo_ta: 'quán phở gia truyền', duoi: 'aimot' }, p);
    ma.push(r.status);
    cuoi = r.html;
  }
  assert.deepEqual(ma, [200, 200, 200, 200, 200, 429]);
  assert.match(cuoi, /quá nhanh/);
  assert.equal(homNay()['blocked'], 1);
  // IP khac khong bi anh huong
  assert.equal((await gui(ipMoi(), { mo_ta: 'quán phở gia truyền', duoi: 'aimot' })).status, 200);
});

test('gioi han ngay: vuot so luot moi ngay cua mot IP tra 429', async () => {
  batAi({ 'ai.rate_per_day': '2', 'ai.rate_per_minute': '100' });
  tenGia = [{ ten: `gn${ngauNhien()}`, ly_do: '' }];
  const ip = ipMoi();
  const p = await phien(ip);
  const ma: number[] = [];
  for (let i = 0; i < 3; i++) ma.push((await gui(ip, { mo_ta: 'quán phở gia truyền' }, p)).status);
  assert.deepEqual(ma, [200, 200, 429]);
});

test('mo ta 201 ky tu tra 400 truoc khi goi AI', async () => {
  const truoc = soLanGoiAi;
  const r = await gui(ipMoi(), { mo_ta: 'ấ'.repeat(201) });
  assert.equal(r.status, 400);
  assert.match(r.html, /3 đến 200 ký tự/);
  assert.equal(soLanGoiAi, truoc);
});

test('CSRF: thieu hoac sai token tra 403, khong goi AI', async () => {
  const truoc = soLanGoiAi;
  const ip = ipMoi();
  const p = await phien(ip);
  assert.equal((await gui(ip, { _csrf: '', mo_ta: 'quán phở' }, p)).status, 403);
  assert.equal((await gui(ip, { _csrf: 'sai-token', mo_ta: 'quán phở' }, p)).status, 403);
  // Khong co cookie phien: token cua phien khac khong dung duoc
  assert.equal((await gui(ip, { mo_ta: 'quán phở' }, { cookie: '', csrf: p.csrf })).status, 403);
  assert.equal(soLanGoiAi, truoc);
});

test('OpenAI loi 500, het han muc hoac tra sai dinh dang: trang than thien, khong 500', async () => {
  for (const c of ['500', 'quota', 'hong'] as const) {
    cheDo = c;
    const r = await gui(ipMoi(), { mo_ta: 'quán phở gia truyền' });
    assert.equal(r.status, 200, c);
    assert.match(r.html, /chưa gợi ý được tên/, c);
    assert.match(r.html, /Tìm theo từ khóa/, c);
  }
});

test('robots chan /tim-cung-ai, sitemap khong co duong dan AI', async () => {
  assert.match((await trang('/robots.txt')).html, /^Disallow: \/tim-cung-ai$/m);
  assert.doesNotMatch((await trang('/sitemap.xml')).html, /tim-cung-ai/);
});

test('them vao gio tu trang AI dem added_to_cart', async () => {
  const { createHash } = await import('node:crypto');
  // Ten ma P.A sandbox bao con trong (cung cong thuc voi sandboxResponse)
  let domain = '';
  for (let i = 0; !domain; i++) {
    const d = `giohang${ngauNhien()}${i}.aimot`;
    if (parseInt(createHash('sha256').update(d).digest('hex').slice(0, 2), 16) % 3 === 0) domain = d;
  }
  const ip = ipMoi();
  const p = await phien(ip);
  const r = await fetch(`${goc}/gio-hang/them`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: p.cookie, 'cf-connecting-ip': ip },
    body: new URLSearchParams({ _csrf: p.csrf, domain, years: '1', action: 'register', nguon: 'ai' }).toString(),
  });
  assert.equal(r.status, 302);
  assert.equal(homNay()['added_to_cart'], 1);
});

test('bi mat: khoa OpenAI ma hoa trong CSDL, trang cau hinh chi hien dang che, log khong co khoa va mo ta', async () => {
  assert.ok(M.SECRET_KEYS.includes('ai.openai_key'));
  const row = M.db.prepare(`SELECT value, is_secret FROM settings WHERE key = 'ai.openai_key'`).get() as { value: string; is_secret: number };
  assert.equal(row.is_secret, 1);
  assert.ok(!row.value.includes(KHOA_THU) && !row.value.includes('KHOA-BI-MAT'));

  // Phien quan tri da bat 2FA (nhu kiem-base)
  const { nowIso, isoIn } = await import('../src/db/index.js');
  const { encryptSecret, randomToken } = await import('../src/lib/crypto.js');
  const { config } = await import('../src/config.js');
  const { createHmac } = await import('node:crypto');
  const email = `quantri-ai-${ngauNhien()}@test.vn`;
  const adminId = Number(M.db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at) VALUES (?, 'x', 'Quản trị', 'admin', ?, ?)`,
  ).run(email, nowIso(), nowIso()).lastInsertRowid);
  M.db.prepare('INSERT INTO two_factor (user_id, secret_enc, confirmed_at) VALUES (?, ?, ?)').run(adminId, encryptSecret('JBSWY3DPEHPK3PXP'), nowIso());
  const sid = randomToken(24);
  M.db.prepare(`INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, '', '', ?, ?)`)
    .run(sid, adminId, JSON.stringify({ userId: adminId }), isoIn(3600_000), nowIso());
  const cookie = `sid=${sid}.${createHmac('sha256', config.sessionSecret).update(sid).digest('base64url')}`;

  const cauHinh = await fetch(`${goc}/admin/cau-hinh`, { headers: { cookie, 'cf-connecting-ip': ipMoi() } });
  const html = await cauHinh.text();
  assert.equal(cauHinh.status, 200);
  assert.match(html, /name="ai\.openai_key"\s+value="[^"]*\*[^"]*"/);
  assert.ok(!html.includes(KHOA_THU) && !html.includes('KHOA-BI-MAT'));
  assert.match(html, /<textarea id="ai\.blocked_words"/);

  // Ghi lai moi dong log trong mot luot goi y (ca luot loi) roi tim khoa va mo ta
  const dong: string[] = [];
  const goc1 = console.log;
  const goc2 = console.error;
  console.log = (...a: unknown[]) => { dong.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { dong.push(a.map(String).join(' ')); };
  try {
    tenGia = [{ ten: `log${ngauNhien()}`, ly_do: '' }];
    await gui(ipMoi(), { mo_ta: 'MO-TA-RIENG-TU số 0909 tiệm bánh', duoi: 'aimot' });
    cheDo = 'quota';
    await gui(ipMoi(), { mo_ta: 'MO-TA-RIENG-TU số 0909 tiệm bánh', duoi: 'aimot' });
  } finally {
    console.log = goc1;
    console.error = goc2;
  }
  assert.ok(dong.some((l) => l.includes('ai_goi_y')), 'co log luot goi y');
  for (const l of dong) {
    assert.ok(!l.includes(KHOA_THU) && !l.includes('KHOA-BI-MAT'), l);
    assert.ok(!l.includes('MO-TA-RIENG-TU') && !l.includes('0909'), l);
  }

  // Thong ke an danh hien o Tong quan quan tri
  const tongQuan = await (await fetch(`${goc}/admin`, { headers: { cookie, 'cf-connecting-ip': ipMoi() } })).text();
  assert.match(tongQuan, /<h2>Tìm cùng AI<\/h2>/);
  assert.match(tongQuan, /Thêm vào giỏ/);
});
