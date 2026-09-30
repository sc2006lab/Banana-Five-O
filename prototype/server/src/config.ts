// Environment configuration. Secrets stay in environment variables and are never logged.
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3001),
  isProduction: env.NODE_ENV === 'production',
  // Serve behind TLS: secure cookies, HSTS, and HTTP→HTTPS redirects (NFR-SEC-01). Defaults on in production.
  https: (env.HTTPS ?? (env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  isTest: env.NODE_ENV === 'test' || env.VITEST === 'true',
  appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
  sessionTtlHours: 12,
  resetTokenTtlMinutes: 30,
  sync: {
    cron: env.SYNC_CRON ?? '0 4 * * *',
    timezone: 'Asia/Singapore',
    onStartup: (env.SYNC_ON_STARTUP ?? 'true') === 'true',
    failSources: (env.SYNC_FAIL_SOURCES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  },
  onemap: {
    email: env.ONEMAP_EMAIL ?? '',
    password: env.ONEMAP_PASSWORD ?? '',
  },
  mail: {
    smtpUrl: env.SMTP_URL ?? '',
    from: env.MAIL_FROM ?? 'FamPlan <no-reply@famplan.local>',
  },
};
