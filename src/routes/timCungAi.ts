/**
 * Tim ten mien cung AI (spec tra-cuu-ai muc 1).
 *
 * POST co CSRF (csrfMiddleware chung): trang khac hay bot khong kich hoat duoc
 * loi goi AI ton tien qua mot duong dan GET. Trang ket qua khong cho lap chi
 * muc (meta + header), robots.txt chan, khong co trong sitemap.
 */
import { Router, type Response } from 'express';
import { wrap } from '../middleware/error.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { settings } from '../lib/settings.js';
import { listTlds } from '../services/pricing.js';
import {
  MO_TA_TOI_DA, THONG_BAO, chuanHoaMoTa, demThongKe, goiYTenMien, trangThaiAi,
  type KetQuaGoiYTenMien,
} from '../services/goiYTenMien.js';

const router = Router();

/** O chon duoi: duoi dang ban, noi bat truoc, toi da 6 cho gon tren dien thoai. */
export function duoiChoChon() {
  const tlds = listTlds({ activeOnly: true });
  return [...tlds.filter((t) => t.is_featured), ...tlds.filter((t) => !t.is_featured)].slice(0, 6);
}

function thongBaoKhiTat(): string {
  const tt = trangThaiAi();
  if (tt === 'san-sang') return '';
  return tt === 'cham-tran' ? THONG_BAO['het-han-muc'] : THONG_BAO.tat;
}

function hienTrang(
  res: Response,
  data: { moTa?: string; duoiChon?: string[]; ketQua?: Extract<KetQuaGoiYTenMien, { loai: 'ok' }> | null; thongBao?: string },
): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.render('tim-cung-ai', {
    title: 'Tìm tên miền cùng AI',
    noindex: true,
    aiBat: trangThaiAi() === 'san-sang',
    duoiCho: duoiChoChon(),
    moTa: '',
    duoiChon: [],
    ketQua: null,
    thongBao: '',
    ...data,
  });
}

router.get('/tim-cung-ai', (_req, res) => {
  hienTrang(res, { thongBao: thongBaoKhiTat() });
});

// Hai lop khoa rieng (phut:/ngay:): khoa mac dinh cua rateLimit theo duong dan,
// hai lop cung duong dan se dung chung mot bo dem.
const demBiChan = () => demThongKe('blocked');

router.post(
  '/tim-cung-ai',
  rateLimit({
    windowMs: 60_000,
    max: () => settings.ai().ratePerMinute,
    key: (req) => `phut:${req.ip ?? 'unknown'}`,
    message: 'Bạn gửi yêu cầu gợi ý quá nhanh. Vui lòng chờ một phút rồi thử lại.',
    onLimit: demBiChan,
  }),
  rateLimit({
    windowMs: 24 * 3600_000,
    max: () => settings.ai().ratePerDay,
    key: (req) => `ngay:${req.ip ?? 'unknown'}`,
    message: 'Bạn đã dùng hết lượt gợi ý bằng AI trong ngày. Bạn vẫn tìm tên miền theo từ khóa được như thường.',
    onLimit: demBiChan,
  }),
  wrap(async (req, res) => {
    const raw = String(req.body?.mo_ta ?? '');
    const duoiRaw: unknown = req.body?.duoi;
    const duoi = (Array.isArray(duoiRaw) ? duoiRaw : duoiRaw ? [duoiRaw] : []).map(String).slice(0, 20);
    // Mo ta chi dien lai trong chinh phan hoi nay de khach sua, khong luu, khong log
    const moTa = [...raw].slice(0, MO_TA_TOI_DA).join('');

    if (trangThaiAi() === 'san-sang' && !chuanHoaMoTa(raw)) {
      res.status(400);
      return hienTrang(res, { moTa, duoiChon: duoi, thongBao: THONG_BAO['khong-hop-le'] });
    }

    const ketQua = await goiYTenMien({ moTa: raw, duoi });
    if (ketQua.loai === 'ok') hienTrang(res, { moTa, duoiChon: duoi, ketQua });
    else hienTrang(res, { moTa, duoiChon: duoi, thongBao: ketQua.thongBao });
  }),
);

export default router;
