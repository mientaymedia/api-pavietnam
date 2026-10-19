/**
 * Noi dung tin Telegram cho quan tri, dung chung cho kenh su kien va webhook
 * (/sodu, /doncho, ket qua /kichhoat). Van ban thuan, ngan, doc tren dien thoai.
 */
import { db } from '../db/index.js';
import { formatVnd } from '../lib/money.js';
import { NUT_KICH_HOAT, guiQuanTri } from '../lib/telegram.js';
import { tomTatChoQuy, type KetQuaKichHoat, type TomTatChoQuy } from './choQuy.js';
import { dangKyKenh, type SuKienDon } from './suKienDon.js';

function khach(userId: number): string {
  const u = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(userId) as { email: string; full_name: string } | undefined;
  return u ? `${u.full_name ? `${u.full_name} ` : ''}<${u.email}>` : `#${userId}`;
}

function tenMienCuaDon(orderId: number): string {
  return (db.prepare('SELECT domain FROM order_items WHERE order_id = ? ORDER BY id').all(orderId) as { domain: string }[])
    .map((r) => r.domain).join(', ');
}

const ngay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : 'chưa rõ');

export function tinChoQuy(t: TomTatChoQuy, dau = 'THIẾU QUỸ ĐẠI LÝ P.A'): string {
  const soDu = t.soDu === null ? `không đọc được (${t.loiSoDu ?? ''})` : formatVnd(t.soDu);
  const ds = t.cho.slice(0, 15).map((d) => `- ${d.order_code}: ${d.domain} (${formatVnd(d.can)})`).join('\n');
  return [
    dau,
    `Cần nạp thêm: ${formatVnd(t.canNap)}`,
    `Số dư hiện tại: ${soDu}`,
    `Đơn chờ (${t.cho.length}), tổng cần ${formatVnd(t.tongCan)}:`,
    ds || '- không có',
    t.cho.length > 15 ? `... và ${t.cho.length - 15} dòng khác` : '',
    'Khách đã trả tiền, đang thấy "đang xử lý". Nạp quỹ xong bấm nút dưới hoặc gõ /kichhoat.',
  ].filter(Boolean).join('\n');
}

export function tinKetQuaKichHoat(kq: KetQuaKichHoat): string {
  if (kq.dangChay) return 'Một lượt kích hoạt khác đang chạy, kết quả sẽ báo sau.';
  if (kq.loiSoDu) return `Không đọc được số dư đại lý: ${kq.loiSoDu}`;
  const dong = kq.ketQua.map((k) => `- ${k.domain} (${k.orderCode}): ${k.ok ? 'đăng ký xong' : 'chưa xong, xem Quản trị'}`).join('\n');
  return [
    kq.ketQua.length ? `Đã chạy ${kq.ketQua.length} dòng:` : 'Không có dòng nào chạy được.',
    dong,
    `Số dư sau: ${kq.soDu === null ? 'không đọc được' : formatVnd(kq.soDu)}`,
    `Còn chờ quỹ: ${kq.conCho}${kq.canNap ? `, cần nạp thêm ${formatVnd(kq.canNap)}` : ''}`,
  ].filter(Boolean).join('\n');
}

async function guiTheoSuKien(e: SuKienDon): Promise<void> {
  switch (e.loai) {
    case 'don_da_thanh_toan':
      await guiQuanTri(`Đơn mới đã thanh toán: ${e.orderCode}\nSố tiền: ${formatVnd(e.soTien ?? 0)}\nKhách: ${khach(e.userId)}\nTên miền: ${tenMienCuaDon(e.orderId)}`);
      return;
    case 'dang_ky_xong':
      await guiQuanTri(`Đăng ký xong: ${e.domain}\nĐơn: ${e.orderCode}\nKhách: ${khach(e.userId)}\nHạn: ${ngay(e.expiresAt)}${e.maPA === '900' ? '\n(CHẾ ĐỘ THỬ: chưa đăng ký thật)' : ''}`);
      return;
    case 'cho_quy':
      await guiQuanTri(tinChoQuy(await tomTatChoQuy()), NUT_KICH_HOAT);
      return;
    case 'can_nguoi_xu_ly':
    case 'sai_ho_so':
      await guiQuanTri([
        e.loai === 'sai_ho_so' ? 'HỒ SƠ CHỦ THỂ CẦN SỬA' : 'ĐƠN CẦN NGƯỜI XỬ LÝ',
        `Tên miền: ${e.domain}`,
        `Đơn: ${e.orderCode}, khách: ${khach(e.userId)}`,
        `Mã P.A: ${e.maPA || 'không có'}`,
        `Chi tiết: ${e.loi ?? ''}`,
        e.maPA === '606' ? 'P.A đã trừ tiền: kiểm trên trang đại lý trước khi thử lại.' : 'Xử lý ở Quản trị, mục Đơn chờ xử lý. Không tự hoàn tiền.',
      ].join('\n'));
  }
}

dangKyKenh('telegram', guiTheoSuKien);
