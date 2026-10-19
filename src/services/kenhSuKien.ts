/**
 * Cac kenh nhan su kien don hang (xem suKienDon.ts). Nap tep nay la dang ky kenh.
 *
 * Email quan tri: chi cho cac su kien can nguoi lam (cho nap quy, can nguoi xu
 * ly, sai ho so). Don da thanh toan / dang ky xong da co email rieng cho khach.
 */
import { formatVnd } from '../lib/money.js';
import { alertAdmin } from './notifications.js';
import { dangKyKenh, type SuKienDon } from './suKienDon.js';
import { tomTatChoQuy } from './choQuy.js';
// Cac kenh khac tu dang ky khi nap tep cua chung
import './tinTelegram.js';
import './dayCrm.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function emailQuanTri(e: SuKienDon): Promise<void> {
  if (e.loai === 'cho_quy') {
    const t = await tomTatChoQuy();
    const dong = t.cho.map((d) => `<li>${esc(d.order_code)}: ${esc(d.domain)} (${formatVnd(d.can)})</li>`).join('');
    await alertAdmin(
      `Thiếu quỹ đại lý P.A, cần nạp ${formatVnd(t.canNap)}`,
      `<p>Tên miền <b>${esc(e.domain)}</b> (đơn ${esc(e.orderCode)}) chưa đăng ký được vì số dư đại lý không đủ.
        Khách đã thanh toán và đang thấy đơn "đang xử lý"; hệ thống KHÔNG hoàn tiền.</p>
       <p>Số dư hiện tại: <b>${t.soDu === null ? esc(t.loiSoDu ?? 'không đọc được') : formatVnd(t.soDu)}</b>.
        Tổng cần cho các đơn chờ: <b>${formatVnd(t.tongCan)}</b>. Cần nạp thêm ít nhất <b>${formatVnd(t.canNap)}</b>.</p>
       <ul>${dong}</ul>
       <p>Nạp quỹ xong, hệ thống tự đăng ký trong vòng 5 phút (hoặc bấm kích hoạt ở Quản trị, mục Đơn chờ xử lý).</p>`,
    );
    return;
  }
  if (e.loai === 'can_nguoi_xu_ly' || e.loai === 'sai_ho_so') {
    await alertAdmin(
      e.loai === 'sai_ho_so' ? `Hồ sơ chủ thể cần sửa: ${e.domain}` : `Đơn cần người xử lý: ${e.domain}`,
      `<p>Đơn <b>${esc(e.orderCode)}</b>, tên miền <b>${esc(e.domain)}</b> đang được giữ, không tự hoàn tiền.</p>
       <p>Mã P.A: <b>${esc(e.maPA || 'không có')}</b><br>Chi tiết: ${esc(e.loi)}</p>
       <p>${e.loai === 'sai_ho_so'
         ? 'Sửa hồ sơ chủ thể của khách rồi bấm "Thử lại" ở Quản trị, mục Đơn chờ xử lý.'
         : 'Kiểm tra trên trang đại lý P.A trước (606: P.A đã trừ tiền), rồi bấm "Thử lại" hoặc "Đánh dấu thất bại" ở Quản trị, mục Đơn chờ xử lý.'}</p>`,
    );
  }
}

dangKyKenh('email_quan_tri', emailQuanTri);
