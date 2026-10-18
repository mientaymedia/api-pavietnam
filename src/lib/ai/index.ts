/**
 * Chon nha cung cap AI theo cau hinh hien tai (doc lai moi lan goi, doi khoa
 * hay model tren quan tri co hieu luc ngay). Hien chi co OpenAI, chu chot
 * 18/10/2026; them nha cung cap khac thi them tep va re nhanh o day.
 */
import { config } from '../../config.js';
import { settings } from '../settings.js';
import { taoOpenAi } from './openai.js';
import type { NhaCungCapGoiY } from './types.js';

export function layNhaCungCap(): NhaCungCapGoiY {
  const ai = settings.ai();
  return taoOpenAi({
    apiKey: ai.openaiKey,
    model: ai.model,
    reasoningEffort: ai.reasoningEffort,
    timeoutMs: ai.timeoutSec * 1000,
    baseUrl: config.openaiBaseUrl,
  });
}

export { AiError, type KetQuaAi, type NhaCungCapGoiY, type DauVaoGoiY } from './types.js';
export { MAX_TOKEN_RA } from './openai.js';
