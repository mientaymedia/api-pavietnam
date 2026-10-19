/**
 * May chu P.A GIA cuc bo: tra dung dinh dang trong tai lieu API_PAVIETNAM.pdf
 * (JSON Command/ReturnCode/ReturnText, Money "3,896", Date "dd/mm/yyyy - dd/mm/yyyy").
 *
 * Phuc vu ca /interface.php va /interface_test.php: lenh ghi goi vao duong dan
 * thu thi tra 900 nhu P.A, goi vao duong dan that thi tra 200 (tru khi test dat
 * ma khac). Ghi lai moi request de test kiem tham so.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface YeuCauPA {
  duongDan: string;
  cmd: string;
  thamSo: Record<string, string>;
}

type TraLoi = { status?: number; body: string } | ((q: YeuCauPA) => { status?: number; body: string });

export interface PaGia {
  goc: string;
  yeuCau: YeuCauPA[];
  /** Ghi de phan hoi cua mot lenh (ap cho moi lan goi den khi xoa). */
  dat(cmd: string, traLoi: TraLoi | null): void;
  soDu: number;
  dong(): Promise<void>;
  datLai(): void;
}

const GHI = new Set([
  'register_domain_vietnam', 'register_domain_quocte', 'renew_domain',
  'change_dns_domain_vietnam', 'change_dns_domain_quocte', 'change_password_domain', 'set_info_domain',
]);

export const json = (o: unknown) => ({ body: JSON.stringify(o) });
export const ma = (cmd: string, returnCode: number, returnText = '', them: Record<string, unknown> = {}) =>
  json({ Command: cmd, ReturnCode: returnCode, ReturnText: returnText, ...them });

export async function moPaGia(): Promise<PaGia> {
  const ghiDe = new Map<string, TraLoi>();
  const pa: PaGia = {
    goc: '',
    yeuCau: [],
    soDu: 5_000_000,
    dat(cmd, traLoi) {
      if (traLoi) ghiDe.set(cmd, traLoi);
      else ghiDe.delete(cmd);
    },
    dong: async () => {},
    datLai() {
      ghiDe.clear();
      pa.yeuCau.length = 0;
      pa.soDu = 5_000_000;
    },
  };

  const macDinh = (q: YeuCauPA): { status?: number; body: string } => {
    const thu = q.duongDan.endsWith('/interface_test.php');
    if (GHI.has(q.cmd)) {
      if (thu) return ma(q.cmd, 900, 'Thực hiện thành công (Chế độ chạy test)');
      const gia = q.cmd === 'renew_domain' ? 480_000 : 830_000;
      if (q.cmd.startsWith('register') || q.cmd === 'renew_domain') {
        if (pa.soDu < gia) return ma(q.cmd, 400, 'Lỗi: Tài khoản không đủ tiền để thực hiện giao dịch');
        pa.soDu -= gia;
        return ma(q.cmd, 200, 'Thuc hien thanh cong', {
          trans_id: String(1_258_000 + pa.yeuCau.length),
          trans_date: '2026-10-19 09:00:00',
          trans_command: q.cmd === 'renew_domain' ? 'RENEW DOMAIN' : 'REG DOMAIN',
          trans_domain: q.thamSo['domain'] ?? `${q.thamSo['domainName']}.${q.thamSo['domainExt']}`,
          trans_note: '',
          trans_money: `-${gia.toLocaleString('en-US')}`,
          trans_accountstill: pa.soDu.toLocaleString('en-US'),
        });
      }
      return ma(q.cmd, 200, 'Thuc hien thanh cong');
    }
    switch (q.cmd) {
      case 'check_account_still':
        return json({ Command: q.cmd, Username: q.thamSo['username'], Money: pa.soDu.toLocaleString('en-US') });
      case 'get_date_domain':
        return json({ Command: q.cmd, Domain: q.thamSo['domain'], Date: '19/10/2026 - 19/10/2027' });
      case 'check_domain':
        return ma(q.cmd, 0, 'Domain khong ton tai trong he thong');
      case 'check_whois':
        return { body: '﻿1' };
      case 'get_province':
        return json([{ id: 79, name: 'Thành phố Hồ Chí Minh' }, { id: 91, name: 'Tỉnh An Giang' }]);
      case 'get_ward':
        return json(q.thamSo['province_id'] === '91'
          ? [{ id: 30292, name: 'Phường Bình Đức' }, { id: 30307, name: 'Phường Long Xuyên' }]
          : [{ id: 26734, name: 'Phường Tân Thuận' }]);
      default:
        return { body: '<pre>Array\n(\n    [Command] => INVALID COMMAND!\n    [ReturnCode] => 600\n    [ReturnText] => Lỗi: Lệnh thực thi không được hỗ trợ\n)\n</pre>' };
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const thamSo = Object.fromEntries(url.searchParams.entries());
    const q: YeuCauPA = { duongDan: url.pathname, cmd: thamSo['cmd'] ?? '', thamSo };
    pa.yeuCau.push(q);
    const t = ghiDe.get(q.cmd);
    const kq = t ? (typeof t === 'function' ? t(q) : t) : macDinh(q);
    res.writeHead(kq.status ?? 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(kq.body);
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  pa.goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pa.dong = () => new Promise<void>((r) => server.close(() => r()));
  return pa;
}
