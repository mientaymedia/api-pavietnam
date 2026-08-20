/**
 * Tien te: LUON luu bang so nguyen VND (dong). Khong dung so thuc de tranh sai lech.
 */

export function toVnd(n: number): number {
  return Math.round(Number(n) || 0);
}

export function formatVnd(n: number): string {
  return `${toVnd(n).toLocaleString('vi-VN')} d`;
}

/** Lam tron len boi so (vd 1.000d) cho gia ban le. */
export function roundUpTo(value: number, step: number): number {
  if (step <= 0) return toVnd(value);
  return Math.ceil(toVnd(value) / step) * step;
}

/** Ap dung VAT theo phan tram (vd 10 => +10%). */
export function withVat(amount: number, vatPercent: number): number {
  return toVnd(amount + (amount * vatPercent) / 100);
}
