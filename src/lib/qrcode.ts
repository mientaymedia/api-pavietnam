/**
 * Bo ma hoa ma QR (che do byte) - tu viet, khong phu thuoc thu vien ngoai.
 *
 * Vi sao phai tu viet: trang bat xac thuc hai lop can hien ma QR chua dia chi
 * otpauth://. Neu goi dich vu tao QR tren mang (vd api.qrserver.com) thi KHOA
 * BI MAT cua xac thuc hai lop se bi gui ra ben thu ba - dung nghia la trao chia
 * khoa cho nguoi la. Ve QR ngay tai may chu la cach duy nhat an toan.
 *
 * Pham vi ho tro: phien ban 1..10, muc sua loi M (~15%). Dia chi otpauth chi
 * dai khoang 140 ky tu nen thua suc chua (phien ban 10-M chua toi 213 byte).
 *
 * Tham chieu: ISO/IEC 18004.
 */

/* ------------------------------------------------------------ GF(256) cho Reed-Solomon */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function dungBangGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // da thuc nguyen thuy cua QR
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfNhan(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** Da thuc sinh cho `soByte` byte sua loi. */
function daThucSinh(soByte: number): number[] {
  let g = [1];
  for (let i = 0; i < soByte; i++) {
    const moi = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      moi[j] = (moi[j] ?? 0) ^ gfNhan(g[j]!, 1);
      moi[j + 1] = (moi[j + 1] ?? 0) ^ gfNhan(g[j]!, GF_EXP[i]!);
    }
    g = moi;
  }
  return g;
}

/** Sinh byte sua loi Reed-Solomon cho mot khoi du lieu. */
function maSuaLoi(data: number[], soByte: number): number[] {
  const g = daThucSinh(soByte);
  const du = new Array<number>(soByte).fill(0);
  for (const byte of data) {
    const heSo = byte ^ du[0]!;
    du.shift();
    du.push(0);
    if (heSo !== 0) for (let i = 0; i < g.length - 1; i++) du[i] = du[i]! ^ gfNhan(g[i + 1]!, heSo);
  }
  return du;
}

/* ------------------------------------------------------------ bang tham so */

// Muc sua loi M: [so byte sua loi moi khoi, so khoi] cho phien ban 1..15.
const EC_M: [number, number][] = [
  [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5],
  [30, 5], [22, 8], [22, 9], [24, 9], [24, 10],
];

// Toa do tam cua o dinh vi phu, theo phien ban 1..15.
const TAM_DINH_VI: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
];

const PHIEN_BAN_TOI_DA = EC_M.length;

/* ------------------------------------------------------------ khung ma tran */

interface Khung {
  size: number;
  /** 1 = den, 0 = trang */
  o: Uint8Array;
  /** 1 = o chuc nang (khong duoc ghi du lieu len) */
  giu: Uint8Array;
}

function dat(k: Khung, r: number, c: number, den: number): void {
  k.o[r * k.size + c] = den;
  k.giu[r * k.size + c] = 1;
}

function veODinhViChinh(k: Khung, r0: number, c0: number): void {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r < 0 || c < 0 || r >= k.size || c >= k.size) continue;
      const trongVien = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const den = trongVien
        ? (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)) ? 1 : 0
        : 0; // vien ngan cach
      dat(k, r, c, den);
    }
  }
}

function veODinhViPhu(k: Khung, r0: number, c0: number): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const max = Math.max(Math.abs(dr), Math.abs(dc));
      dat(k, r0 + dr, c0 + dc, max !== 1 ? 1 : 0);
    }
  }
}

function taoKhung(version: number): Khung {
  const size = version * 4 + 17;
  const k: Khung = { size, o: new Uint8Array(size * size), giu: new Uint8Array(size * size) };

  veODinhViChinh(k, 0, 0);
  veODinhViChinh(k, 0, size - 7);
  veODinhViChinh(k, size - 7, 0);

  // Vach nhip
  for (let i = 8; i < size - 8; i++) {
    const den = i % 2 === 0 ? 1 : 0;
    dat(k, 6, i, den);
    dat(k, i, 6, den);
  }

  // O dinh vi phu - bo qua cho da co o dinh vi chinh
  const tam = TAM_DINH_VI[version - 1] ?? [];
  for (const r of tam) {
    for (const c of tam) {
      const gocTren = r <= 8 && c <= 8;
      const gocPhai = r <= 8 && c >= size - 9;
      const gocDuoi = r >= size - 9 && c <= 8;
      if (gocTren || gocPhai || gocDuoi) continue;
      veODinhViPhu(k, r, c);
    }
  }

  // Cho danh cho thong tin dinh dang (ghi sau, khi da chon mat na)
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { dat(k, 8, i, 0); dat(k, i, 8, 0); }
  }
  for (let i = 0; i < 8; i++) {
    dat(k, 8, size - 1 - i, 0);
    dat(k, size - 1 - i, 8, 0);
  }
  dat(k, size - 8, 8, 1); // o den co dinh

  // Thong tin phien ban (chi tu phien ban 7 tro len)
  if (version >= 7) {
    const bits = thongTinPhienBan(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      dat(k, r, c, bit);
      dat(k, c, r, bit);
    }
  }

  return k;
}

/** BCH(18,6) cho thong tin phien ban. */
function thongTinPhienBan(version: number): number {
  let d = version << 12;
  for (let i = 0; i < 6; i++) if ((d >> (17 - i)) & 1) d ^= 0x1f25 << (5 - i);
  return (version << 12) | d;
}

/** BCH(15,5) + mat na 0x5412 cho thong tin dinh dang (muc M = 00). */
function thongTinDinhDang(mask: number): number {
  const duLieu = (0b00 << 3) | mask;
  let d = duLieu << 10;
  for (let i = 0; i < 5; i++) if ((d >> (14 - i)) & 1) d ^= 0x537 << (4 - i);
  return ((duLieu << 10) | d) ^ 0x5412;
}

function ghiThongTinDinhDang(k: Khung, mask: number): void {
  const bits = thongTinDinhDang(mask);
  const n = k.size;
  for (let i = 0; i < 15; i++) {
    // Chuan rai bit NANG TRUOC (MSB dau tien), khong phai nhe truoc.
    const bit = (bits >> (14 - i)) & 1;
    // Ban sao thu nhat: quanh o dinh vi goc tren trai
    if (i < 6) k.o[8 * n + i] = bit;
    else if (i < 8) k.o[8 * n + i + 1] = bit;
    else if (i === 8) k.o[7 * n + 8] = bit;
    else k.o[(14 - i) * n + 8] = bit;

    // Ban sao thu hai: 7 bit dau di doc cot 8 tu day len, 8 bit sau di ngang
    // hang 8 sat mep phai. Ranh gioi la i === 7 chu khong phai 8 - neu lech mot
    // bit thi bit thu 8 se de len O DEN CO DINH tai (n-8, 8) va lam hong ma.
    if (i < 7) k.o[(n - 1 - i) * n + 8] = bit;
    else k.o[8 * n + (n - 15 + i)] = bit;
  }
}

/* ------------------------------------------------------------ dong bit du lieu */

class DongBit {
  private bits: number[] = [];
  push(value: number, soBit: number): void {
    for (let i = soBit - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length(): number { return this.bits.length; }
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] ?? 0);
      out.push(b);
    }
    return out;
  }
}

/** So o trong (co the ghi du lieu) cua mot khung. */
function soODuLieu(k: Khung): number {
  let n = 0;
  for (let i = 0; i < k.giu.length; i++) if (!k.giu[i]) n++;
  return n;
}

/** Phien ban nho nhat du cho `soByte` byte, hoac null neu qua dai. */
function chonPhienBan(soByte: number): number | null {
  for (let v = 1; v <= PHIEN_BAN_TOI_DA; v++) {
    const [ecMoiKhoi, soKhoi] = EC_M[v - 1]!;
    const tongTu = Math.floor(soODuLieu(taoKhung(v)) / 8);
    const tuDuLieu = tongTu - ecMoiKhoi * soKhoi;
    const soBitDem = v <= 9 ? 8 : 16;
    if (4 + soBitDem + soByte * 8 <= tuDuLieu * 8) return v;
  }
  return null;
}

/** Xen ke cac khoi du lieu va khoi sua loi theo dung thu tu chuan. */
function dungChuoiTu(duLieu: number[], version: number): number[] {
  const [ecMoiKhoi, soKhoi] = EC_M[version - 1]!;
  const daiCoBan = Math.floor(duLieu.length / soKhoi);
  const soKhoiDai = duLieu.length % soKhoi;

  const khoiDuLieu: number[][] = [];
  const khoiEc: number[][] = [];
  let vt = 0;
  for (let i = 0; i < soKhoi; i++) {
    const dai = daiCoBan + (i >= soKhoi - soKhoiDai ? 1 : 0);
    const khoi = duLieu.slice(vt, vt + dai);
    vt += dai;
    khoiDuLieu.push(khoi);
    khoiEc.push(maSuaLoi(khoi, ecMoiKhoi));
  }

  const out: number[] = [];
  const daiToiDa = Math.max(...khoiDuLieu.map((b) => b.length));
  for (let i = 0; i < daiToiDa; i++) {
    for (const khoi of khoiDuLieu) if (i < khoi.length) out.push(khoi[i]!);
  }
  for (let i = 0; i < ecMoiKhoi; i++) {
    for (const khoi of khoiEc) out.push(khoi[i]!);
  }
  return out;
}

/** Rai byte du lieu vao khung theo duong zigzag tu goc duoi phai len. */
function raiDuLieu(k: Khung, tu: number[]): void {
  const n = k.size;
  let bitIdx = 0;
  const layBit = (): number => {
    const byte = tu[bitIdx >> 3];
    if (byte === undefined) return 0; // bit du cuoi ma - theo chuan de trang
    const bit = (byte >> (7 - (bitIdx & 7))) & 1;
    bitIdx++;
    return bit;
  };

  let len = false; // huong di: false = len tren
  for (let cotPhai = n - 1; cotPhai > 0; cotPhai -= 2) {
    if (cotPhai === 6) cotPhai = 5; // bo qua cot vach nhip
    for (let i = 0; i < n; i++) {
      const r = len ? i : n - 1 - i;
      for (const c of [cotPhai, cotPhai - 1]) {
        if (k.giu[r * n + c]) continue;
        k.o[r * n + c] = layBit();
      }
    }
    len = !len;
  }
}

function hamMatNa(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function apMatNa(k: Khung, mask: number): void {
  const n = k.size;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (k.giu[r * n + c]) continue;
      if (hamMatNa(mask, r, c)) k.o[r * n + c] = k.o[r * n + c]! ^ 1;
    }
  }
}

/** Diem phat theo 4 quy tac cua chuan; diem cang thap ma cang de doc. */
function diemPhat(k: Khung): number {
  const n = k.size;
  const at = (r: number, c: number): number => k.o[r * n + c]!;
  let diem = 0;

  // Quy tac 1: day >= 5 o cung mau
  for (let i = 0; i < n; i++) {
    for (const ngang of [true, false]) {
      let chay = 1;
      for (let j = 1; j < n; j++) {
        const a = ngang ? at(i, j) : at(j, i);
        const b = ngang ? at(i, j - 1) : at(j - 1, i);
        if (a === b) { chay++; } else { if (chay >= 5) diem += chay - 2; chay = 1; }
      }
      if (chay >= 5) diem += chay - 2;
    }
  }

  // Quy tac 2: khoi 2x2 cung mau
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) diem += 3;
    }
  }

  // Quy tac 3: mau 1:1:3:1:1 de nham voi o dinh vi
  const mau1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const mau2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      let khopNgang1 = true, khopNgang2 = true, khopDoc1 = true, khopDoc2 = true;
      for (let t = 0; t < 11; t++) {
        if (at(i, j + t) !== mau1[t]) khopNgang1 = false;
        if (at(i, j + t) !== mau2[t]) khopNgang2 = false;
        if (at(j + t, i) !== mau1[t]) khopDoc1 = false;
        if (at(j + t, i) !== mau2[t]) khopDoc2 = false;
      }
      if (khopNgang1) diem += 40;
      if (khopNgang2) diem += 40;
      if (khopDoc1) diem += 40;
      if (khopDoc2) diem += 40;
    }
  }

  // Quy tac 4: lech ty le den/trang so voi 50%
  let den = 0;
  for (let i = 0; i < n * n; i++) den += k.o[i]!;
  const lech = Math.abs((den * 100) / (n * n) - 50);
  diem += Math.floor(lech / 5) * 10;

  return diem;
}

/* ------------------------------------------------------------ dau vao chinh */

export interface MaQr {
  size: number;
  /** true = o den */
  modules: boolean[][];
  version: number;
}

/** Ma hoa chuoi thanh ma QR (che do byte, muc sua loi M). */
export function encodeQr(text: string): MaQr {
  const bytes = [...Buffer.from(text, 'utf8')];
  const version = chonPhienBan(bytes.length);
  if (version === null) {
    throw new Error(`Chuoi qua dai cho ma QR phien ban ${PHIEN_BAN_TOI_DA} (${bytes.length} byte)`);
  }

  const [ecMoiKhoi, soKhoi] = EC_M[version - 1]!;
  const khungMau = taoKhung(version);
  const tongTu = Math.floor(soODuLieu(khungMau) / 8);
  const tuDuLieu = tongTu - ecMoiKhoi * soKhoi;

  const dong = new DongBit();
  dong.push(0b0100, 4);                          // che do byte
  dong.push(bytes.length, version <= 9 ? 8 : 16); // so ky tu
  for (const b of bytes) dong.push(b, 8);

  // Ket thuc + dem cho tron byte
  const conLai = tuDuLieu * 8 - dong.length;
  dong.push(0, Math.min(4, conLai));
  if (dong.length % 8 !== 0) dong.push(0, 8 - (dong.length % 8));

  const duLieu = dong.toBytes();
  const dem = [0xec, 0x11];
  for (let i = 0; duLieu.length < tuDuLieu; i++) duLieu.push(dem[i % 2]!);

  const tu = dungChuoiTu(duLieu, version);

  // Thu ca 8 mat na, giu cai co diem phat thap nhat
  let totNhat: Khung | null = null;
  let diemTotNhat = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const k = taoKhung(version);
    raiDuLieu(k, tu);
    apMatNa(k, mask);
    ghiThongTinDinhDang(k, mask);
    const d = diemPhat(k);
    if (d < diemTotNhat) { diemTotNhat = d; totNhat = k; }
  }

  const k = totNhat!;
  const modules: boolean[][] = [];
  for (let r = 0; r < k.size; r++) {
    const hang: boolean[] = [];
    for (let c = 0; c < k.size; c++) hang.push(k.o[r * k.size + c] === 1);
    modules.push(hang);
  }
  return { size: k.size, modules, version };
}

/**
 * Ve ma QR thanh SVG nhung thang vao trang.
 *
 * Gop cac o den thanh mot duong <path> duy nhat cho nhe, va giu vung trang
 * quanh vien (4 o) - thieu vien nay nhieu ung dung quet se khong nhan ra.
 */
export function qrSvg(text: string, opts: { scale?: number; vien?: number; alt?: string } = {}): string {
  const { size, modules } = encodeQr(text);
  const scale = opts.scale ?? 4;
  const vien = opts.vien ?? 4;
  const canh = (size + vien * 2) * scale;

  let duong = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r]![c]) duong += `M${(c + vien) * scale} ${(r + vien) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }

  const nhan = (opts.alt ?? 'Ma QR').replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canh}" height="${canh}" viewBox="0 0 ${canh} ${canh}" role="img" aria-label="${nhan}">` +
    `<rect width="${canh}" height="${canh}" fill="#ffffff"/>` +
    `<path d="${duong}" fill="#000000"/>` +
    `</svg>`
  );
}
