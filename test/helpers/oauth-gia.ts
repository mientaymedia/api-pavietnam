/**
 * May chu OAuth GIA cuc bo dong vai ca Zalo, Google, GitHub. App tro toi day
 * qua OAUTH_MOCK_BASE: https://host/duong thanh <goc>/host/duong. Khong goi
 * nha cung cap that.
 *
 * Kiem nhu ben that: ma chi dung mot lan, code_verifier phai khop
 * code_challenge theo S256, dung client secret (Zalo: header secret_key),
 * dung redirect_uri da gui luc xin quyen. Sai thi tra loi kieu tung ben
 * (Zalo, GitHub tra HTTP 200 kem error; Google tra 400).
 */
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type Ben = 'zalo' | 'google' | 'github';

export interface NguoiGia {
  id: string;
  ten: string;
  email?: string;
  /** Google email_verified; GitHub: email primary co verified hay khong. */
  daXacMinh?: boolean;
  /** Chinh id_token Google (test aud sai, nonce sai, het han). */
  suaIdToken?: Record<string, unknown>;
}

export interface YeuCauGia { duong: string; headers: http.IncomingHttpHeaders; form: Record<string, string> }

export interface OauthGia {
  goc: string;
  khoa: Record<Ben, { id: string; secret: string }>;
  yeuCau: YeuCauGia[];
  /**
   * Mo phong khach bam "Dong y" o trang xin quyen: doc URL xin quyen app vua
   * chuyen toi, cap ma cho `nguoi`, tra duong dan callback (bo goc APP_URL).
   */
  dongY(location: string, nguoi: NguoiGia): { callback: string; code: string; state: string; thamSo: URLSearchParams };
  dong(): Promise<void>;
}

interface MaCap { ben: Ben; challenge: string; redirectUri: string; nonce: string; nguoi: NguoiGia; daDung: boolean }

const S256 = (v: string) => crypto.createHash('sha256').update(v, 'ascii').digest('base64url');

function jwt(payload: Record<string, unknown>): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // Chu ky gia: app khong kiem chu ky khi nhan id_token truc tiep tu diem cuoi token
  return `${b({ alg: 'RS256', typ: 'JWT' })}.${b(payload)}.chu-ky-gia`;
}

export async function moOauthGia(): Promise<OauthGia> {
  const khoa: OauthGia['khoa'] = {
    zalo: { id: '1234567890', secret: 'zalo-bi-mat-thu' },
    google: { id: 'google-id-thu.apps.googleusercontent.com', secret: 'google-bi-mat-thu' },
    github: { id: 'Iv1.githubthu', secret: 'github-bi-mat-thu' },
  };
  const ma = new Map<string, MaCap>();
  const token = new Map<string, NguoiGia>();
  const yeuCau: YeuCauGia[] = [];

  function kiemMa(ben: Ben, f: Record<string, string>): MaCap | null {
    const m = ma.get(f['code'] ?? '');
    if (!m || m.ben !== ben || m.daDung) return null;
    m.daDung = true; // ma dung mot lan, ke ca khi cac buoc sau sai
    if (!f['code_verifier'] || S256(f['code_verifier']) !== m.challenge) return null;
    if (ben !== 'zalo' && f['redirect_uri'] !== m.redirectUri) return null;
    return m;
  }

  function capToken(nguoi: NguoiGia): string {
    const t = `tok_${crypto.randomBytes(12).toString('hex')}`;
    token.set(t, nguoi);
    return t;
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://gia');
      const form = Object.fromEntries(new URLSearchParams(body));
      yeuCau.push({ duong: u.pathname, headers: req.headers, form });
      const json = (status: number, du: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(du));
      };

      switch (u.pathname) {
        case '/oauth.zaloapp.com/v4/access_token': {
          if (req.headers['secret_key'] !== khoa.zalo.secret || form['app_id'] !== khoa.zalo.id) {
            return json(200, { error: -14014, error_name: 'Invalid app secret' });
          }
          const m = kiemMa('zalo', form);
          if (!m || form['grant_type'] !== 'authorization_code') return json(200, { error: -14002, error_name: 'Invalid code' });
          return json(200, { access_token: capToken(m.nguoi), refresh_token: 'r', expires_in: '3600' });
        }
        case '/graph.zalo.me/v2.0/me': {
          const n = token.get(String(req.headers['access_token'] ?? ''));
          if (!n) return json(200, { error: -216, message: 'Access token is invalid' });
          return json(200, { id: n.id, name: n.ten, picture: { data: { url: 'https://anh.gia/a.jpg' } }, error: 0, message: 'Success' });
        }
        case '/oauth2.googleapis.com/token': {
          if (form['client_id'] !== khoa.google.id || form['client_secret'] !== khoa.google.secret) {
            return json(401, { error: 'invalid_client' });
          }
          const m = kiemMa('google', form);
          if (!m || form['grant_type'] !== 'authorization_code') return json(400, { error: 'invalid_grant' });
          const n = m.nguoi;
          const id = jwt({
            iss: 'https://accounts.google.com', aud: khoa.google.id, sub: n.id, name: n.ten,
            email: n.email, email_verified: n.daXacMinh ?? false, nonce: m.nonce,
            iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
            ...n.suaIdToken,
          });
          return json(200, { access_token: capToken(n), id_token: id, expires_in: 3599, token_type: 'Bearer' });
        }
        case '/github.com/login/oauth/access_token': {
          if (form['client_id'] !== khoa.github.id || form['client_secret'] !== khoa.github.secret) {
            return json(200, { error: 'incorrect_client_credentials' });
          }
          const m = kiemMa('github', form);
          if (!m) return json(200, { error: 'bad_verification_code' });
          return json(200, { access_token: capToken(m.nguoi), token_type: 'bearer', scope: 'read:user,user:email' });
        }
        case '/api.github.com/user':
        case '/api.github.com/user/emails': {
          const n = token.get(String(req.headers['authorization'] ?? '').replace(/^Bearer /, ''));
          if (!n || !req.headers['user-agent']) return json(401, { message: 'Bad credentials' });
          if (u.pathname.endsWith('/user')) return json(200, { id: Number(n.id), login: `nguoi${n.id}`, name: n.ten });
          return json(200, n.email
            ? [
              { email: `khac-${n.id}@users.noreply.github.com`, primary: false, verified: true, visibility: null },
              { email: n.email, primary: true, verified: n.daXacMinh ?? false, visibility: 'private' },
            ]
            : []);
        }
        default:
          return json(404, { error: 'not_found' });
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    goc,
    khoa,
    yeuCau,
    dongY(location, nguoi) {
      assert(location.startsWith(goc + '/'), `phai chuyen toi may chu gia, nhan ${location}`);
      const u = new URL(location);
      const host = u.pathname.split('/')[1];
      const ben: Ben = host === 'oauth.zaloapp.com' ? 'zalo' : host === 'accounts.google.com' ? 'google' : 'github';
      const q = u.searchParams;
      const redirectUri = q.get('redirect_uri') ?? '';
      const code = `ma_${crypto.randomBytes(10).toString('hex')}`;
      ma.set(code, { ben, challenge: q.get('code_challenge') ?? '', redirectUri, nonce: q.get('nonce') ?? '', nguoi, daDung: false });
      const cb = new URL(redirectUri);
      return { callback: `${cb.pathname}?${new URLSearchParams({ code, state: q.get('state') ?? '' })}`, code, state: q.get('state') ?? '', thamSo: q };
    },
    dong: () => new Promise<void>((r) => server.close(() => r())),
  };
}

function assert(ok: boolean, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
