/**
 * CONG CU DO API - chay tu may co IP da duoc P.A whitelist.
 *
 *   npm run pa:probe -- --domain tenmien-thu.com
 *   npm run pa:probe -- --domain tenmien-thu.com --only check,whois
 *   npm run pa:probe -- --action checkdomain --params domain=abc.com
 *
 * Cong cu goi lan luot cac ten action ung vien va in phan hoi tho, giup ban
 * xac dinh dung ten action / ten tham so ma tai khoan dai ly cua ban chap nhan.
 * Sau do dat lai trong .env (PA_ACTION_CHECK=..., PA_ACTION_REGISTER=...).
 *
 * CHI GOI CAC ACTION AN TOAN (chi doc). Khong bao gio thu `register`/`renew`
 * vi chung phat sinh chi phi that.
 */
import { settings } from '../lib/settings.js';
import { ACTION_CANDIDATES, ACTIONS, FIELDS, type ActionKey } from './actions.js';
import { call, normalizeDomain } from './client.js';
import { maskSecret } from '../lib/crypto.js';

const SAFE: ActionKey[] = ['check', 'whois', 'info', 'dnsGet', 'list', 'balance'];
const NEEDS_DOMAIN: ActionKey[] = ['check', 'whois', 'info', 'dnsGet'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  console.log('='.repeat(72));
  console.log(' DO API DAI LY P.A VIET NAM');
  console.log('='.repeat(72));
  const pa = settings.pa();
  console.log(` Endpoint : ${pa.endpoint}`);
  console.log(` Username : ${pa.username || '(chua dat)'}`);
  console.log(` API Key  : ${maskSecret(pa.apikey) || '(chua dat)'}`);
  console.log(` Sandbox  : ${pa.sandbox ? 'BAT (khong goi mang that)' : 'TAT'}`);
  console.log('');
  console.log(' Luu y: API chi chap nhan request tu IP da dang ky whitelist voi P.A.');
  console.log(' Neu tat ca deu loi "not allowed" / tra ve rong -> kiem tra IP whitelist truoc.');
  console.log('');

  const single = arg('action');
  if (single) {
    const params: Record<string, string> = {};
    for (const pair of (arg('params') ?? '').split(',').filter(Boolean)) {
      const [k, ...rest] = pair.split('=');
      if (k) params[k] = rest.join('=');
    }
    await run(single, params);
    return;
  }

  const domain = normalizeDomain(arg('domain') ?? 'pavietnam.vn');
  const only = (arg('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean) as ActionKey[];
  const keys = (only.length ? only : SAFE).filter((k) => SAFE.includes(k));

  for (const key of keys) {
    console.log('\n' + '-'.repeat(72));
    console.log(`# Nhom action: ${key}   (dang cau hinh: "${ACTIONS[key]}")`);
    console.log('-'.repeat(72));
    const params = NEEDS_DOMAIN.includes(key) ? { [FIELDS.domain]: domain } : {};
    for (const candidate of ACTION_CANDIDATES[key]) {
      await run(candidate, params);
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(' Chon ten action nao tra ve du lieu HOP LE roi ghi vao .env, vi du:');
  console.log('   PA_ACTION_CHECK=checkdomain');
  console.log('   PA_ACTION_WHOIS=whois');
  console.log(' Xem them: docs/API-PAVIETNAM.md');
  console.log('='.repeat(72));
}

async function run(action: string, params: Record<string, string>) {
  process.stdout.write(`  -> action=${action.padEnd(20)} `);
  try {
    const res = await call(action, params);
    const preview = res.raw.replace(/\s+/g, ' ').slice(0, 240);
    console.log(`[${res.ok ? 'OK ' : 'LOI'}] ${res.durationMs}ms`);
    console.log(`     ${preview || '(phan hoi rong)'}`);
  } catch (err) {
    console.log(`[LOI] ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
