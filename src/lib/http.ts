import { log } from './logger.js';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  /** Cho phep retry voi loi 5xx (mac dinh chi retry loi mang/timeout). */
  retryOn5xx?: boolean;
}

/** fetch co timeout + retry luy thua, dung chung cho moi tich hop ben ngoai. */
export async function httpRequest(url: string, opts: FetchOptions = {}): Promise<string> {
  const { method = 'GET', headers = {}, body, timeoutMs = 30_000, retries = 2, retryOn5xx = true } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: ac.signal });
      const text = await res.text();
      if (!res.ok) {
        if (res.status >= 500 && retryOn5xx && attempt < retries) {
          lastErr = new HttpError(`HTTP ${res.status}`, res.status, text);
          await sleep(backoff(attempt));
          continue;
        }
        throw new HttpError(`HTTP ${res.status} tu ${hostOf(url)}`, res.status, text);
      }
      return text;
    } catch (err) {
      lastErr = err;
      const retriable = !(err instanceof HttpError) && attempt < retries;
      if (!retriable) break;
      log.warn('http_retry', { url: hostOf(url), attempt: attempt + 1, error: String(err) });
      await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof HttpError) throw lastErr;
  throw new HttpError(`Khong goi duoc ${hostOf(url)}: ${String(lastErr)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
