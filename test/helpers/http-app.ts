/**
 * Chay app that tren cong ngau nhien va dang nhap that (CSRF, phien) cho test
 * HTTP cua du an pa-dang-ky. Quan tri vien bat 2FA roi vao bang ma du phong,
 * khong tat cau hinh bat buoc 2FA (CSDL test dung chung giua cac tep).
 *
 * Phai goi `moApp()` SAU khi dat bien moi truong (config doc luc nap).
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Phien { cookie: string; csrf: string; userId: number; email: string }

export interface AppThu {
  goc: string;
  lay(p: string, init?: RequestInit): Promise<Response>;
  guiForm(p: string, phien: Pick<Phien, 'cookie'>, du: Record<string, string | string[]>): Promise<Response>;
  khach(): Promise<Phien>;
  quanTri(): Promise<Phien>;
  /** Lay lai token CSRF tu mot trang (token gan theo phien). */
  csrf(p: string, phien: Pick<Phien, 'cookie'>): Promise<string>;
  dong(): void;
}

export async function moApp(): Promise<AppThu> {
  delete process.env['BASE_PATH'];
  await import('./db.js');
  const { createApp } = await import('../../src/app.js');
  const { db, nowIso } = await import('../../src/db/index.js');
  const { hashPassword } = await import('../../src/lib/crypto.js');
  const server: Server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const lay = (p: string, init: RequestInit = {}) => fetch(goc + p, { redirect: 'manual', ...init });
  const guiForm = (p: string, phien: Pick<Phien, 'cookie'>, du: Record<string, string | string[]>) => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(du)) for (const x of Array.isArray(v) ? v : [v]) body.append(k, x);
    return lay(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: phien.cookie }, body: body.toString() });
  };
  const csrf = async (p: string, phien: Pick<Phien, 'cookie'>) => {
    const html = await (await lay(p, { headers: { cookie: phien.cookie } })).text();
    return html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  };

  async function dangNhap(role: 'customer' | 'admin'): Promise<Phien> {
    const email = `pa-${role}-${Math.random().toString(36).slice(2)}@test.vn`;
    const password = 'mat-khau-thu-123';
    const userId = Number(db.prepare(
      `INSERT INTO users (email, password_hash, full_name, role, email_verified_at, created_at, updated_at) VALUES (?, ?, 'Thu', ?, ?, ?, ?)`,
    ).run(email, hashPassword(password), role, nowIso(), nowIso(), nowIso()).lastInsertRowid);

    let maDuPhong = '';
    if (role === 'admin') {
      const { beginSetup, confirmSetup } = await import('../../src/services/twoFactor.js');
      const { currentCode } = await import('../../src/lib/totp.js');
      const { secret } = beginSetup(userId, email);
      const bat = confirmSetup(userId, currentCode(secret));
      assert.equal(bat.ok, true);
      maDuPhong = bat.recoveryCodes![0]!;
    }

    const r = await lay('/dang-nhap');
    let cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const token = (await r.text()).match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
    // Dang nhap cap phien moi (chong co dinh phien): doi cookie neu may chu gui lai
    const doiCookie = (res: Response) => {
      const moi = (res.headers.get('set-cookie') ?? '').split(';')[0];
      if (moi && moi.startsWith('sid=')) cookie = moi;
    };
    const r1 = await guiForm('/dang-nhap', { cookie }, { _csrf: token, email, password });
    assert.equal(r1.status, 302);
    doiCookie(r1);
    if (maDuPhong) {
      const t2 = await csrf('/dang-nhap/hai-lop', { cookie });
      const r2 = await guiForm('/dang-nhap/hai-lop', { cookie }, { _csrf: t2 || token, code: maDuPhong });
      assert.equal(r2.status, 302);
      doiCookie(r2);
    }
    // Token CSRF doi sau khi dang nhap: lay lai tu mot trang da dang nhap
    const sau = await csrf('/tai-khoan', { cookie });
    assert.ok(sau, 'phai lay duoc token CSRF sau dang nhap');
    return { cookie, csrf: sau, userId, email };
  }

  return {
    goc, lay, guiForm, csrf,
    khach: () => dangNhap('customer'),
    quanTri: () => dangNhap('admin'),
    dong: () => server.close(),
  };
}
