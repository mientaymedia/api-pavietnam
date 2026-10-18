/**
 * Lay IP that cua khach khi app chay sau Cloudflare Tunnel + Traefik.
 *
 * Traefik ghi de X-Forwarded-For bang IP cua cloudflared (chay mang host), nen
 * neu chi bat `trust proxy` thi moi khach co chung mot IP va gioi han tan suat
 * bi dung chung. IP that nam trong header Cloudflare gan (`CF-Connecting-IP`).
 *
 * Bat bang CLIENT_IP_HEADER=cf-connecting-ip. Chi an toan khi app CHI nhan
 * yeu cau qua Cloudflare (Traefik chan nguon khac), vi header nay khach tu
 * dat duoc neu goi thang vao may chu.
 */
import type { NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';

export function clientIpMiddleware(headerName: string) {
  const name = headerName.trim().toLowerCase();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const raw = req.headers[name];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
    // Chi nhan dung mot dia chi IP hop le; gia tri la thi bo qua, giu nguyen IP proxy
    if (value && isIP(value)) {
      req.headers['x-forwarded-for'] = value;
    } else {
      delete req.headers['x-forwarded-for'];
    }
    next();
  };
}
