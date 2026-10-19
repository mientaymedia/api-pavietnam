/**
 * CONG CU DO API - chay tu may co IP da duoc P.A whitelist.
 *
 *   npm run pa:probe -- --domain tenmien-thu.com
 *   npm run pa:probe -- --domain tenmien-thu.com --only check,balance
 *   npm run pa:probe -- --action get_ward --params province_id=79
 *
 * Goi lan luot cac lenh CHI DOC trong tai lieu P.A (check_whois, get_whois,
 * check_account_still, get_date_domain, check_domain, get_province) va in phan
 * hoi tho, de doi chieu dinh dang that voi tai lieu.
 *
 * Khong bao gio goi lenh ghi (dang ky, gia han, doi DNS) vi chung phat sinh chi
 * phi that. Thu lenh ghi bang scripts/pa-thu-endpoint-test.mjs voi interface_test.php.
 */
import { settings } from '../lib/settings.js';
import { ACTIONS, FIELDS, type ActionKey } from './actions.js';
import { call, normalizeDomain } from './client.js';
import { maskSecret } from '../lib/crypto.js';

const SAFE: ActionKey[] = ['check', 'whois', 'balance', 'dates', 'owned', 'province'];
const NEEDS_DOMAIN: ActionKey[] = ['check', 'whois', 'dates', 'owned'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  console.log('='.repeat(72));
  console.log(' DO API DAI LY P.A VIET NAM (chi lenh doc)');
  console.log('='.repeat(72));
  const pa = settings.pa();
  console.log(` Endpoint : ${pa.endpoint}`);
  console.log(` Username : ${pa.username || '(chua dat)'}`);
  console.log(` API Key  : ${maskSecret(pa.apikey) || '(chua dat)'}`);
  console.log(` Sandbox  : ${pa.sandbox ? 'BAT (khong goi mang that)' : 'TAT'}`);
  console.log('');
  console.log(' Luu y: API chi chap nhan request tu IP da dang ky whitelist voi P.A.');
  console.log(' Neu tat ca deu loi 501 "IP khong duoc phep" -> kiem tra IP whitelist truoc.');
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
    const params: Record<string, string> = NEEDS_DOMAIN.includes(key) ? { [FIELDS.domain]: domain } : {};
    await run(ACTIONS[key], params);
  }
  console.log('\n' + '='.repeat(72));
}

async function run(action: string, params: Record<string, string>) {
  process.stdout.write(`  -> cmd=${action.padEnd(24)} `);
  try {
    const res = await call(action, params);
    const preview = res.raw.replace(/\s+/g, ' ').slice(0, 240);
    console.log(`[${res.ok ? 'OK ' : 'LOI'}] ${res.durationMs}ms${res.returnCode !== null ? ` ReturnCode=${res.returnCode}` : ''}`);
    console.log(`     ${preview || '(phan hoi rong)'}`);
  } catch (err) {
    console.log(`[LOI] ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
