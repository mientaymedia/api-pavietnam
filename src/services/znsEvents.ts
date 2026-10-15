/**
 * Cac su kien duoc gui qua ZNS, kem tham so cua tung mau tin.
 *
 * ZNS chi gui duoc mau tin DA DUOC ZALO DUYET. Ban tao mau tai
 * https://business.zalo.me roi dan template ID vao _Cau hinh Control Panel_.
 *
 * Bang duoi day la "hop dong" giua he thong va mau tin: khi tao mau ben Zalo,
 * dat ten tham so DUNG NHU cot `params` thi he thong dien du lieu tu dong.
 * Sai ten tham so -> Zalo tra loi -213 (du lieu khong khop cau truc mau).
 */

export interface ZnsEventSpec {
  /** Khoa cau hinh chua template ID trong bang settings. */
  settingKey: string;
  label: string;
  /** Ten tham so mau tin can khai bao ben Zalo. */
  params: string[];
  /** Vi du noi dung mau, de ban soan cho nhanh. */
  sample: string;
}

export const ZNS_EVENTS = {
  order_created: {
    settingKey: 'zns.tpl.order_created',
    label: 'Đơn hàng mới - chờ thanh toán',
    params: ['order_code', 'amount', 'domain'],
    sample: 'Đơn hàng <order_code> cho tên miền <domain> trị giá <amount> đang chờ thanh toán.',
  },
  payment_received: {
    settingKey: 'zns.tpl.payment_received',
    label: 'Đã nhận thanh toán',
    params: ['order_code', 'amount'],
    sample: 'Đã nhận thanh toán <amount> cho đơn <order_code>. Hệ thống đang kích hoạt tên miền.',
  },
  domain_activated: {
    settingKey: 'zns.tpl.domain_activated',
    label: 'Tên miền đã kích hoạt',
    params: ['domain', 'expires_at'],
    sample: 'Tên miền <domain> đã kích hoạt, sử dụng đến <expires_at>.',
  },
  renewal_reminder: {
    settingKey: 'zns.tpl.renewal_reminder',
    label: 'Nhắc gia hạn tên miền',
    params: ['domain', 'expires_at', 'days_left'],
    sample: 'Tên miền <domain> sẽ hết hạn ngày <expires_at>, còn <days_left> ngày.',
  },
  auto_renew_charged: {
    settingKey: 'zns.tpl.auto_renew_charged',
    label: 'Đã tự động gia hạn',
    params: ['domain', 'amount', 'expires_at'],
    sample: 'Đã tự động gia hạn <domain>, trừ <amount>. Hạn mới: <expires_at>.',
  },
  provision_failed: {
    settingKey: 'zns.tpl.provision_failed',
    label: 'Đăng ký tên miền thất bại',
    params: ['domain', 'order_code'],
    sample: 'Đăng ký <domain> (đơn <order_code>) chưa hoàn tất. Bộ phận kỹ thuật đang xử lý.',
  },
} as const satisfies Record<string, ZnsEventSpec>;

export type ZnsEvent = keyof typeof ZNS_EVENTS;

export const ZNS_EVENT_LIST: (ZnsEventSpec & { event: ZnsEvent })[] = (
  Object.entries(ZNS_EVENTS) as [ZnsEvent, ZnsEventSpec][]
).map(([event, spec]) => ({ event, ...spec }));
