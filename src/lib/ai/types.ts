/**
 * Hop dong chung cho nha cung cap AI goi y ten mien.
 *
 * Dich vu (services/goiYTenMien.ts) chi biet giao dien nay: doi OpenAI sang nha
 * cung cap khac chi can them mot tep cai dat NhaCungCapGoiY va doi layNhaCungCap().
 */

export interface DauVaoGoiY {
  /** Mo ta cua khach, da gop khoang trang va kiem do dai. KHONG ghi log. */
  moTa: string;
  /** So ten muon nhan. Nha cung cap co the tra nhieu hoac it hon, dich vu tu cat. */
  soTen: number;
}

export interface KetQuaAi {
  goiY: { ten: string; lyDo: string }[];
  tokenVao: number;
  tokenRa: number;
}

export interface NhaCungCapGoiY {
  readonly ten: string;
  goiY(dauVao: DauVaoGoiY): Promise<KetQuaAi>;
}

/**
 * - timeout: het thoi gian cho (yeu cau co the da toi nha cung cap va bi tinh tien)
 * - mang: khong ket noi duoc
 * - het-tien: tai khoan het han muc / so du
 * - http: loi HTTP khac (khoa sai, model sai, qua tai)
 * - tu-choi: model tu choi tra loi
 * - dinh-dang: tra loi khong dung JSON da hen
 */
export type MaLoiAi = 'timeout' | 'mang' | 'het-tien' | 'http' | 'tu-choi' | 'dinh-dang';

export class AiError extends Error {
  constructor(
    readonly ma: MaLoiAi,
    message: string,
    /** Co khi da co usage (loi dinh dang sau khi model tra loi): van phai cong chi phi. */
    readonly tokenVao?: number,
    readonly tokenRa?: number,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
