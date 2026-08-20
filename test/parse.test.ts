import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asBool, normalizeDate, parseNameservers, parseResponse, pick } from '../src/pavietnam/parse.js';

test('doc duoc phan hoi JSON', () => {
  const data = parseResponse('{"status":"OK","domain":"abc.com","available":1}');
  assert.equal(pick(data, ['status']), 'OK');
  assert.equal(pick(data, ['domain']), 'abc.com');
  assert.equal(asBool(pick(data, ['available'])), true);
});

test('doc duoc phan hoi XML', () => {
  const data = parseResponse('<result><status>OK</status><Domain>abc.vn</Domain><expiredate>20/08/2027</expiredate></result>');
  assert.equal(pick(data, ['status']), 'OK');
  assert.equal(pick(data, ['domain']), 'abc.vn');           // key duoc ha ve chu thuong
  assert.equal(normalizeDate(pick(data, ['expiredate'])), '2027-08-20T00:00:00Z');
});

test('doc duoc phan hoi dang key=value', () => {
  const data = parseResponse('status=OK\ndomain=abc.net\nExpire Date = 2027-01-31');
  assert.equal(pick(data, ['status']), 'OK');
  assert.equal(pick(data, ['domain']), 'abc.net');
  assert.equal(pick(data, ['expire_date']), '2027-01-31');
});

test('van ban whois tu do khong bi nhan nham thanh key=value', () => {
  const whois = 'Domain Name: abc.com\nThis is a long free-form paragraph of text without any structure at all here\nAnother plain sentence follows below\nAnd one more plain line';
  const data = parseResponse(whois);
  assert.equal(typeof data['raw_text'], 'string');
});

test('phan hoi rong tra ve object rong', () => {
  assert.deepEqual(parseResponse(''), {});
  assert.deepEqual(parseResponse('   '), {});
});

test('normalizeDate nhan nhieu dinh dang', () => {
  assert.equal(normalizeDate('20/08/2027'), '2027-08-20T00:00:00Z');
  assert.equal(normalizeDate('2027-08-20'), '2027-08-20T00:00:00Z');
  assert.equal(normalizeDate('khong-phai-ngay'), undefined);
  assert.equal(normalizeDate(''), undefined);
});

test('parseNameservers loc gia tri rac', () => {
  assert.deepEqual(parseNameservers('ns1.pavietnam.vn, ns2.pavietnam.vn'), ['ns1.pavietnam.vn', 'ns2.pavietnam.vn']);
  assert.deepEqual(parseNameservers('NS1.ABC.COM.'), ['ns1.abc.com']);
  assert.deepEqual(parseNameservers('khong-hop-le'), []);
  assert.deepEqual(parseNameservers(undefined), []);
});

test('asBool hieu ca tieng Anh lan so', () => {
  assert.equal(asBool('yes'), true);
  assert.equal(asBool('0'), false);
  assert.equal(asBool('available'), true);
  assert.equal(asBool('khong-ro', true), true); // gia tri la -> dung fallback
});
