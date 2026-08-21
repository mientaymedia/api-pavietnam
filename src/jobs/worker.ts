/**
 * Worker xu ly hang doi - chay trong cung tien trinh web (don gian khi trien khai)
 * hoac tach rieng bang `node dist/jobs/worker.js` neu luu luong lon.
 */
import { log } from '../lib/logger.js';
import { claimNext, completeJob, enqueue, failJob, requeueStuckJobs } from './queue.js';
import { handlers, RECURRING } from './handlers.js';
import { migrate } from '../db/index.js';

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

const POLL_MS = 2_000;

async function drain(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    for (let i = 0; i < 20; i++) {
      const job = claimNext();
      if (!job) break;

      const handler = handlers[job.type];
      if (!handler) {
        failJob(job, `Khong co handler cho job "${job.type}"`);
        continue;
      }

      try {
        await handler(JSON.parse(job.payload) as Record<string, unknown>);
        completeJob(job.id);
        log.debug('job_done', { id: job.id, type: job.type });
      } catch (err) {
        failJob(job, err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    running = false;
  }
}

/** Dat lich cac job dinh ky (chi them neu chua co job cung loai dang cho). */
function scheduleRecurring(): void {
  for (const { type, everyMs } of RECURRING) {
    enqueue(type, {}, { dedupeKey: `recurring:${type}`, delayMs: Math.floor(Math.random() * everyMs), maxAttempts: 3 });
  }
}

export function startWorker(): void {
  if (timer) return;
  stopped = false;

  requeueStuckJobs();
  scheduleRecurring();

  timer = setInterval(() => {
    void drain();
  }, POLL_MS);
  timer.unref?.();

  // Lap lai lich dinh ky va giai phong job ket
  const housekeeping = setInterval(() => {
    requeueStuckJobs();
    scheduleRecurring();
  }, 10 * 60_000);
  housekeeping.unref?.();

  log.info('worker_started', { pollMs: POLL_MS });
}

export function stopWorker(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}

/** Chay 1 vong ngay lap tuc - dung sau khi ghi nhan thanh toan de kich hoat nhanh. */
export function kickWorker(): void {
  void drain();
}

/**
 * Cho phep chay worker nhu mot tien trinh doc lap:
 *
 *     node dist/jobs/worker.js
 *
 * Khi do dat WORKER_DISABLED=1 cho tien trinh web de hai ben khong tranh job.
 */
const runDirectly = process.argv[1] !== undefined && /jobs[/\\]worker\.(ts|js)$/.test(process.argv[1]);
if (runDirectly) {
  migrate();
  startWorker();
  log.info('worker_process_started', {});

  const shutdown = (signal: string) => {
    log.info('worker_shutting_down', { signal });
    stopWorker();
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
