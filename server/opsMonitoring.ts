import nodemailer from 'nodemailer';
import { logger } from './utils/logger';

const PROCESS_START = Date.now();

const _registeredCrons = new Set<string>();

export function registerCronJob(name: string): void {
  _registeredCrons.add(name);
}

export function getCronCount(): number {
  return _registeredCrons.size;
}

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - PROCESS_START) / 1000);
}

const WINDOW_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;

const errorWindow: Array<{ ts: number; message: string; route: string }> = [];
let lastAlertSentAt = 0;
let _cachedOpsEmail: string | null = null;

export interface ErrorSpikeState {
  countInWindow: number;
  windowMinutes: number;
  threshold: number;
  lastAlertSentAt: number | null;
  cooldownMinutes: number;
}

export function getErrorSpikeState(): ErrorSpikeState {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const active = errorWindow.filter(e => e.ts >= cutoff);
  const threshold = parseInt(process.env.OPS_ERROR_ALERT_THRESHOLD || '10', 10);
  return {
    countInWindow: active.length,
    windowMinutes: 5,
    threshold,
    lastAlertSentAt: lastAlertSentAt > 0 ? lastAlertSentAt : null,
    cooldownMinutes: 30,
  };
}

export function recordError(message: string, route: string): void {
  const now = Date.now();
  errorWindow.push({ ts: now, message, route });
  const cutoff = now - WINDOW_MS;
  while (errorWindow.length > 0 && errorWindow[0].ts < cutoff) errorWindow.shift();

  const threshold = parseInt(process.env.OPS_ERROR_ALERT_THRESHOLD || '10', 10);
  if (errorWindow.length >= threshold && now - lastAlertSentAt > COOLDOWN_MS) {
    lastAlertSentAt = now;
    const recent = errorWindow.slice(-10);
    const counts: Record<string, number> = {};
    for (const e of recent) {
      const key = `${e.route}: ${e.message}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const top3 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    sendOpsAlertEmail({
      count: errorWindow.length,
      windowMinutes: 5,
      top3,
      startedAt: new Date(PROCESS_START).toISOString(),
    }).catch(err => logger.warn('[OpsMonitoring] Failed to send spike alert:', err?.message));
  }
}

async function getOpsEmail(): Promise<string | null> {
  if (_cachedOpsEmail !== null) return _cachedOpsEmail || null;
  const envEmail = process.env.OPS_ALERT_EMAIL;
  if (envEmail) {
    _cachedOpsEmail = envEmail;
    return envEmail;
  }
  _cachedOpsEmail = process.env.SMTP_USER || null;
  return _cachedOpsEmail || null;
}

async function sendOpsAlertEmail(opts: {
  count: number;
  windowMinutes: number;
  top3: string[];
  startedAt: string;
}): Promise<void> {
  const to = await getOpsEmail();
  if (!to) {
    logger.warn('[OpsMonitoring] No ops alert email configured (set OPS_ALERT_EMAIL env var)');
    return;
  }
  const from = process.env.SMTP_USER || 'noreply@tprmax.com';
  const subject = `[TPR Max] Error spike alert — ${opts.count} errors in ${opts.windowMinutes} min`;
  const text = [
    `TPR Max has detected an error spike.`,
    ``,
    `Count: ${opts.count} unhandled 5xx errors in the last ${opts.windowMinutes} minutes`,
    `Threshold: ${process.env.OPS_ERROR_ALERT_THRESHOLD || '10'}`,
    `Server started: ${opts.startedAt}`,
    ``,
    `Top error messages:`,
    ...opts.top3.map((e, i) => `  ${i + 1}. ${e}`),
    ``,
    `No further alerts will be sent for 30 minutes.`,
    ``,
    `This is an automated message from TPR Max operations monitoring.`,
  ].join('\n');

  try {
    const sgKey = process.env.SENDGRID_API_KEY;
    if (sgKey) {
      const sgMail = (await import('@sendgrid/mail')).default;
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to, from, subject, text });
      logger.info(`[OpsMonitoring] Spike alert sent via SendGrid to ${to}`);
      return;
    }
  } catch (sgErr: any) {
    logger.warn('[OpsMonitoring] SendGrid alert failed, falling back to SMTP:', sgErr?.message);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from, to, subject, text });
    logger.info(`[OpsMonitoring] Spike alert sent via SMTP to ${to}`);
  } catch (smtpErr: any) {
    logger.warn('[OpsMonitoring] SMTP alert failed:', smtpErr?.message);
  }
}

export async function sendStartupEmail(): Promise<void> {
  if (process.env.OPS_STARTUP_EMAIL !== 'true') return;
  const to = await getOpsEmail();
  if (!to) return;
  const from = process.env.SMTP_USER || 'noreply@tprmax.com';
  const subject = `[TPR Max] Server started at ${new Date().toISOString()}`;
  const text = [
    `TPR Max server has started.`,
    ``,
    `Start time: ${new Date().toISOString()}`,
    `Environment: ${process.env.NODE_ENV || 'development'}`,
    ``,
    `This email is sent on every startup (OPS_STARTUP_EMAIL=true).`,
    `Frequent emails may indicate a crash-loop.`,
  ].join('\n');

  try {
    const sgKey = process.env.SENDGRID_API_KEY;
    if (sgKey) {
      const sgMail = (await import('@sendgrid/mail')).default;
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to, from, subject, text });
      return;
    }
  } catch { }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from, to, subject, text });
    logger.info(`[OpsMonitoring] Startup email sent to ${to}`);
  } catch (err: any) {
    logger.warn('[OpsMonitoring] Startup email failed:', err?.message);
  }
}
