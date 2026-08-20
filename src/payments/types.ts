import type { Order } from '../services/orders.js';

export type ProviderId = 'sepay' | 'momo' | 'zalopay' | 'balance' | 'manual';

export interface PaymentRow {
  id: number;
  order_id: number;
  user_id: number;
  provider: ProviderId;
  ref_code: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  provider_txn: string;
  pay_url: string;
  qr_url: string;
  expires_at: string | null;
  created_at: string;
}

export interface CreateContext {
  order: Order;
  /** Ma tham chieu dung lam noi dung chuyen khoan / orderId gui cong thanh toan. */
  refCode: string;
  clientIp: string;
  returnUrl: string;
  ipnUrl: string;
}

export interface CreateResult {
  /** Chuyen huong khach sang trang thanh toan cua cong. */
  payUrl?: string;
  /** Anh QR (chuyen khoan ngan hang). */
  qrUrl?: string;
  providerTxn?: string;
  requestBody?: string;
  responseBody?: string;
  /** Huong dan hien thi cho khach (chuyen khoan thu cong). */
  instructions?: { label: string; value: string; copyable?: boolean }[];
}

export interface VerifyResult {
  ok: boolean;
  /** Ma tham chieu don hang doc duoc tu du lieu cong thanh toan gui ve. */
  refCode: string;
  amount: number;
  providerTxn: string;
  message: string;
  /** Noi dung tra ve cho cong thanh toan (IPN). */
  ack?: unknown;
}

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  description: string;
  isEnabled(): boolean;
  create(ctx: CreateContext): Promise<CreateResult>;
  /** Xac thuc du lieu khach quay ve tu cong thanh toan (redirect). */
  verifyReturn?(query: Record<string, string>): VerifyResult;
  /** Xac thuc thong bao server-to-server (IPN/webhook). */
  verifyIpn?(body: unknown, headers: Record<string, string | undefined>): VerifyResult;
}

export class PaymentError extends Error {}
