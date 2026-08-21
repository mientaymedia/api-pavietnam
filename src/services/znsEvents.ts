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
    label: 'Don hang moi - cho thanh toan',
    params: ['order_code', 'amount', 'domain'],
    sample: 'Don hang <order_code> cho ten mien <domain> tri gia <amount> dang cho thanh toan.',
  },
  payment_received: {
    settingKey: 'zns.tpl.payment_received',
    label: 'Da nhan thanh toan',
    params: ['order_code', 'amount'],
    sample: 'Da nhan thanh toan <amount> cho don <order_code>. He thong dang kich hoat ten mien.',
  },
  domain_activated: {
    settingKey: 'zns.tpl.domain_activated',
    label: 'Ten mien da kich hoat',
    params: ['domain', 'expires_at'],
    sample: 'Ten mien <domain> da kich hoat, su dung den <expires_at>.',
  },
  renewal_reminder: {
    settingKey: 'zns.tpl.renewal_reminder',
    label: 'Nhac gia han ten mien',
    params: ['domain', 'expires_at', 'days_left'],
    sample: 'Ten mien <domain> se het han ngay <expires_at>, con <days_left> ngay.',
  },
  auto_renew_charged: {
    settingKey: 'zns.tpl.auto_renew_charged',
    label: 'Da tu dong gia han',
    params: ['domain', 'amount', 'expires_at'],
    sample: 'Da tu dong gia han <domain>, tru <amount>. Han moi: <expires_at>.',
  },
  provision_failed: {
    settingKey: 'zns.tpl.provision_failed',
    label: 'Dang ky ten mien that bai',
    params: ['domain', 'order_code'],
    sample: 'Dang ky <domain> (don <order_code>) chua hoan tat. Bo phan ky thuat dang xu ly.',
  },
} as const satisfies Record<string, ZnsEventSpec>;

export type ZnsEvent = keyof typeof ZNS_EVENTS;

export const ZNS_EVENT_LIST: (ZnsEventSpec & { event: ZnsEvent })[] = (
  Object.entries(ZNS_EVENTS) as [ZnsEvent, ZnsEventSpec][]
).map(([event, spec]) => ({ event, ...spec }));
