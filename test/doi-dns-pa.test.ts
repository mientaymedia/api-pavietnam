/**
 * Doi nameserver qua Control Panel voi may chu P.A gia: .vn gui kem IP (nhap
 * tay hoac tu phan giai), quoc te gui toi da 4 ten.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AppThu, Phien } from './helpers/http-app.js';
import type { PaGia } from './helpers/pa-gia.js';

let app: AppThu;
let pa: PaGia;
let khach: Phien;
let M: {
  db: typeof import('../src/db/index.js')['db'];
  nowIso: typeof import('../src/db/index.js')['nowIso'];
  config: typeof import('../src/config.js')['config'];
  phanGiaiIp: typeof import('../src/pavietnam/client.js')['phanGiaiIp'];
};
let cu: Record<string, unknown> = {};

before(async () => {
  const { moApp } = await import('./helpers/http-app.js');
  const { moPaGia } = await import('./helpers/pa-gia.js');
  app = await moApp();
  pa = await moPaGia();
  const { db, nowIso } = await import('../src/db/index.js');
  const { config } = await import('../src/config.js');
  const { phanGiaiIp } = await import('../src/pavietnam/client.js');
  M = { db, nowIso, config, phanGiaiIp };
  cu = { ...config.pa };
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: false,
  });
  phanGiaiIp.resolve4 = async (h: string) => (h === 'ns2.pavietnam.vn' ? ['222.255.89.247'] : []);
  khach = await app.khach();
});
after(async () => {
  Object.assign(M.config.pa, cu);
  app?.dong();
  await pa?.dong();
});

function tenMien(duoi: string): string {
  const d = `dns${Math.random().toString(36).slice(2, 8)}.${duoi}`;
  M.db.prepare(`INSERT INTO domains (user_id, domain, tld, status, nameservers, created_at, updated_at) VALUES (?, ?, ?, 'active', '[]', ?, ?)`)
    .run(khach.userId, d, duoi, M.nowIso(), M.nowIso());
  return d;
}

test('.vn: dong "ten IP" va dong chi co ten (tu phan giai) gui change_dns_domain_vietnam', async () => {
  const d = tenMien('vn');
  pa.datLai();
  const r = await app.guiForm(`/control-panel/${d}/nameservers`, khach, {
    _csrf: khach.csrf, nameservers: 'ns1.pavietnam.vn 112.213.89.3\nns2.pavietnam.vn',
  });
  assert.equal(r.status, 302);
  const q = pa.yeuCau.find((x) => x.cmd === 'change_dns_domain_vietnam');
  assert.ok(q, 'phai goi change_dns_domain_vietnam');
  assert.equal(q!.thamSo['domain'], d);
  assert.equal(q!.thamSo['domainIP1'], '112.213.89.3');
  assert.equal(q!.thamSo['domainIP2'], '222.255.89.247');
  const ns = JSON.parse((M.db.prepare('SELECT nameservers FROM domains WHERE domain = ?').get(d) as { nameservers: string }).nameservers);
  assert.deepEqual(ns, ['ns1.pavietnam.vn', 'ns2.pavietnam.vn']);
});

test('.vn: khong phan giai duoc IP thi khong goi P.A va bao khach nhap IP', async () => {
  const d = tenMien('vn');
  pa.datLai();
  const r = await app.guiForm(`/control-panel/${d}/nameservers`, khach, { _csrf: khach.csrf, nameservers: 'ns1.khongco.vn\nns2.pavietnam.vn' });
  assert.equal(r.status, 302);
  assert.equal(pa.yeuCau.filter((x) => x.cmd.startsWith('change_dns')).length, 0);
  const html = await (await app.lay(`/control-panel/${d}`, { headers: { cookie: khach.cookie } })).text();
  assert.match(html, /Không tìm được địa chỉ IP của ns1\.khongco\.vn/);
});

test('quoc te: change_dns_domain_quocte voi 4 ten, IP sai dinh dang bi tu choi', async () => {
  const d = tenMien('com');
  pa.datLai();
  await app.guiForm(`/control-panel/${d}/nameservers`, khach, { _csrf: khach.csrf, nameservers: 'ns1.a.vn\nns2.a.vn\nns3.a.vn\nns4.a.vn' });
  const q = pa.yeuCau.find((x) => x.cmd === 'change_dns_domain_quocte');
  assert.equal(q?.thamSo['domainDNS4'], 'ns4.a.vn');
  pa.datLai();
  await app.guiForm(`/control-panel/${d}/nameservers`, khach, { _csrf: khach.csrf, nameservers: 'ns1.a.vn 999.1.1.1\nns2.a.vn' });
  assert.equal(pa.yeuCau.filter((x) => x.cmd.startsWith('change_dns')).length, 0);
});
