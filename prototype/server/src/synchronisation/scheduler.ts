// node-cron schedule inside the Express process (FR-ADM-03): no administrator action is needed.
import cron, { type ScheduledTask } from 'node-cron';
import { config } from '../config.js';
import { needsStartupSync, syncAll } from './pipeline.js';
import { sanitiseError } from '../lib/http.js';

let task: ScheduledTask | null = null;

export function startScheduler() {
  if (!cron.validate(config.sync.cron)) throw new Error(`Invalid SYNC_CRON expression: ${config.sync.cron}`);
  const report = (error: unknown) => console.error('[sync] Automatic check failed:', sanitiseError(error));
  task = cron.schedule(config.sync.cron, () => void syncAll('SCHEDULE').catch(report), { timezone: config.sync.timezone, name: 'famplan-sync' });
  console.log(`[sync] scheduled "${config.sync.cron}" (${config.sync.timezone})`);
  if (config.sync.onStartup)
    void needsStartupSync().then((due) => {
      if (due) {
        console.log('[sync] a source is due (never run or older than 24 h) — starting synchronisation');
        return syncAll('STARTUP');
      }
    }).catch(report);
}

export function nextRunAt(): Date | null {
  const t = task as unknown as { getNextRun?: () => Date | null } | null;
  return t?.getNextRun?.() ?? null;
}
