import { logSafeError } from './safe-error';

let installed = false;
export function installProcessMonitoring(): void {
  if (installed) return;
  installed = true;
  // Observe without swallowing crashes or changing Node's default exit policy.
  // Node 24's default rejection mode also reaches this monitor for unhandled rejections.
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logSafeError(origin === 'unhandledRejection' ? 'unhandled-rejection' : 'uncaught-exception', error, 'process');
  });
}
