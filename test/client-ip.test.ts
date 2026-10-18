import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { clientIpMiddleware } from '../src/lib/clientIp.js';

/** Dung mot app nho giong createApp: middleware IP + trust proxy 1, tra ve req.ip. */
async function ipFor(headers: Record<string, string>): Promise<string> {
  const app = express();
  app.use(clientIpMiddleware('cf-connecting-ip'));
  app.set('trust proxy', 1);
  app.get('/', (req, res) => res.send(req.ip));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/`, { headers });
    return await res.text();
  } finally {
    server.close();
  }
}

test('lay IP that tu CF-Connecting-IP', async () => {
  assert.equal(await ipFor({ 'cf-connecting-ip': '203.0.113.7' }), '203.0.113.7');
  assert.equal(await ipFor({ 'cf-connecting-ip': '2001:db8::1' }), '2001:db8::1');
});

test('X-Forwarded-For gia mao bi bo qua, chi tin CF-Connecting-IP', async () => {
  const ip = await ipFor({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6, 7.7.7.7' });
  assert.equal(ip, '203.0.113.7');
});

test('khong co header Cloudflare thi X-Forwarded-For bi xoa, dung IP ket noi', async () => {
  const ip = await ipFor({ 'x-forwarded-for': '6.6.6.6' });
  assert.notEqual(ip, '6.6.6.6');
  assert.match(ip, /127\.0\.0\.1|::1/);
});

test('gia tri khong phai IP thi bo qua', async () => {
  for (const bad of ['abc', '1.2.3.4, 5.6.7.8', '999.1.1.1', '<script>']) {
    const ip = await ipFor({ 'cf-connecting-ip': bad });
    assert.match(ip, /127\.0\.0\.1|::1/, `gia tri ${bad}`);
  }
});
