import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/index.js';
import { log } from './lib/logger.js';
import { startWorker, stopWorker } from './jobs/worker.js';
import { purgeExpiredSessions } from './middleware/session.js';

migrate();

const app = createApp();
const server = app.listen(config.port, () => {
  log.info('server_started', { port: config.port, url: config.appUrl, env: config.env });
  // eslint-disable-next-line no-console
  console.log(`\n  ${config.appName} dang chay tai ${config.appUrl}\n  Trang quan tri: ${config.appUrl}/admin\n`);
});

if (config.workerDisabled) {
  log.info('worker_disabled_in_web_process', { hint: 'Chay rieng: node dist/jobs/worker.js' });
} else {
  startWorker();
}

const cleanup = setInterval(() => {
  const removed = purgeExpiredSessions();
  if (removed) log.debug('sessions_purged', { removed });
}, 3600_000);
cleanup.unref?.();

function shutdown(signal: string) {
  log.info('shutting_down', { signal });
  stopWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log.error('unhandled_rejection', { reason: String(reason) }));
