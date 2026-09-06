import { checkReadiness } from './health.service';
import { CRMScheduler } from './crm/scheduler.service';
import { DeductionQueueService } from './inventory/deduction-queue.service';
import { monitoringMetrics, MonitoringMetrics } from '../lib/monitoring-metrics';
import { logStructured } from '../lib/safe-error';

// One in-flight operation per probe, even when Redis stalls across repeated polls.
export function boundedProbe<T>(action: () => Promise<T>, timeoutMs = 2_000): () => Promise<T | null> {
  let pending: Promise<T> | undefined;
  return async () => {
    pending ??= Promise.resolve().then(action).finally(() => { pending = undefined; });
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
    } catch { return null; } finally { clearTimeout(timer); }
  };
}
const probes = {
  readiness: boundedProbe(() => checkReadiness()),
  crm: boundedProbe(() => CRMScheduler.getStatus()),
  inventory: boundedProbe(() => DeductionQueueService.getStatus()),
};
const count = (value: number): number => Number.isFinite(value) && value >= 0 ? value : 0;

export function alertConditions(
  readiness: Awaited<ReturnType<typeof checkReadiness>> | null,
  crm: { deadLetter: number } | null, inventory: { deadLetter: number } | null,
  recent: ReturnType<MonitoringMetrics['snapshot']>,
): string[] {
  const alerts: string[] = [];
  if (!readiness || readiness.status !== 'healthy') alerts.push('READINESS_UNHEALTHY');
  if (!readiness || readiness.dependencies.redis !== 'healthy') alerts.push('REDIS_UNAVAILABLE');
  if (!crm || !inventory) alerts.push('QUEUE_STATUS_UNAVAILABLE');
  if ((crm?.deadLetter ?? 0) > 0) alerts.push('CRM_DEAD_LETTER');
  if ((inventory?.deadLetter ?? 0) > 0) alerts.push('INVENTORY_DEAD_LETTER');
  if (recent.redisFailures >= 3) alerts.push('REDIS_REPEATED_FAILURE');
  if (recent.crmFailures >= 3) alerts.push('CRM_REPEATED_FAILURE');
  if (recent.inventoryFailures >= 3) alerts.push('INVENTORY_REPEATED_FAILURE');
  if (recent.requests >= 20 && recent.errors5xx >= 5 && recent.errors5xx / recent.requests >= 0.05) alerts.push('HTTP_5XX_SPIKE');
  if (recent.requests >= 20 && recent.slow >= 10 && recent.slow / recent.requests >= 0.2) alerts.push('HTTP_HIGH_LATENCY');
  if (recent.fatal) alerts.push('PROCESS_FATAL');
  return alerts;
}

let previousAlerts = '';
export async function getMonitoringStatus() {
  const [readiness, crm, inventory] = await Promise.all([probes.readiness(), probes.crm(), probes.inventory()]);
  const recent = monitoringMetrics.snapshot();
  const alerts = alertConditions(readiness, crm, inventory, recent);
  const key = alerts.join(',');
  if (key !== previousAlerts) {
    previousAlerts = key;
    logStructured(alerts.length ? 'error' : 'info', 'monitoring', 'alerts.transition',
      alerts.length ? 'alerting' : 'recovered', 'Monitoring alert state changed',
      { code: alerts.length ? 'MONITORING_ALERT' : 'OK', alerts });
  }
  return {
    status: alerts.length ? 'alerting' : 'healthy', uptimeSeconds: Math.floor(process.uptime()),
    readiness: readiness ? { status: readiness.status, dependencies: {
      database: readiness.dependencies.database, redis: readiness.dependencies.redis,
    } } : null,
    crm: crm ? { running: Boolean(crm.running), success: count(crm.success), failures: count(crm.failures),
      retries: count(crm.retries), deadLetter: count(crm.deadLetter) } : null,
    inventory: inventory ? { ready: count(inventory.ready), processing: count(inventory.processing),
      success: count(inventory.success), failures: count(inventory.failures), retries: count(inventory.retries),
      deadLetter: count(inventory.deadLetter) } : null,
    recent, alerts,
  };
}
