/**
 * May chu Telegram Bot API GIA cuc bo: nhan /bot<token>/<phuong_thuc>, ghi lai
 * than JSON, tra {"ok":true}. Khong goi Telegram that.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TinGui { token: string; phuongThuc: string; du: Record<string, unknown> }

export interface TelegramGia {
  goc: string;
  tin: TinGui[];
  dong(): Promise<void>;
}

export async function moTelegramGia(): Promise<TelegramGia> {
  const tg: TelegramGia = { goc: '', tin: [], dong: async () => {} };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');
      if (m) tg.tin.push({ token: m[1]!, phuongThuc: m[2]!, du: body ? JSON.parse(body) : {} });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: Boolean(m), result: {} }));
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  tg.goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tg.dong = () => new Promise<void>((r) => server.close(() => r()));
  return tg;
}
