/**
 * Chuyen danh sach tinh thanh va phuong xa cua P.A (tep Excel kem tai lieu API)
 * thanh src/data/dia-gioi-pa.json.
 *
 *   node scripts/chuyen-dia-gioi-xlsx.mjs <Tinh_thanh_Viet_Nam.xlsx> <Phuong_xa_Viet_Nam.xlsx> [tep-ra.json]
 *
 * Vi sao can: P.A tu choi ownerProvince / ownerWard khong DUNG CHU theo hai tep
 * nay (ma loi 6020 den 6025), nen form phai cho khach chon tu chinh danh sach do.
 *
 * Doc xlsx bang zlib co san cua Node (xlsx la tep zip chua XML), khong them thu
 * vien: chi can bang chuoi dung chung va trang tinh dau tien. Tep vao chi duoc
 * DOC, khong chay gi trong do.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lay noi dung cac tep trong zip theo ten (doc thu muc trung tam o cuoi tep). */
function docZip(buf) {
  // Ban ghi "end of central directory" nam trong 64 KB cuoi
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Không phải tệp zip/xlsx hợp lệ');
  const soMuc = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const tep = new Map();
  for (let n = 0; n < soMuc; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Thư mục zip hỏng');
    const cachNen = buf.readUInt16LE(p + 10);
    const coNen = buf.readUInt32LE(p + 20);
    const dTen = buf.readUInt16LE(p + 28);
    const dThem = buf.readUInt16LE(p + 30);
    const dGhiChu = buf.readUInt16LE(p + 32);
    const viTri = buf.readUInt32LE(p + 42);
    const ten = buf.toString('utf8', p + 46, p + 46 + dTen);
    // Phan dau cuc bo co do dai rieng cho ten va truong them
    const batDau = viTri + 30 + buf.readUInt16LE(viTri + 26) + buf.readUInt16LE(viTri + 28);
    const du = buf.subarray(batDau, batDau + coNen);
    tep.set(ten, () => (cachNen === 0 ? du : inflateRawSync(du)).toString('utf8'));
    p += 46 + dTen + dThem + dGhiChu;
  }
  return tep;
}

function giaiXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Cac dong cua trang tinh dau tien, moi dong la { A: '...', B: '...' }. */
function docTrangTinh(tepXlsx) {
  const zip = docZip(readFileSync(tepXlsx));
  const chung = zip.has('xl/sharedStrings.xml')
    ? [...zip.get('xl/sharedStrings.xml')().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        giaiXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    : [];
  const ten = zip.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...zip.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k));
  if (!ten) throw new Error(`Không thấy trang tính trong ${tepXlsx}`);

  const dong = [];
  for (const r of zip.get(ten)().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const o = {};
    for (const c of r[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cot = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if (!cot) continue;
      const kieu = /t="([^"]+)"/.exec(c[1])?.[1] ?? '';
      const trong = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(trong)?.[1];
      let giaTri = '';
      if (kieu === 's' && v !== undefined) giaTri = chung[Number(v)] ?? '';
      else if (kieu === 'inlineStr') giaTri = giaiXml([...trong.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (v !== undefined) giaTri = giaiXml(v);
      o[cot] = giaTri.normalize('NFC').replace(/\s+/g, ' ').trim();
    }
    dong.push(o);
  }
  return dong;
}

/** Bo dong tieu de: dong ma cot ma so khong phai so. */
const laSo = (s) => /^\d+$/.test(String(s ?? ''));

export function chuyen(tepTinh, tepPhuong) {
  const tinh = docTrangTinh(tepTinh)
    .filter((d) => laSo(d.A) && d.B)
    .map((d) => ({ id: Number(d.A), ten: d.B, phuong: [] }));
  const theoId = new Map(tinh.map((t) => [t.id, t]));

  let boQua = 0;
  for (const d of docTrangTinh(tepPhuong)) {
    if (!laSo(d.A) || !d.B || !laSo(d.C)) continue;
    const t = theoId.get(Number(d.C));
    if (!t) { boQua++; continue; }
    t.phuong.push({ id: Number(d.A), ten: d.B });
  }
  for (const t of tinh) t.phuong.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  // Giu thu tu tinh nhu tep cua P.A (Bac vao Nam), quen mat hon thu tu chu cai
  return { tinh, boQua };
}

const chayTrucTiep = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (chayTrucTiep) {
  const [tepTinh, tepPhuong, tepRa = path.join(root, 'src', 'data', 'dia-gioi-pa.json')] = process.argv.slice(2);
  if (!tepTinh || !tepPhuong) {
    console.error('Cách dùng: node scripts/chuyen-dia-gioi-xlsx.mjs <Tinh_thanh_Viet_Nam.xlsx> <Phuong_xa_Viet_Nam.xlsx> [tệp ra]');
    process.exit(2);
  }
  const { tinh, boQua } = chuyen(tepTinh, tepPhuong);
  const soPhuong = tinh.reduce((n, t) => n + t.phuong.length, 0);
  if (!tinh.length || !soPhuong) {
    console.error('Không đọc được tỉnh hoặc phường xã nào, không ghi tệp.');
    process.exit(1);
  }
  const duLieu = {
    nguon: `${path.basename(tepTinh)}, ${path.basename(tepPhuong)} (tài liệu API P.A)`,
    cap_nhat: new Date().toISOString().slice(0, 10),
    tinh,
  };
  writeFileSync(tepRa, `${JSON.stringify(duLieu)}\n`, 'utf8');
  console.log(`Đã ghi ${tepRa}: ${tinh.length} tỉnh thành, ${soPhuong} phường xã${boQua ? `, bỏ qua ${boQua} dòng không khớp tỉnh` : ''}.`);
}
