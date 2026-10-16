/**
 * Bien the next= doc hai cho test dang nhap that, dung chung o che do goc
 * (open-redirect.test.ts) va duoi tien to (base-path.test.ts).
 *
 * Tep nay khong import gi tu src: base-path.test.ts phai dat BASE_PATH truoc
 * khi config.ts duoc nap.
 */
export const BIEN_THE_NEXT = [
  // Spec 3.10
  '//evil.com',
  '/\\evil.com',
  'https://evil.com',
  '%2F%2Fevil.com',
  // Evals loi 1: URL parser chuan hoa thanh pathname //evil.com
  '/.//evil.com',
  '/..//evil.com',
  '/%2e//evil.com',
  '/a/..//evil.com',
  '/%2e%2e//evil.com',
  '/./\\evil.com',
  '/.//evil.com/duong-dan?x=1',
  // Them: hoa thuong, ky tu dieu khien
  'HTTPS://evil.com',
  '/\t/evil.com',
  '/\u0000/evil.com',
];
