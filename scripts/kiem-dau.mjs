/**
 * Quet chu hien thi con thieu dau tieng Viet, va loi ma hoa (NFD, BOM, khong
 * phai UTF-8) trong ma nguon.
 *
 *   node scripts/kiem-dau.mjs                    # quet toan bo pham vi
 *   node scripts/kiem-dau.mjs src/views/auth ... # chi quet tep/thu muc chi ra
 *   node scripts/kiem-dau.mjs --bao-cao          # in ket qua nhung thoat 0
 *   curl ... | node scripts/kiem-dau.mjs --html  # quet HTML doc tu stdin
 *
 * Chi doc chuoi ky tu (qua trinh phan tich cu phap cua typescript) va chu
 * trong EJS, khong doc chu thich: chu thich, ten bien nam ngoai pham vi.
 * Danh sach cho phep o kiem-dau.cho-phep.json, khop theo tep + chuoi con
 * (khong theo so dong de khong vo khi dong xe dich).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

// Tu chi xuat hien khi chu bi thieu dau. Tu ngan de trung tieng Anh xu ly rieng.
const TU_DIEN = [
  'khong', 'duoc', 'dang ky', 'dang nhap', 'ten mien', 'thanh toan', 'vui long', 'tai khoan',
  'mat khau', 'gio hang', 'don hang', 'chua', 'nhap', 'quan tri', 'cua', 'nguoi', 'thong tin',
  'thong bao', 'cau hinh', 'gia han', 'het han', 'kich hoat', 'xac nhan', 'xac thuc', 'huy',
  'loi', 'thu lai', 'that bai', 'thanh cong', 'tim kiem', 'kiem tra', 'so du', 'hoan tien',
  'chuyen khoan', 'ngan hang', 'dia chi', 'dien thoai', 'mien phi', 'nam', 'ngay', 'gio', 'phut',
  'tiep tuc', 'quay lai', 'luu', 'xoa', 'sua', 'them', 'tra cuu', 'bang gia', 'ho tro', 'lien he',
  'chu the', 'ma so thue', 'khoa', 'mo khoa', 'da', 'dang', 'se', 'voi', 'cho', 'tu dong',
  'hien tai', 'toi thieu', 'toi da',
];
// Chi tinh khi chuoi co tu 2 tu tro len va khong co chu cai mang dau nao.
const TU_NGAN = new Set(['da', 'se', 'cho', 'nam', 'ngay']); // 'ngay' con la tu dung (lam ngay)
const CO_DAU = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const MAU_TU = TU_DIEN.map((tu) => ({
  tu,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${tu.replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'),
}));
// Tu dien tren chi bat duoc cau co tu "dac trung". Them luat thu hai cho nhan
// ngan nhu "Ca nhan", "Tong quan", "Hang doi": chuoi khong co dau nao ma tu
// mot nua so tu tro len (toi thieu 2 tu) la am tiet tieng Viet viet ASCII.
const AM_TIET = new Set(`
  ban bao bat buoc cac can cao cau chi chieu chinh chuc chung chuyen co con cong cu cua cuu
  danh dau den deu dich dien doanh doi don dong du dung duoi duoc gan gia gian gio gui hai han
  hang hanh hieu hinh hoan hoat hop huong huy huyen kem ket khach khau khoa khoan khong kich
  kinh ky lam lan lap le lich lien loai loc loi luc luu mat may mien moi mot muc nay neu ngay
  nghiep nguoi nhan nhanh nhap nhat nhieu nhom nhung phai phan phien pho phu phut qua quan quay
  quoc sach sau soat sua tai tat thai thang thanh that the theo thoat thoi thong thu thuc thue
  tiep tien tiet tim tin tinh toan toi tong tra trang tren tro truc truoc tu tuc tuyen vao viec
  viet voi vui xac xem xoa xu xuat
`.trim().split(/\s+/));

// Kieu dau cu (dau dat o nguyen am thu hai): chu da chon kieu moi "khóa, hủy,
// tùy, hóa, thỏa" (spec muc 10, D2). "qu" + y la phu am + nguyen am nen bo qua.
const KIEU_CU = /(?<!q)(?:o[áàảãạ]|o[éèẻẽẹ]|u[ýỳỷỹỵ])(?!\p{L})/iu;

// Ngoai pham vi theo intent muc 4 / C6: man hinh dong lenh cho nguoi van hanh.
const BO_QUA_TEP = new Set(['src/preflight.ts', 'src/pavietnam/probe.ts', 'src/server.ts']);
const DUOI_VAN_BAN = new Set(['.ts', '.ejs', '.js', '.mjs', '.css', '.json', '.sql']);

function timLoi(goc) {
  // Bo duong dan URL va chu noi gach (/tai-khoan, ten-mien-cua-ban.vn): la
  // chuoi may doc, giu khong dau theo spec 3.4.
  const chuoi = goc
    .replace(/(?:https?:\/\/[^\s"'<>]*|\/[A-Za-z0-9_.:?=&%{}$/-]+)/g, ' ')
    .replace(/(?<![\p{L}\p{N}])[a-z0-9]+(?:-[a-z0-9]+)+(?:\.[a-z0-9.]+)?(?![\p{L}\p{N}])/gu, ' ');
  const soTu = chuoi.trim().split(/\s+/).filter(Boolean).length;
  const coDau = CO_DAU.test(chuoi);
  const tu = [];
  for (const { tu: w, re } of MAU_TU) {
    if (TU_NGAN.has(w) && (soTu < 2 || coDau)) continue;
    if (re.test(chuoi)) tu.push(w);
  }
  if (!tu.length && !coDau) {
    const cacTu = chuoi.toLowerCase().match(/\p{L}+/gu) ?? [];
    const trung = cacTu.filter((w) => AM_TIET.has(w)).length;
    if (cacTu.length >= 2 && trung >= 2 && trung * 2 >= cacTu.length) tu.push('câu không dấu');
  }
  if (KIEU_CU.test(chuoi)) tu.push('kiểu dấu cũ: ' + chuoi.match(KIEU_CU)[0]);
  return tu;
}

/** Chuoi khong co khoang trang va khong viet hoa chu dau: dinh danh, khoa, ma. */
function laDinhDanh(s) {
  return !/\s/.test(s) && !/^\p{Lu}/u.test(s);
}

function dongCua(text, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// ---------- TypeScript / JavaScript ----------
function quetMa(tep, text, ketQua) {
  const kind = tep.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(tep, text, ts.ScriptTarget.Latest, true, kind);
  const laSeed = tep === 'src/db/seed.ts';

  const boQuaGoi = (node) => {
    // Doi so dau cua log.*(...) la khoa log may doc; console.* cua seed la dong lenh.
    const p = node.parent;
    if (!p || !ts.isCallExpression(p)) return false;
    const e = p.expression;
    if (!ts.isPropertyAccessExpression(e) || !ts.isIdentifier(e.expression)) return false;
    if (e.expression.text === 'log' && p.arguments[0] === node) return true;
    if (laSeed && e.expression.text === 'console') return true;
    return false;
  };

  const ghi = (node, s) => {
    if (!s.trim() || laDinhDanh(s)) return;
    const tu = timLoi(s);
    if (tu.length) ketQua.push({ tep, dong: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, chuoi: s, tu });
  };

  const duyet = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!boQuaGoi(node)) ghi(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      // Bo qua ca template neu la doi so log/console nhu tren.
      if (!boQuaGoi(node)) {
        ghi(node.head, node.head.text);
        for (const span of node.templateSpans) ghi(span.literal, span.literal.text);
      }
      node.templateSpans.forEach((span) => duyet(span.expression));
      return;
    }
    ts.forEachChild(node, duyet);
  };
  duyet(sf);
}

// ---------- EJS ----------
const THUOC_TINH = /\s(placeholder|title|aria-label|alt|data-confirm)="([^"]*)"/g;

function quetEjs(tep, text, ketQua) {
  // Che khoi <% %> bang khoang trang (giu xuong dong) de phan HTML con lai van
  // dung vi tri; dong thoi lay chuoi trong nhay ben trong khoi ma.
  let ngoai = '';
  let i = 0;
  while (i < text.length) {
    const mo = text.indexOf('<%', i);
    if (mo < 0) { ngoai += text.slice(i); break; }
    const dong = text.indexOf('%>', mo + 2);
    const het = dong < 0 ? text.length : dong + 2;
    ngoai += text.slice(i, mo);
    const khoi = text.slice(mo, het);
    ngoai += khoi.replace(/[^\n]/g, ' ');
    if (!khoi.startsWith('<%#')) {
      for (const m of khoi.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
        const s = m[1] ?? m[2];
        if (!s.trim() || laDinhDanh(s)) continue;
        const tu = timLoi(s);
        if (tu.length) ketQua.push({ tep, dong: dongCua(text, mo + m.index), chuoi: s, tu });
      }
    }
    i = het;
  }

  // Thuoc tinh nguoi dung doc duoc.
  for (const m of ngoai.matchAll(THUOC_TINH)) {
    const s = m[2];
    const tu = s.trim() ? timLoi(s) : [];
    if (tu.length) ketQua.push({ tep, dong: dongCua(ngoai, m.index), chuoi: s, tu });
  }
  // Chu giua cac the (bo qua noi dung <script>/<style> neu co).
  const khongThe = ngoai.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (s) => s.replace(/[^\n]/g, ' '));
  for (const m of khongThe.matchAll(/(?<=^|>)([^<>]+)(?=<|$)/g)) {
    const s = m[1].replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const tu = timLoi(s);
    if (tu.length) {
      const lech = m[1].search(/\S/);
      ketQua.push({ tep, dong: dongCua(khongThe, m.index + lech), chuoi: s, tu });
    }
  }
}

// ---------- HTML tu stdin (kiem trang that, B12) ----------
function quetHtml(text, ketQua) {
  const sach = text
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  for (const m of sach.matchAll(THUOC_TINH)) {
    const tu = timLoi(m[2]);
    if (tu.length) ketQua.push({ tep: '<stdin>', dong: dongCua(sach, m.index), chuoi: m[2], tu });
  }
  for (const m of sach.matchAll(/(?<=^|>)([^<>]+)(?=<|$)/g)) {
    const s = m[1].replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const tu = timLoi(s);
    if (tu.length) ketQua.push({ tep: '<stdin>', dong: dongCua(sach, m.index), chuoi: s, tu });
  }
}

// ---------- Ma hoa ----------
const giaiMa = new TextDecoder('utf-8', { fatal: true });

function kiemMaHoa(tep, buf, loi) {
  let text;
  try {
    text = giaiMa.decode(buf);
  } catch {
    loi.push(`${tep}: không phải UTF-8 hợp lệ`);
    return null;
  }
  if (text.charCodeAt(0) === 0xfeff) loi.push(`${tep}: có BOM ở đầu tệp`);
  const nfd = text.search(/[\u0300-\u036f]/);
  if (nfd >= 0) loi.push(`${tep}:${dongCua(text, nfd)}: có dấu tổ hợp (NFD)`);
  else if (text !== text.normalize('NFC')) loi.push(`${tep}: chưa ở dạng NFC`);
  return text.replace(/^\ufeff/, '');
}

function lietKe(p, ra) {
  if (!existsSync(p)) throw new Error(`Không tìm thấy: ${p}`);
  if (statSync(p).isDirectory()) {
    for (const ten of readdirSync(p).sort()) {
      if (ten === 'node_modules' || ten.startsWith('.')) continue;
      lietKe(path.join(p, ten), ra);
    }
  } else if (DUOI_VAN_BAN.has(path.extname(p))) {
    ra.push(p);
  }
  return ra;
}

/** Tep co chu hien thi can quet tu dien (cac tep khac chi kiem ma hoa). */
function trongPhamVi(tep) {
  if (BO_QUA_TEP.has(tep)) return false;
  if (tep.startsWith('src/') && (tep.endsWith('.ts') || tep.endsWith('.ejs'))) return true;
  return tep === 'public/js/app.js';
}

function docChoPhep() {
  const p = path.join(root, 'scripts/kiem-dau.cho-phep.json');
  return JSON.parse(readFileSync(p, 'utf8')).map((m) => ({ ...m, dung: 0 }));
}

// ---------- Chay ----------
const args = process.argv.slice(2);
const baoCao = args.includes('--bao-cao');
const cheDoHtml = args.includes('--html');
const duongDan = args.filter((a) => !a.startsWith('--'));

const ketQua = [];
const loiMaHoa = [];

if (cheDoHtml) {
  const buf = readFileSync(0);
  const text = kiemMaHoa('<stdin>', buf, loiMaHoa);
  if (text !== null) quetHtml(text, ketQua);
} else {
  const goc = duongDan.length ? duongDan : ['src', 'public', 'test', 'scripts'];
  const tep = [...new Set(goc.flatMap((g) => lietKe(path.resolve(root, g), [])))];
  for (const abs of tep) {
    const r = rel(abs);
    const text = kiemMaHoa(r, readFileSync(abs), loiMaHoa);
    if (text === null || !trongPhamVi(r)) continue;
    if (r.endsWith('.ejs')) quetEjs(r, text, ketQua);
    else quetMa(r, text, ketQua);
  }
}

const choPhep = docChoPhep();
const conLai = ketQua.filter((k) => {
  const m = choPhep.find((c) => c.tep === k.tep && k.chuoi.includes(c.chua));
  if (m) { m.dung++; return false; }
  return true;
});

for (const k of conLai) {
  console.log(`${k.tep}:${k.dong}: ${JSON.stringify(k.chuoi)}  [từ: ${k.tu.join(', ')}]`);
}
for (const l of loiMaHoa) console.log(`MÃ HÓA ${l}`);

// Muc thua chi bao khi quet toan bo, vi quet mot phan thi dung la nhieu muc khong khop.
const thua = !cheDoHtml && duongDan.length === 0 ? choPhep.filter((c) => c.dung === 0) : [];
for (const c of thua) console.log(`MỤC THỪA trong kiem-dau.cho-phep.json: ${c.tep} ${JSON.stringify(c.chua)}`);

const tepCoLoi = new Set(conLai.map((k) => k.tep)).size;
console.log(
  `Tổng: ${conLai.length} chuỗi thiếu dấu trên ${tepCoLoi} tệp, ` +
    `${loiMaHoa.length} lỗi mã hóa, ${thua.length} mục thừa, ` +
    `${ketQua.length - conLai.length} chuỗi được cho phép.`,
);
const coLoi = conLai.length + loiMaHoa.length + thua.length > 0;
process.exit(coLoi && !baoCao ? 1 : 0);
