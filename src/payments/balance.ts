/**
 * Thanh toan bang so du vi cua khach hang (dung cho dai ly cap 2 nap tien truoc).
 * Viec tru tien duoc thuc hien trong mot transaction, kem kiem tra so du
 * ngay trong cau UPDATE de khong the tru am du co nhieu request dong thoi.
 */
import { db, nowIso, tx } from '../db/index.js';
import type { CreateContext, CreateResult, PaymentProvider } from './types.js';

export class InsufficientBalance extends Error {
  constructor(readonly balance: number, readonly required: number) {
    super(`So du khong du: can ${required.toLocaleString('vi-VN')}d, hien co ${balance.toLocaleString('vi-VN')}d`);
  }
}

export const balanceProvider: PaymentProvider = {
  id: 'balance',
  label: 'So du tai khoan',
  description: 'Tru truc tiep vao so du kha dung cua tai khoan.',

  isEnabled: () => true,

  async create(ctx: CreateContext): Promise<CreateResult> {
    const ok = debit(ctx.order.user_id, ctx.order.total, `order:${ctx.order.code}`);
    if (!ok) {
      const balance = balanceOf(ctx.order.user_id);
      throw new InsufficientBalance(balance, ctx.order.total);
    }
    return { providerTxn: `WALLET-${ctx.order.id}-${Date.now()}` };
  },
};

export function balanceOf(userId: number): number {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

/** Tru tien. Tra ve false neu khong du so du. */
export function debit(userId: number, amount: number, ref: string, note = ''): boolean {
  return tx((): boolean => {
    const info = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?')
      .run(amount, userId, amount);
    if (!info.changes) return false;
    const after = balanceOf(userId);
    db.prepare(
      `INSERT INTO wallet_transactions (user_id, amount, balance_after, kind, ref, note, created_at)
       VALUES (?, ?, ?, 'order_payment', ?, ?, ?)`,
    ).run(userId, -amount, after, ref, note, nowIso());
    return true;
  });
}

/** Cong tien (nap vi, hoan tien). */
export function credit(userId: number, amount: number, kind: 'topup' | 'refund' | 'adjustment', ref: string, note = ''): number {
  return tx((): number => {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
    const after = balanceOf(userId);
    db.prepare(
      `INSERT INTO wallet_transactions (user_id, amount, balance_after, kind, ref, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, amount, after, kind, ref, note, nowIso());
    return after;
  });
}
