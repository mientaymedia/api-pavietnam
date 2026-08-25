import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQr, qrSvg } from '../src/lib/qrcode.js';

/**
 * Hai ma tran "chuan" duoi day KHONG do code trong kho nay sinh ra: chung duoc
 * lay tu mot bo ma hoa QR doc lap (thu vien `qrcode` cua Python) roi doi chieu
 * tung o mot. Nho vay bai kiem thu khong tu cham diem chinh minh - neu bo ma
 * hoa o day lech chuan, ket qua se khac ngay.
 *
 * Ngoai ra ban dau ra da duoc GIAI MA LAI thanh cong bang OpenCV (bo giai ma
 * QR that su), tren toan bo pham vi phien ban 1..15.
 */

const CHUAN_HELLO = [
  '#######...#...#######',
  '#.....#..###..#.....#',
  '#.###.#.###...#.###.#',
  '#.###.#.###...#.###.#',
  '#.###.#.##..#.#.###.#',
  '#.....#.##.#..#.....#',
  '#######.#.#.#.#######',
  '........#.#..........',
  '#.#####...##..#####..',
  '#..#.#..###########.#',
  '#####.##....###..###.',
  '#...##..######..###..',
  '..##.######.###.....#',
  '........##..#...##...',
  '#######....#..#...##.',
  '#.....#.#....#.#.####',
  '#.###.#.##.#..##....#',
  '#.###.#.##..######...',
  '#.###.#.#...#..#..#..',
  '#.....#..##.##..###..',
  '#######.#..##.#.#..#.',
];

const CHUAN_OTPAUTH = [
  '#######.#.##.#.##.##.###..#######',
  '#.....#...#.##..####.#..#.#.....#',
  '#.###.#..##.#...###..#.##.#.###.#',
  '#.###.#.#.###..#..#.#.##..#.###.#',
  '#.###.#.#..#.####.....#...#.###.#',
  '#.....#.#.#.#.#.#.##....#.#.....#',
  '#######.#.#.#.#.#.#.#.#.#.#######',
  '........#...#...##.#.###.........',
  '#...#.###.###....#.###...#####..#',
  '...#.#.#...#..###.#....#.....####',
  '.####.#..#..####.##...###..###.#.',
  '.##.#...###..#.#.###.#..####...#.',
  '.#..#.###.##.#..##....##..####...',
  '##.#.#.##..#..###.#..##..##......',
  '#.###.#..#...###....#..#..#.####.',
  '#####..##.#.#.##.#...#.#..##...##',
  '...##.##.###.....##...#####.#.#..',
  '...###.#.#..#####.#.#.##.#.#..#..',
  '#.##.##..##....#.##..###.#.###...',
  '..####..###.....###.#####...#....',
  '#.#...#..#.####..#.##.#.#.##....#',
  '###....###.#.#.###....#...##..##.',
  '..##..####.#.#.##.#..#.####..###.',
  '..##....###..#.#.#.########.#..#.',
  '##.#.###.####...##.#.##.#######..',
  '........####..###.#..#.##...#.#..',
  '#######.#.####.#....###.#.#.#..#.',
  '#.....#..##.##...#.#.##.#...#..#.',
  '#.###.#.##....#######.#.######..#',
  '#.###.#..#.####.#...#.##.####.#..',
  '#.###.#....#...#.....#..#.#.#.#..',
  '#.....#...#...##.##..#.#....#....',
  '#######.#.....######.#######.##.#',
];

function veChuoi(text: string): string[] {
  return encodeQr(text).modules.map((h) => h.map((o) => (o ? '#' : '.')).join(''));
}

test('trung tung o voi bo ma hoa doc lap - chuoi ngan', () => {
  assert.deepEqual(veChuoi('Hello world'), CHUAN_HELLO);
});

test('trung tung o voi bo ma hoa doc lap - dia chi otpauth that', () => {
  assert.deepEqual(veChuoi('otpauth://totp/Test:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=Test'), CHUAN_OTPAUTH);
});

test('chon phien ban nho nhat vua du', () => {
  // Moc suc chua che do byte, muc sua loi M, theo chuan ISO/IEC 18004
  const moc: [number, number][] = [
    [14, 1], [15, 2], [26, 2], [27, 3], [42, 3], [43, 4], [62, 4], [63, 5],
    [84, 5], [85, 6], [106, 6], [107, 7], [122, 7], [123, 8], [152, 8],
    [153, 9], [180, 9], [181, 10], [213, 10], [214, 11], [251, 11],
    [252, 12], [287, 12], [288, 13], [331, 13], [332, 14], [362, 14],
    [363, 15], [412, 15],
  ];
  for (const [doDai, phienBan] of moc) {
    assert.equal(encodeQr('X'.repeat(doDai)).version, phienBan, `${doDai} byte phai vua phien ban ${phienBan}`);
  }
});

test('kich thuoc ma tran dung cong thuc 4v+17', () => {
  for (const [text, size] of [['a', 21], ['X'.repeat(30), 29], ['X'.repeat(200), 57]] as [string, number][]) {
    const kq = encodeQr(text);
    assert.equal(kq.size, size);
    assert.equal(kq.size, kq.version * 4 + 17);
    assert.equal(kq.modules.length, size);
    assert.equal(kq.modules[0]!.length, size);
  }
});

test('co du ba o dinh vi va o den co dinh', () => {
  const { modules, size } = encodeQr('kiem tra o dinh vi');
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]] as [number, number][]) {
    // Vien ngoai den, vanh trong trang, loi 3x3 den
    assert.equal(modules[r0]![c0], true);
    assert.equal(modules[r0 + 1]![c0 + 1], false);
    assert.equal(modules[r0 + 3]![c0 + 3], true);
  }
  // O den co dinh - luon den o moi ma QR
  assert.equal(modules[size - 8]![8], true);
});

test('vach nhip xen ke den trang', () => {
  const { modules, size } = encodeQr('kiem tra vach nhip');
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6]![i], i % 2 === 0, `vach ngang tai cot ${i}`);
    assert.equal(modules[i]![6], i % 2 === 0, `vach doc tai hang ${i}`);
  }
});

test('chuoi UTF-8 co dau ma hoa duoc', () => {
  const kq = encodeQr('Mien Tay Media - xac thuc hai lop');
  assert.ok(kq.size > 0);
  // Tieng Viet co dau chiem nhieu byte hon nen can phien ban lon hon
  assert.ok(encodeQr('Miền Tây Media').version >= encodeQr('Mien Tay Media').version);
});

test('bao loi ro rang khi chuoi qua dai', () => {
  assert.throws(() => encodeQr('X'.repeat(413)), /qua dai/);
});

test('SVG tu chua, khong goi ra ngoai', () => {
  const svg = qrSvg('otpauth://totp/Test:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=Test');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  // Khong duoc co bat ky tham chieu ra mang nao (CSP se chan, va lo khoa bi mat)
  assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(svg), false);
  assert.equal(svg.includes('<script'), false);
});

test('SVG chua vung trang quanh vien de may quet nhan ra', () => {
  const { size } = encodeQr('abc');
  const svg = qrSvg('abc', { scale: 4, vien: 4 });
  const canh = (size + 8) * 4;
  assert.ok(svg.includes(`width="${canh}"`), `phai co width=${canh}`);
});
